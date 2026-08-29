/**
 * End-to-end tests for the spawn-timer **flow**: raw log text in, a board on screen out.
 *
 * Everything else about this feature is tested per box — `spawn-timers.test.ts` for the rules,
 * `spawn-tracker.test.ts` for the holder. Both talk to the tracker directly, which is right for
 * pinning rules and blind to the thing that actually breaks a feature: the *joins*. So this one
 * starts where the app starts — a string of log lines — and runs them through the same path
 * `main.ts` does (`splitLine` → `parseSplitLine` → `killLog.record` → `spawns.noteKill`), then
 * reads `view()` as the panel would.
 *
 * It exists because the project's own replay fixture (`fixtures/sample-eqlog.txt`) contains **no
 * named kills at all** — every mob in it carries an article — so the log everyone tests with
 * exercises none of this. A feature whose only evidence is its own unit tests is a feature nobody
 * has watched work.
 *
 * The cases are the ways players actually arrive at it:
 *   1. **the camper** — sits down, kills it twice, gets a timer for free;
 *   2. **the arriver** — walks up to a camp already in progress, with nothing on the board;
 *   3. **the refiner** — camps a placeholder, sees the figure disagree with itself, and corrects it;
 *   4. **the camp that fights back** — the named kills the pet and the group-mate, whose deaths are
 *      written exactly like a named's own ([ADR 0138](../../specs/decisions/0138-a-replayed-log-narrows-what-a-kill-proves.md)).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { splitLine } from "../../src/shared/log-parser";
import { parseSplitLine } from "../../src/shared/parse-line";
import { createKillLog } from "../kill-log";
import { createSpawnTracker, type SpawnTracker } from "../spawn-tracker";
import { timerKey } from "../../src/shared/spawn-timers";
import type { CastAlertEvent, CastAlertSettings, SpawnView } from "../../src/shared/types";

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "eql-flow-"));

/** EQ's own timestamp format, which is what the parser has to read. */
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

function stamp(atMs: number): string {
  const d = new Date(atMs);
  return `[${DOW[d.getDay()]} ${MON[d.getMonth()]} ${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getFullYear()}]`;
}

/**
 * The app, as far as this feature is concerned: a kill log, a spawn tracker, a clock we control,
 * and the zone tracking `main.ts` does between them.
 *
 * Wired exactly as main does it, including the ordering that matters — the kill is **recorded
 * before** the tracker is told, because the tracker learns from the log and the kill that starts a
 * countdown has to already be in it.
 */
function app(startMs: number) {
  const dir = tempDir();
  const killLog = createKillLog(dir);
  const raised: CastAlertEvent[] = [];
  let nowMs = startMs;
  let sweep: (() => void) | null = null;
  let currentZone: string | null = null;

  const spawns: SpawnTracker = createSpawnTracker({
    userDataDir: dir,
    kills: () => killLog.kills(),
    getSettings: () => ({ enabled: true }) as CastAlertSettings,
    raise: (a) => raised.push(a),
    now: () => nowMs,
    setInterval: (fn) => {
      sweep = fn;
      return 1;
    },
    clearInterval: () => {
      sweep = null;
    },
  });

  /** Feed raw log text through the real parsers, exactly as the watcher would. */
  function feed(text: string): void {
    let logId = 1;
    for (const raw of text.split("\n")) {
      const line = splitLine(raw, logId);
      if (!line) continue;
      logId += 1;
      // The clock moves *before* the line is handled: a line's own timestamp is the moment it
      // happened, and anything reading `now()` while handling it — a sighting measuring how long
      // since the kill, a timer deciding whether it is already due — must see that moment rather
      // than the one before it.
      const at = Date.parse(line.at);
      if (!Number.isNaN(at)) nowMs = at;
      const event = parseSplitLine(line);
      if (!event) continue;
      if (event.kind === "zone") {
        // Before `currentZone` moves, exactly as main does it: the tracker compares where you were
        // with where you are, and a difficulty change is a different *variant* of the same zone.
        spawns.noteZone(event.zone);
        currentZone = event.zone;
      }
      if (event.kind === "loc") killLog.noteLoc(event, currentZone);
      // Considering or hailing a mob you're timing is a free sighting (ADR 0097).
      if (event.kind === "sighting") spawns.noteSighting(event.target, currentZone);
      if (event.kind === "kill") {
        // Main's order, and it is load-bearing: record first, then tell the tracker.
        if (killLog.record(event.target, event.killer, currentZone, event.at, event.logId, event.named, event.killerNamed)) {
          spawns.noteKill(event.target, currentZone, event.at, event.named);
        }
      }
    }
  }

  return {
    spawns,
    raised,
    feed,
    /** Move the wall clock on and run the sweep the interval would have run. */
    tick(ms: number) {
      nowMs = ms;
      sweep?.();
    },
    at: () => nowMs,
    view: () => spawns.view(),
  };
}

/** A kill line as EQL writes it. `named` decides whether the mob gets an article. */
const slain = (atMs: number, mob: string) => `${stamp(atMs)} ${mob} has been slain by you!`;
const entered = (atMs: number, zone: string) => `${stamp(atMs)} You have entered ${zone}.`;

const T0 = Date.parse("2026-08-17T19:00:00");
const MIN = 60_000;
const rowFor = (view: SpawnView, mob: string) => view.known.find((k) => k.mob === mob);

// ── Use case 1: the camper ─────────────────────────────────────────────────────
// Sits down at a named, kills it, kills it again. Wants a timer without configuring anything.

test("flow: the camper gets a timer for free, and a banner without asking for one", () => {
  const a = app(T0);
  a.feed(
    [
      entered(T0, "Lower Guk"),
      slain(T0 + 2 * MIN, "Ghoul Lord"),
      // ...20 minutes of camping, then it's back and dead again.
      slain(T0 + 22 * MIN, "Ghoul Lord"),
    ].join("\n"),
  );

  const view = a.view();
  assert.equal(view.known.length, 1, "one named learned, and nothing else from the log");
  const row = rowFor(view, "Ghoul Lord");
  assert.equal(row?.place, "Lower Guk");
  assert.equal(row?.respawn?.seconds, 20 * 60, "the gap between the two kills");
  assert.equal(row?.respawn?.source, "killed");
  assert.equal(view.running.length, 1, "and it's already counting down");
  assert.equal(view.running[0].dueAt, new Date(T0 + 42 * MIN).toISOString());

  // Two kills of one camp in one sitting *is* the camper asking (ADR 0152): they are visibly sitting
  // there, and making them tick a box for it is the app being obtuse. It says who armed it, because
  // an alert that turns itself on without accounting for itself is a banner out of nowhere.
  assert.equal(row?.notify, true);
  assert.equal(row?.armed, true);
  a.tick(T0 + 42 * MIN);
  assert.equal(a.raised.length, 1, "so the pop speaks");
  assert.equal(a.raised[0].event, "spawn");

  // And the player still has the last word. Off is an answer, not an absence: however long they go
  // on camping it, nothing arms it again.
  const key = timerKey("Ghoul Lord", "Lower Guk");
  a.spawns.notify(key, false);
  a.spawns.markDead(key); // killed it again, now
  a.tick(a.at() + 20 * MIN + 1000);
  assert.equal(a.raised.length, 1, "still just the one — they turned it off");
  assert.equal(rowFor(a.view(), "Ghoul Lord")?.armed, false, "and it stops explaining itself");
});

test("flow: one kill is passing through, and stays silent", () => {
  // The other half of the rule, and the reason it is two rather than one: a named you killed on the
  // way past is exactly what `notify` being off by default exists for.
  const a = app(T0);
  a.feed([entered(T0, "Lower Guk"), slain(T0 + 2 * MIN, "Ghoul Lord")].join("\n"));
  assert.equal(rowFor(a.view(), "Ghoul Lord")?.notify, false);
  a.tick(T0 + 60 * MIN);
  assert.equal(a.raised.length, 0);
});

test("flow: the camper's trash kills never reach the board", () => {
  const a = app(T0);
  a.feed(
    [
      entered(T0, "Lower Guk"),
      slain(T0 + 1 * MIN, "a froglok tad"),
      slain(T0 + 6 * MIN, "a froglok tad"),
      slain(T0 + 11 * MIN, "an undead knight"),
      slain(T0 + 16 * MIN, "an undead knight"),
    ].join("\n"),
  );
  // Every one of these carries an article, so none is a named and none is timed. Without this the
  // board fills with a camp's worth of identical spawns and the feature is unusable.
  assert.deepEqual(a.view().known, []);
  assert.deepEqual(a.view().running, []);
});

// ── The game's own decorations on a considered name (ADR 0153) ────────────────

/** A consider line, as EQ writes one. */
const considered = (atMs: number, name: string) =>
  `${stamp(atMs)} ${name} glares at you threateningly -- what would you like your tombstone to say? (Lvl: 12)`;

test("flow: considering a rare creature counts as seeing it", () => {
  // EQ hangs `- a rare creature -` between the name and the regard. Left on, the sighting named a mob
  // nothing had ever killed, found no camp, and was dropped — 34 times in one real log, every one of
  // them a mob worth timing.
  const a = app(T0);
  a.feed(
    [
      entered(T0, "Lower Guk"),
      slain(T0 + 2 * MIN, "Ghoul Lord"),
      slain(T0 + 22 * MIN, "Ghoul Lord"),
      // ...it comes back, and the camper does what a camper does: looks at it before pulling.
      considered(T0 + 38 * MIN, "Ghoul Lord - a rare creature -"),
    ].join("\n"),
  );
  const timer = a.view().running.find((t) => t.mob === "Ghoul Lord");
  assert.ok(timer?.seenAt, "the sighting never reached the camp");
  assert.equal(timer?.state, "alive");
  // And it is evidence, not just an end to the countdown: seen 16 minutes after it died.
  const row = rowFor(a.view(), "Ghoul Lord");
  assert.equal(row?.respawn?.source, "seen");
  assert.equal(row?.respawn?.seconds, 16 * 60);
});

test("flow: the plain consider still works, and a bare decoration names nothing", () => {
  const a = app(T0);
  a.feed(
    [entered(T0, "Lower Guk"), slain(T0 + 2 * MIN, "Ghoul Lord"), slain(T0 + 22 * MIN, "Ghoul Lord"),
     considered(T0 + 38 * MIN, "Ghoul Lord")].join("\n"),
  );
  assert.ok(a.view().running.find((t) => t.mob === "Ghoul Lord")?.seenAt);

  // A line that is nothing *but* the decoration is not a mob, and must not be read as one.
  const b = app(T0);
  b.feed([entered(T0, "Lower Guk"), considered(T0 + 1 * MIN, "- a rare creature -")].join("\n"));
  assert.deepEqual(b.view().running, []);
});

// ── Use case 2: the arriver ────────────────────────────────────────────────────
// Turns up to a camp already in progress, or killed it before the app was watching. Nothing is on
// the board and there is nothing to learn from yet.

test("flow: the arriver adds the mob by hand and starts its clock", () => {
  const a = app(T0);
  a.feed(entered(T0, "Lower Guk"));

  // Told "it's on a 20 minute timer, we killed it 5 minutes ago".
  const key = a.spawns.add("Ghoul Lord", "Lower Guk", 20 * 60);
  assert.ok(key);
  a.spawns.markDead(key!);

  const view = a.view();
  assert.equal(view.known.length, 1);
  assert.equal(rowFor(view, "Ghoul Lord")?.added, true);
  assert.equal(view.running[0].source, "stated");
  assert.equal(view.running[0].dueAt, new Date(T0 + 20 * MIN).toISOString());
});

test("flow: the arriver's hand-typed camp is taken over by the log once it has seen enough", () => {
  const a = app(T0);
  a.feed(entered(T0, "Lower Guk"));
  a.spawns.add("Ghoul Lord", "Lower Guk", 20 * 60);

  // Now they actually play it, and the log measures a *tighter* interval than they were told.
  a.feed([slain(T0 + 5 * MIN, "Ghoul Lord"), slain(T0 + 20 * MIN, "Ghoul Lord")].join("\n"));

  const row = rowFor(a.view(), "Ghoul Lord");
  assert.equal(a.view().known.length, 1, "still one row — the hand-added one, now with kills behind it");
  assert.equal(row?.shortestSeconds, 15 * 60, "the log learned 15m");
  assert.equal(row?.respawn?.seconds, 20 * 60, "but what you typed still wins");
  assert.equal(row?.respawn?.source, "stated");
});

test("flow: a custom timer is a first-class row that no kill will ever disturb", () => {
  const a = app(T0);
  a.feed(entered(T0, "Butcherblock Mountains"));
  const key = a.spawns.add("Boat to Freeport", "", 22 * 60);
  a.spawns.markDead(key!);
  assert.equal(a.view().running[0].mob, "Boat to Freeport");
  assert.equal(a.view().running[0].place, "");

  // A whole evening of killing goes by and the boat is untouched by any of it.
  a.feed([slain(T0 + 3 * MIN, "a dwarf miner"), slain(T0 + 8 * MIN, "Gnome Mechanic")].join("\n"));
  assert.equal(a.view().running.find((t) => t.mob === "Boat to Freeport")?.seconds, 22 * 60);
});

// ── Use case 3: the refiner ────────────────────────────────────────────────────
// Camps a named that sits on a placeholder. The gaps disagree, and the figure has to say so — then
// a sighting corrects it far faster than more kills could.

test("flow: a placeholder camp produces gaps that disagree, and the row admits it", () => {
  const a = app(T0);
  a.feed(
    [
      entered(T0, "Lower Guk"),
      // Three kills of the named across a placeholder cycle: 18m, then 54m (three PH pops).
      slain(T0 + 2 * MIN, "Ghoul Lord"),
      slain(T0 + 20 * MIN, "Ghoul Lord"),
      slain(T0 + 74 * MIN, "Ghoul Lord"),
    ].join("\n"),
  );

  const row = rowFor(a.view(), "Ghoul Lord");
  assert.equal(row?.shortestSeconds, 18 * 60);
  assert.equal(row?.longestSeconds, 54 * 60);
  // 54m is more than 1.5× 18m, so the figure leads with the range and warns rather than claiming 18m.
  assert.match(describe(row?.respawn), /18m–54m/);
  assert.match(caveatOf(a.view(), "Ghoul Lord"), /placeholder/);
});

test("flow: spotting it up beats any number of kills, and the row switches to that evidence", () => {
  const a = app(T0);
  a.feed([entered(T0, "Lower Guk"), slain(T0 + 2 * MIN, "Ghoul Lord"), slain(T0 + 20 * MIN, "Ghoul Lord")].join("\n"));
  const key = timerKey("Ghoul Lord", "Lower Guk");
  assert.equal(rowFor(a.view(), "Ghoul Lord")?.respawn?.seconds, 18 * 60);

  // Sat there watching, and it popped 9 minutes after they killed it.
  a.tick(T0 + 29 * MIN);
  a.spawns.markUp(key);

  const row = rowFor(a.view(), "Ghoul Lord");
  assert.equal(row?.respawn?.seconds, 9 * 60, "half what the kill gaps claimed");
  assert.equal(row?.respawn?.source, "seen");
  assert.equal(a.view().running[0].state, "alive", "and the board says it's up, not that it might be");
});

test("flow: the refiner pads a wanderer, and is warned before it is due", () => {
  const a = app(T0);
  a.feed([entered(T0, "Lower Guk"), slain(T0 + 2 * MIN, "Ghoul Lord"), slain(T0 + 20 * MIN, "Ghoul Lord")].join("\n"));
  const key = timerKey("Ghoul Lord", "Lower Guk");
  a.spawns.notify(key, true);
  a.spawns.pad(key, 3 * 60); // it walks; start watching three minutes early

  const timer = a.view().running[0];
  assert.equal(timer.dueAt, new Date(T0 + 38 * MIN).toISOString(), "the evidence hasn't moved");
  assert.equal(timer.watchFrom, new Date(T0 + 35 * MIN).toISOString());

  a.tick(T0 + 35 * MIN);
  assert.equal(a.raised.length, 1, "warned at the window, not at the by-time");
  assert.match(a.raised[0].message ?? "", /due soon/);
  assert.equal(a.view().running[0].state, "window");
});

/** The row's figure as the panel would word it — imported lazily to keep the flow readable. */
function describe(respawn: NonNullable<ReturnType<typeof rowFor>>["respawn"]): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { describeRespawn } = require("../../src/shared/spawn-timers");
  return respawn ? describeRespawn(respawn) : "";
}

function caveatOf(view: SpawnView, mob: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { respawnCaveat } = require("../../src/shared/spawn-timers");
  const respawn = view.known.find((k) => k.mob === mob)?.respawn;
  return respawn ? (respawnCaveat(respawn) ?? "") : "";
}

// ── What else dies in earshot ──────────────────────────────────────────────────
// The log reports every death nearby, not just mobs you fought — and the article test that
// identifies a named says nothing about *what kind of thing* died. A player and a boss are both
// written without one.

test("flow: another player dying in earshot is not a named", () => {
  const a = app(T0);
  a.feed(
    [
      entered(T0, "Lower Guk"),
      `${stamp(T0 + 1 * MIN)} Bunnyslayer has been slain by a froglok shaman!`,
      `${stamp(T0 + 9 * MIN)} Bunnyslayer has been slain by a froglok shaman!`,
    ].join("\n"),
  );
  assert.deepEqual(
    a.view().known.map((k) => k.mob),
    [],
    "a player's corpse is not a camp, and their deaths are not a respawn timer",
  );
});

test("flow: your own pet dying is not a named", () => {
  const a = app(T0);
  a.feed(
    [
      entered(T0, "Lower Guk"),
      "[Mon Aug 17 19:01:00 2026] Kainos`s warder has been slain by a froglok shaman!",
      "[Mon Aug 17 19:09:00 2026] Kainos`s warder has been slain by a froglok shaman!",
    ].join("\n"),
  );
  assert.deepEqual(a.view().known.map((k) => k.mob), []);
});

test("flow: a named killed by someone else is still a named", () => {
  const a = app(T0);
  a.feed(
    [
      entered(T0, "Lower Guk"),
      `${stamp(T0 + 1 * MIN)} Ghoul Lord has been slain by Someguy!`,
      `${stamp(T0 + 21 * MIN)} Ghoul Lord has been slain by Someguy!`,
    ].join("\n"),
  );
  // A mob dying is evidence of when it died whoever swung — that's the deliberate difference from
  // drop rates (ADR 0092), and it must survive whatever excludes the player deaths above.
  assert.equal(rowFor(a.view(), "Ghoul Lord")?.respawn?.seconds, 20 * 60);
});

// ── The watched log ────────────────────────────────────────────────────────────
// Everything above builds its log text inline, which proves the rules and proves nothing about the
// file people actually replay. `fixtures/spawn-camp-eqlog.txt` is an evening at a Lower Guk camp,
// written the way EQL writes one, and it is what `npm run sim -- --from fixtures/spawn-camp-eqlog.txt`
// streams into the app. This reads that very file, so the fixture can't quietly stop exercising the
// feature it exists for.

/** The replay fixture, from the compiled tests' own location (`dist-electron/electron/tests`). */
const CAMP_LOG = path.join(__dirname, "../../../fixtures/spawn-camp-eqlog.txt");

test("watched log: an evening at a camp produces exactly the board it should", () => {
  const a = app(Date.parse("2026-08-17T19:00:00"));
  a.feed(fs.readFileSync(CAMP_LOG, "utf8"));

  const view = a.view();
  const names = view.known.map((k) => k.mob).sort();

  // Two nameds and nothing else. The evening also contains froglok tads, undead knights, a
  // group-mate's kill, and **four deaths on your own side at the hands of the named itself** — two
  // of your pet and two of a group-mate, eighteen minutes apart, which is the exact shape that used
  // to be read as their own respawn (ADR 0138). Every one of them is written in a shape this feature
  // has to *not* mistake for a camp.
  assert.deepEqual(names, ["Frenzied Ghoul", "Ghoul Lord"]);

  // Ghoul Lord: killed at 19:07:44, 19:25:44 and 19:43:44 — two clean 18-minute gaps.
  const lord = rowFor(view, "Ghoul Lord");
  assert.equal(lord?.place, "Lower Guk");
  assert.equal(lord?.samples, 2);
  assert.equal(lord?.shortestSeconds, 18 * 60);
  assert.equal(lord?.longestSeconds, 18 * 60);
  assert.equal(lord?.respawn?.source, "killed");
  assert.equal(caveatOf(view, "Ghoul Lord"), "", "gaps that agree get no warning");

  // Frenzied Ghoul was killed twice by someone else entirely, 16m10s apart — a mob dying is
  // evidence whoever swung, so it is timed exactly the same way.
  const frenzied = rowFor(view, "Frenzied Ghoul");
  assert.equal(frenzied?.samples, 1);
  assert.equal(frenzied?.shortestSeconds, 16 * 60 + 10);

  // And the last kill of each left a countdown running.
  assert.deepEqual(
    view.running.map((t) => t.mob).sort(),
    ["Frenzied Ghoul", "Ghoul Lord"],
  );
});

test("watched log: re-reading it changes nothing, so replaying is safe", () => {
  const a = app(Date.parse("2026-08-17T19:00:00"));
  const text = fs.readFileSync(CAMP_LOG, "utf8");
  a.feed(text);
  const first = JSON.stringify(a.view().known);
  // The same lines again — a re-import, or a log eaten after it was watched live (ADR 0033).
  a.feed(text);
  assert.equal(JSON.stringify(a.view().known), first, "a replayed log must not double its evidence");
});

// ── Looking at it counts ───────────────────────────────────────────────────────
// You consider a named before you pull it, and you hail one to see if it talks. Both say the same
// useful thing — it is in front of you, alive — so both are free sightings.

test("flow: considering a mob you're timing counts as seeing it up", () => {
  const a = app(T0);
  a.feed([entered(T0, "Lower Guk"), slain(T0 + 2 * MIN, "Ghoul Lord"), slain(T0 + 20 * MIN, "Ghoul Lord")].join("\n"));
  assert.equal(rowFor(a.view(), "Ghoul Lord")?.respawn?.seconds, 18 * 60);

  // Nine minutes later it's back, and the camper cons it before pulling.
  a.feed(`${stamp(T0 + 29 * MIN)} Ghoul Lord glares at you threateningly -- looks kind of dangerous.`);

  const row = rowFor(a.view(), "Ghoul Lord");
  assert.equal(row?.respawn?.seconds, 9 * 60, "half what the kill gaps claimed, learned for free");
  assert.equal(row?.respawn?.source, "seen");
  assert.equal(a.view().running[0].state, "alive");
});

test("flow: hailing it counts too", () => {
  const a = app(T0);
  a.feed([entered(T0, "Lower Guk"), slain(T0 + 2 * MIN, "Ghoul Lord"), slain(T0 + 20 * MIN, "Ghoul Lord")].join("\n"));
  a.feed(`${stamp(T0 + 30 * MIN)} You say, 'Hail, Ghoul Lord'`);
  assert.equal(a.view().running[0].state, "alive");
  assert.equal(rowFor(a.view(), "Ghoul Lord")?.respawn?.source, "seen");
});

test("flow: considering things you are not timing changes nothing", () => {
  const a = app(T0);
  a.feed([entered(T0, "Lower Guk"), slain(T0 + 2 * MIN, "Ghoul Lord"), slain(T0 + 20 * MIN, "Ghoul Lord")].join("\n"));
  // Everything except the clock, which moves with the log whatever happens.
  const board = () => JSON.stringify({ running: a.view().running, known: a.view().known });
  const before = board();
  a.feed(
    [
      // A camper cons half the room on the way to the camp. None of it is a mob with a timer, and
      // none of it may put a row on the board or touch one.
      `${stamp(T0 + 22 * MIN)} a froglok tad regards you indifferently -- this opponent looks like an even fight.`,
      `${stamp(T0 + 23 * MIN)} Someguy kindly considers you -- what would you like your tombstone to say?`,
      `${stamp(T0 + 24 * MIN)} You say, 'Hail, a guard'`,
    ].join("\n"),
  );
  assert.equal(board(), before);
});

test("flow: a sentence that merely contains a dash is not a consider", () => {
  const a = app(T0);
  a.feed([entered(T0, "Lower Guk"), slain(T0 + 2 * MIN, "Ghoul Lord"), slain(T0 + 20 * MIN, "Ghoul Lord")].join("\n"));
  a.feed(`${stamp(T0 + 25 * MIN)} Someguy tells the group, 'Ghoul Lord -- up now?'`);
  // The regard vocabulary is what makes this safe: matching "anything before a --" would have read
  // chat as a sighting, and a sighting can only ever tighten a figure.
  assert.notEqual(a.view().running[0].state, "alive");
});


// ── Changing the instance difficulty ───────────────────────────────────────────
// It respawns everything, and the log reports it as arriving in a different *variant* of the zone
// you were already in — which every folded view of a zone deliberately calls the same place.

test("flow: a difficulty change is not a fast respawn", () => {
  const a = app(T0);
  a.feed(
    [
      entered(T0, "Lower Guk"),
      slain(T0 + 2 * MIN, "Ghoul Lord"),
      slain(T0 + 20 * MIN, "Ghoul Lord"),
      // Difficulty bumped: everything repops, and it dies again five minutes later.
      entered(T0 + 22 * MIN, "Lower Guk 2"),
      slain(T0 + 25 * MIN, "Ghoul Lord"),
    ].join("\n"),
  );

  const row = rowFor(a.view(), "Ghoul Lord");
  assert.equal(row?.shortestSeconds, 18 * MIN / 1000, "the 5m across the change taught nothing");
  assert.equal(row?.samples, 1);
  // It is still one camp — Lower Guk is Lower Guk — which is exactly why the gap had to be caught
  // rather than left to separate itself.
  assert.equal(a.view().known.length, 1);
  assert.equal(row?.place, "Lower Guk");
});

test("flow: a difficulty change clears the countdown it invalidated", () => {
  const a = app(T0);
  a.feed(
    [
      entered(T0, "Lower Guk"),
      slain(T0 + 2 * MIN, "Ghoul Lord"),
      slain(T0 + 20 * MIN, "Ghoul Lord"),
    ].join("\n"),
  );
  assert.equal(a.view().running.length, 1, "counting down from the kill at 20m");
  a.feed(entered(T0 + 22 * MIN, "Lower Guk 2"));
  assert.equal(a.view().running.length, 0, "that death has been undone; the clock means nothing");
});

test("flow: leaving the zone and coming back is not a difficulty change", () => {
  const a = app(T0);
  a.feed(
    [
      entered(T0, "Lower Guk"),
      slain(T0 + 2 * MIN, "Ghoul Lord"),
      slain(T0 + 20 * MIN, "Ghoul Lord"),
      entered(T0 + 22 * MIN, "Upper Guk"),
      entered(T0 + 30 * MIN, "Lower Guk"),
    ].join("\n"),
  );
  assert.equal(a.view().running.length, 1, "a mob keeps respawning while you are elsewhere");
});

// ── Use case 4: the camp where the named fights back ──────────────────────────
// Found by replaying a log rather than by reasoning. `named` + `killerNamed` was meant to read "a
// person killed a named" — but **a named killing your pet or your group-mate fits it exactly**,
// because a named has no article either. A replayed evening put `Kainos`s warder` and a group-mate
// on the board, each with a learned twenty-minute respawn.

/** A death where the *mob* did the killing, which is how the log writes your side losing. */
const slainBy = (atMs: number, victim: string, killer: string) =>
  `${stamp(atMs)} ${victim} has been slain by ${killer}!`;

test("flow: a pet killed twice by the named is not a named", () => {
  const a = app(T0);
  a.feed(
    [
      entered(T0, "Lower Guk"),
      slainBy(T0 + 2 * MIN, "Kainos`s warder", "Ghoul Lord"),
      slainBy(T0 + 22 * MIN, "Kainos`s warder", "Ghoul Lord"),
    ].join("\n"),
  );
  assert.equal(rowFor(a.view(), "Kainos`s warder"), undefined, "the log's possessive says whose it is");
  assert.equal(a.view().running.length, 0);
});

test("flow: a group-mate the log has seen killing something is not a named either", () => {
  const a = app(T0);
  a.feed(
    [
      entered(T0, "Lower Guk"),
      // One trash kill of theirs is all it takes: a thing that kills mobs is a person.
      `${stamp(T0 + 1 * MIN)} a froglok tad has been slain by Bunnyslayer!`,
      slainBy(T0 + 5 * MIN, "Bunnyslayer", "Ghoul Lord"),
      slainBy(T0 + 25 * MIN, "Bunnyslayer", "Ghoul Lord"),
    ].join("\n"),
  );
  assert.equal(rowFor(a.view(), "Bunnyslayer"), undefined);
  assert.equal(a.view().running.length, 0, "a group-mate dying twice at a camp is not a respawn");
});

test("flow: and the named they were both killed by is still learned normally", () => {
  const a = app(T0);
  a.feed(
    [
      entered(T0, "Lower Guk"),
      `${stamp(T0 + 1 * MIN)} a froglok tad has been slain by Bunnyslayer!`,
      slainBy(T0 + 5 * MIN, "Kainos`s warder", "Ghoul Lord"),
      slainBy(T0 + 6 * MIN, "Bunnyslayer", "Ghoul Lord"),
      // ...and then it dies, twice, to the group it beat up.
      slain(T0 + 8 * MIN, "Ghoul Lord"),
      slain(T0 + 28 * MIN, "Ghoul Lord"),
    ].join("\n"),
  );
  const view = a.view();
  assert.deepEqual(
    view.known.map((k) => k.mob),
    ["Ghoul Lord"],
    "one row, and it is the mob that was actually camped",
  );
  assert.equal(rowFor(view, "Ghoul Lord")?.respawn?.seconds, 20 * 60);
});

test("flow: a bystander killing a named still teaches, since only the victim is in question", () => {
  const a = app(T0);
  a.feed(
    [
      entered(T0, "Lower Guk"),
      // Someguy kills trash as well, so the people rule knows them — and it must not stop the
      // *named they killed* from being learned. Only a victim is ever excluded by it.
      `${stamp(T0 + 1 * MIN)} an undead knight has been slain by Someguy!`,
      `${stamp(T0 + 4 * MIN)} Frenzied Ghoul has been slain by Someguy!`,
      `${stamp(T0 + 24 * MIN)} Frenzied Ghoul has been slain by Someguy!`,
    ].join("\n"),
  );
  assert.equal(rowFor(a.view(), "Frenzied Ghoul")?.respawn?.seconds, 20 * 60);
});
