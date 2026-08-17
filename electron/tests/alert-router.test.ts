/**
 * Black-box tests for the whole alert path: a log line in, a banner out.
 *
 * These are the tests the pipeline couldn't have while it lived in `main.ts` — the pieces were each
 * covered, and the *order they run in* wasn't, which is where the interesting rules are. Three of
 * them are only visible from here: a death cancels before anything else happens, a line is offered
 * for cancelling **before** it's matched, and the banner carries the wording and the look resolved at
 * the moment it matched rather than whatever the settings say later.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAlertRouter, sampleAlert } from "../alert-router";
import type { Timers } from "../alert-queue";
import { splitLine } from "../../src/shared/log-parser";
import { parseSplitLine } from "../../src/shared/parse-line";
import type {
  CastAlertEvent,
  CastAlertSettings,
  CastWatch,
  CombatEvent,
  HighScoreSettings,
  LogLine,
} from "../../src/shared/types";

/** A hand-cranked clock, so a cue's timing is a fact rather than a wait. */
function fakeTimers() {
  let next = 1;
  let now = 0;
  const due = new Map<number, { fn: () => void; at: number }>();
  const timers: Timers = {
    set: (fn, ms) => {
      const id = next++;
      due.set(id, { fn, at: now + ms });
      return id;
    },
    clear: (handle) => void due.delete(handle as number),
  };
  return {
    timers,
    advance(ms: number) {
      now += ms;
      for (const [id, t] of [...due.entries()].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at > now) continue;
        due.delete(id);
        t.fn();
      }
    },
  };
}

const settings = (watches: CastWatch[], over: Partial<CastAlertSettings> = {}): CastAlertSettings => ({
  enabled: true,
  sound: false,
  flash: false,
  includeSelf: false,
  watches,
  color: "#e5534b",
  soundName: "chirp",
  position: "top",
  durationMs: 6000,
  animation: "pulse",
  locations: [],
  ...over,
});

/** Feed the router real log lines, exactly as the watcher does: `onLine` first, then the typed event. */
function harness(watches: CastWatch[], over: Partial<CastAlertSettings> = {}) {
  const clock = fakeTimers();
  const raised: CastAlertEvent[] = [];
  let alerts = settings(watches, over);
  let zone: string | null = null;
  /** Celebrations on, wearing the alert defaults — what a fresh settings file says (`store.ts`). */
  let scores: HighScoreSettings = { celebrate: true };
  const router = createAlertRouter({
    getSettings: () => alerts,
    getScoreSettings: () => scores,
    getZone: () => zone,
    raise: (a) => raised.push(a),
    timers: clock.timers,
  });
  let id = 0;
  const feed = (raw: string) => {
    const line: LogLine | null = splitLine(raw, ++id);
    if (!line) return;
    // The watcher's own order, which two of the rules below depend on.
    router.line(line);
    const event = parseSplitLine(line);
    if (event && isCombat(event.kind)) router.combat(event as CombatEvent);
  };
  return {
    clock,
    raised,
    router,
    feed,
    setSettings: (next: CastAlertSettings) => (alerts = next),
    setScoreSettings: (next: HighScoreSettings) => (scores = next),
    setZone: (next: string | null) => (zone = next),
  };
}

const COMBAT = new Set(["damage", "miss", "heal", "cast", "spell-outcome", "death", "buff-faded", "stance", "invocation", "pet-engage"]);
const isCombat = (kind: string) => COMBAT.has(kind);

/**
 * A line stamped **now**, in the game's own format. It has to be now: the router matches against the
 * wall clock, and refusing a stale line is one of the rules it inherits.
 */
const line = (text: string) => {
  const d = new Date();
  const [dow, mon, day, year] = d.toDateString().split(" ");
  return `[${dow} ${mon} ${day} ${d.toTimeString().slice(0, 8)} ${year}] ${text}`;
};

// ── the ordinary path ──────────────────────────────────────────────────────────

test("a watched cast raises a banner with the wording and the look resolved", () => {
  const h = harness([{ id: "fear", spell: "Fear", enabled: true, message: "DISPEL", style: { color: "#46c86b" } }]);
  h.feed(line("a gnoll pup begins casting Word of Fear."));
  assert.equal(h.raised.length, 1);
  assert.equal(h.raised[0].event, "cast");
  assert.equal(h.raised[0].caster, "a gnoll pup");
  assert.equal(h.raised[0].message, "DISPEL");
  assert.equal(h.raised[0].style?.color, "#46c86b");
});

test("a fade and a raw line each raise their own kind of banner", () => {
  const h = harness([
    { id: "root", spell: "Root", enabled: true, onCast: false, onFade: true },
    { id: "invite", spell: "invites you", enabled: true, onCast: false, onLine: true },
  ]);
  h.feed(line("Your Root spell has worn off of a wild tiger."));
  h.feed(line("Bunnyslayer invites you to join a group."));
  assert.deepEqual(h.raised.map((a) => a.event), ["fade", "line"]);
  assert.equal(h.raised[0].target, "a wild tiger");
  assert.equal(h.raised[1].text, "Bunnyslayer invites you to join a group.");
});

test("nothing watched raises nothing, and neither does an unwatched line", () => {
  const h = harness([{ id: "fear", spell: "Fear", enabled: true }]);
  h.feed(line("a gnoll pup begins casting Minor Healing."));
  h.feed(line("You have entered Lower Guk."));
  assert.deepEqual(h.raised, []);
});

test("the master switch silences the path without the caller having to check it", () => {
  const h = harness([{ id: "fear", spell: "Fear", enabled: true }], { enabled: false });
  h.feed(line("a gnoll pup begins casting Fear."));
  assert.deepEqual(h.raised, []);
});

// ── the zone, which no line says ───────────────────────────────────────────────

test("a zone condition is judged against where the router is told you are", () => {
  const h = harness([
    { id: "fear", spell: "Fear", enabled: true, conditions: [{ field: "zone", op: "contains", text: "Lower Guk" }] },
  ]);
  h.feed(line("a gnoll pup begins casting Fear."));
  assert.deepEqual(h.raised, []);
  h.setZone("Lower Guk");
  h.feed(line("a gnoll pup begins casting Fear."));
  assert.equal(h.raised.length, 1);
});

// ── order, which is the whole reason this is one module ────────────────────────

test("a cue waits, and its banner is the one that matched", () => {
  const h = harness([{ id: "mez", spell: "Mesmeri", enabled: true, message: "RECAST", delay: "25" }]);
  h.feed(line("a gnoll pup begins casting Mesmerize."));
  // Not `deepEqual(…, [])`: node's assert narrows the value to `never[]` for the rest of the block.
  assert.equal(h.raised.length, 0);
  h.clock.advance(25_000);
  assert.equal(h.raised[0].message, "RECAST");
});

test("your death cancels a short cue — and the meter is never what waits", () => {
  const h = harness([{ id: "mez", spell: "Mesmeri", enabled: true, delay: "25" }]);
  h.feed(line("a gnoll pup begins casting Mesmerize."));
  assert.equal(h.router.pending(), 1);
  h.feed(line("You have been slain by a gnoll pup!"));
  assert.equal(h.router.pending(), 0);
  h.clock.advance(60_000);
  assert.deepEqual(h.raised, []);
});

test("a line cancels a cue before it can match one — the new cue wins over the old", () => {
  // Same words fire the rule *and* cancel it. Cancelling runs first, so what's left waiting is the
  // cue this line raised, not nothing.
  const h = harness([
    {
      id: "ph",
      spell: "a placeholder",
      enabled: true,
      onCast: false,
      onLine: true,
      delay: "8m",
      retrigger: "restart",
      cancelWhen: [{ field: "line", op: "contains", text: "a placeholder" }],
    },
  ]);
  h.feed(line("a placeholder has been slain by Bunnyslayer!"));
  assert.equal(h.router.pending(), 1);
  h.clock.advance(8 * 60_000);
  assert.equal(h.raised.length, 1);
});

test("a cue's brake works through the router, on a line the rule itself ignores", () => {
  const h = harness([
    {
      id: "mez",
      spell: "Mesmeri",
      enabled: true,
      delay: "25",
      cancelWhen: [{ field: "line", op: "contains", text: "has been slain" }],
    },
  ]);
  h.feed(line("a gnoll pup begins casting Mesmerize."));
  h.feed(line("a wild tiger has been slain by Bunnyslayer!"));
  h.clock.advance(60_000);
  assert.deepEqual(h.raised, []);
});

test("a cue carries the look it had when it matched, not the one the settings grew later", () => {
  const watch: CastWatch = { id: "mez", spell: "Mesmeri", enabled: true, delay: "25", style: { color: "#46c86b" } };
  const h = harness([watch]);
  h.feed(line("a gnoll pup begins casting Mesmerize."));
  h.setSettings(settings([{ ...watch, style: { color: "#a371f7" } }]));
  h.clock.advance(25_000);
  assert.equal(h.raised[0].style?.color, "#46c86b");
});

test("switching alerts off drops what was waiting", () => {
  const h = harness([{ id: "mez", spell: "Mesmeri", enabled: true, delay: "25" }]);
  h.feed(line("a gnoll pup begins casting Mesmerize."));
  h.router.clear();
  h.clock.advance(60_000);
  assert.deepEqual(h.raised, []);
});

// ── the Test button ────────────────────────────────────────────────────────────

test("a sample takes the shape of the rule it previews", () => {
  const now = "2026-07-29T21:00:00.000Z";
  const base = settings([]);
  const cast = sampleAlert(base, { id: "a", spell: "Fear", enabled: true }, now);
  assert.equal(cast.event, "cast");
  assert.equal(cast.spell, "Fear");

  const lineWatch = sampleAlert(base, { id: "b", spell: "invites you", enabled: true, onCast: false, onLine: true }, now);
  assert.equal(lineWatch.event, "line");
  assert.match(lineWatch.text ?? "", /invites you/);
  assert.equal(lineWatch.caster, "");

  const fade = sampleAlert(base, { id: "c", spell: "Root", enabled: true, onCast: false, onFade: true }, now);
  assert.equal(fade.event, "fade");

  // With no rule at all — the defaults' own Test button.
  assert.equal(sampleAlert(base, undefined, now).spell, "Fear");
});

test("a sample wears the rule's resolved look, or the preview would flatter the settings", () => {
  const styled = settings([], { styles: [{ id: "loud", name: "Loud", style: { ...settings([]), color: "#a371f7" } }] });
  const sample = sampleAlert(styled, { id: "a", spell: "Fear", enabled: true, styleId: "loud" }, "2026-07-29T21:00:00Z");
  assert.equal(sample.style?.color, "#a371f7");
});

test("a look can be previewed while it's being edited, belonging to no rule at all", () => {
  // What "▶ Preview alert" inside a style editor needs: the defaults, a saved style, or a rule's own
  // look mid-edit — none of which is reachable by naming a watch.
  const base = settings([]);
  const trying = { ...base, color: "#46c86b", animation: "wiggle" as const };
  const sample = sampleAlert(base, undefined, "2026-07-29T21:00:00Z", trying);
  assert.equal(sample.style?.color, "#46c86b");
  assert.equal(sample.style?.animation, "wiggle");
  // …and it's still the ordinary cast banner, since what's being judged is the look.
  assert.equal(sample.event, "cast");
});
