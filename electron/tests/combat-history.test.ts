/**
 * Tests for the combat-history store. Like the log-watcher tests these touch the real
 * filesystem (a temp userData dir), because persisting and reloading *is* the feature.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCombatHistory } from "../combat-history";
import type { CombatantStat, DamageCell, DamageKind, FightStats } from "../../src/shared/types";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-hist-"));
}

function combatant(name: string, dealt: number, mine = false): CombatantStat {
  return {
    name,
    dealt,
    taken: 0,
    healed: 0,
    hits: 1,
    misses: 0,
    crits: 0,
    maxHit: dealt,
    activeSec: 1,
    dps: dealt,
    mine,
    byStance: [],
    byType: [],
    bySpell: [],
    specials: [],
  };
}

/** A combatant that took damage rather than dealing it — what a fight is named after. */
function hurt(name: string, taken: number): CombatantStat {
  return { ...combatant(name, 0), taken };
}

/** One damage cell, for the fights whose label depends on who hit whom. */
function cell(target: string, attacker: string, kind: DamageKind, source: string, damage: number): DamageCell {
  return { target, attacker, kind, source, damage, hits: 1, ticks: 0, misses: 0, crits: 0, maxHit: damage };
}

/** A fight at minute `min`, where you dealt `yours` and the mob dealt `theirs`. */
function fight(min: number, yours: number, theirs: number, mob = "a coyote", extra: Partial<FightStats> = {}): FightStats {
  // Minutes past 01:00, rolling into hours — a fight is keyed by its timestamps now, so two
  // fights in a test have to happen at different times, as two fights in a log do.
  const stamp = (m: number) =>
    `2026-07-29T${String(1 + Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00.000Z`;
  return {
    startedAt: stamp(min),
    endedAt: stamp(min),
    durationSec: 10,
    spanSec: 10,
    totalDealt: yours + theirs,
    yourDealt: yours,
    yourTaken: theirs,
    byCombatant: [combatant("You", yours, true), combatant(mob, theirs)],
    spells: [],
    byMob: [],
    kills: 1,
    xpPct: 1,
    xpGains: 1,
    soloXp: 1,
    partyXp: 0,
    copper: 0,
    soldCopper: 0,
    yourPerSec: [],
    deaths: [],
    invocations: [],
    ...extra,
  };
}

test("fights are grouped into the session that recorded them", () => {
  const h = createCombatHistory(tempDir(), "session-a");
  h.add(fight(1, 100, 20));
  h.add(fight(2, 50, 10));

  const sessions = h.sessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].sessionId, "session-a");
  assert.equal(sessions[0].fights, 2);
  assert.equal(sessions[0].yourDealt, 150);
  assert.equal(sessions[0].yourTaken, 30);
  assert.equal(sessions[0].totalDealt, 180);
  assert.equal(sessions[0].combatSec, 20);
});

test("a session spans its first and last fight", () => {
  const h = createCombatHistory(tempDir(), "s");
  h.add(fight(5, 1, 1));
  h.add(fight(9, 1, 1));
  const [s] = h.sessions();
  assert.match(s.startedAt, /01:05/);
  assert.match(s.endedAt, /01:09/);
});

test("a fight is labelled with the thing you were fighting", () => {
  const h = createCombatHistory(tempDir(), "s");
  h.add(fight(1, 100, 20, "Minotaur Lord"));
  assert.equal(h.fights("s")[0].label, "Minotaur Lord");
});

test("in a group the fight is named after the mob, not the group-mate out-damaging you", () => {
  const h = createCombatHistory(tempDir(), "s");
  // BunnySlayer out-damages everything in the room, which is exactly why "the biggest dealer that
  // isn't mine" used to title the fight after them. What *we* damaged is the coyote.
  h.add(
    fight(1, 100, 20, "a coyote", {
      byCombatant: [combatant("You", 100, true), combatant("BunnySlayer", 400), combatant("a coyote", 20)],
      damageCells: [
        cell("a coyote", "You", "Melee", "Slash", 100),
        cell("a coyote", "BunnySlayer", "Melee", "Slash", 400),
        cell("You", "a coyote", "Melee", "Bite", 20),
      ],
    }),
  );
  assert.equal(h.fights("s")[0].label, "a coyote");
});

test("a fight stored under the old label rule is renamed on read, not left as it was filed", () => {
  const dir = tempDir();
  const a = createCombatHistory(dir, "s");
  a.add(fight(1, 100, 20, "a coyote", { byCombatant: [combatant("You", 100, true), combatant("BunnySlayer", 400)] }));
  a.flush();
  // Hand-edit the file to the label the old rule would have written, as the real history file has.
  const file = path.join(dir, "combat-history.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { fights: { label: string }[] };
  raw.fights[0].label = "BunnySlayer";
  fs.writeFileSync(file, JSON.stringify(raw), "utf8");

  // No cells on that fight either, so the fallback has to carry it: whatever took the most damage.
  const b = createCombatHistory(dir, "s2");
  assert.equal(b.fights("s")[0].label, "BunnySlayer"); // nothing took damage, so the dealer stands
  // With a victim on record, the same read names it instead.
  const c = createCombatHistory(tempDir(), "s");
  c.add(
    fight(1, 100, 20, "a coyote", {
      byCombatant: [combatant("You", 100, true), combatant("BunnySlayer", 400), hurt("a coyote", 500)],
    }),
  );
  assert.equal(c.fights("s")[0].label, "a coyote");
});

test("a login starts a new play session, and the same login twice is still one", () => {
  const h = createCombatHistory(tempDir(), "run:1");
  h.add(fight(1, 10, 1, "before"));
  h.startSession("2026-07-29T20:00:00");
  h.add(fight(2, 10, 1, "after"));
  // The gap between two runs of the app gets replayed, so the same line can arrive twice.
  h.startSession("2026-07-29T20:00:00");
  h.add(fight(3, 10, 1, "later that evening"));

  const sessions = h.sessions();
  assert.equal(sessions.length, 2, "one session per login, not per app run");
  assert.deepEqual(
    h.fights("login:2026-07-29T20:00:00").map((f) => f.label),
    ["later that evening", "after"],
  );
  assert.deepEqual(
    h.fights("run:1").map((f) => f.label),
    ["before"],
  );
});

test("the same fight is filed once, however it arrives", () => {
  const dir = tempDir();
  const h = createCombatHistory(dir, "s");
  assert.equal(h.add(fight(1, 100, 20), null, "/logs/eqlog_Kainos_qeynos.txt"), true);
  // Eating a log you already watched replays the very same fight: same file, same timestamps.
  assert.equal(h.add(fight(1, 100, 20), null, "/logs/eqlog_Kainos_qeynos.txt"), false);
  // The path can differ (a copy of the log, a mapped drive); the file's name still names it.
  assert.equal(h.add(fight(1, 100, 20), null, "D:/backup/eqlog_Kainos_qeynos.txt"), false);
  // Another character's log genuinely records a different side of the same minutes.
  assert.equal(h.add(fight(1, 100, 20), null, "/logs/eqlog_Bunnyslayer_qeynos.txt"), true);
  assert.equal(h.fights("s").length, 2);
  h.flush();

  // And it survives a restart: the keys are rebuilt from what's on disk.
  const reopened = createCombatHistory(dir, "s2");
  assert.equal(reopened.add(fight(1, 100, 20), null, "/logs/eqlog_Kainos_qeynos.txt"), false);
});

test("a fight stored before keying still dedupes against a later import", () => {
  const dir = tempDir();
  const first = createCombatHistory(dir, "s");
  first.add(fight(3, 50, 5), null, "/logs/eqlog_Kainos_qeynos.txt");
  first.flush();
  // Strip the key, as fights filed before this existed have none.
  const file = path.join(dir, "combat-history.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { fights: { key?: string }[] };
  delete raw.fights[0].key;
  fs.writeFileSync(file, JSON.stringify(raw), "utf8");

  const reopened = createCombatHistory(dir, "s2");
  assert.equal(reopened.add(fight(3, 50, 5), null, "/logs/eqlog_Kainos_qeynos.txt"), false);
});

test("a fight is filed under the session it's given, not the one in progress", () => {
  const h = createCombatHistory(tempDir(), "run:live");
  // What eating a log does: each sitting it finds is named on the call, so the live session the
  // app is in the middle of isn't disturbed.
  h.add(fight(1, 10, 1, "eaten"), null, "/logs/old.txt", "login:2026-07-01T20:00:00");
  h.add(fight(2, 10, 1, "live"));
  assert.deepEqual(
    h.sessions().map((s) => s.sessionId).sort(),
    ["login:2026-07-01T20:00:00", "run:live"],
  );
  assert.deepEqual(h.fights("login:2026-07-01T20:00:00").map((f) => f.label), ["eaten"]);
});

test("fights come back newest first", () => {
  const h = createCombatHistory(tempDir(), "s");
  h.add(fight(1, 1, 1, "first"));
  h.add(fight(2, 1, 1, "second"));
  assert.deepEqual(
    h.fights("s").map((f) => f.label),
    ["second", "first"],
  );
});

test("only the asked-for session's fights come back", () => {
  const dir = tempDir();
  const a = createCombatHistory(dir, "session-a");
  a.add(fight(1, 1, 1, "from-a"));
  a.flush();
  // A second run of the app is a new session, reading the same file.
  const b = createCombatHistory(dir, "session-b");
  b.add(fight(2, 1, 1, "from-b"));

  assert.equal(b.sessions().length, 2);
  assert.deepEqual(
    b.fights("session-a").map((f) => f.label),
    ["from-a"],
  );
  assert.deepEqual(
    b.fights("session-b").map((f) => f.label),
    ["from-b"],
  );
});

test("history survives a restart", () => {
  const dir = tempDir();
  const first = createCombatHistory(dir, "s");
  first.add(fight(1, 42, 7));
  first.flush();

  const reopened = createCombatHistory(dir, "s2");
  const [session] = reopened.sessions();
  assert.equal(session.sessionId, "s");
  assert.equal(session.yourDealt, 42);
});

test("the oldest fights are dropped once the cap is hit", () => {
  const h = createCombatHistory(tempDir(), "s");
  // A minute apart each, because a fight is identified by when it happened.
  for (let i = 0; i < 1005; i++) h.add(fight(i, i, 0, `fight-${i}`));

  const fights = h.fights("s");
  assert.equal(fights.length, 1000);
  assert.equal(fights[0].label, "fight-1004"); // newest kept
  assert.equal(fights.at(-1)!.label, "fight-5"); // first five dropped
});

test("searching finds fights by mob and by zone, across sessions", () => {
  const h = createCombatHistory(tempDir(), "s");
  h.add(fight(1, 10, 1, "Minotaur Lord"), "Steamfont Mountains");
  h.add(fight(2, 10, 1, "a coyote"), "Steamfont Mountains");
  h.startSession("2026-07-29T21:00:00");
  h.add(fight(3, 10, 1, "a minotaur guard"), "Steamfont Mountains");
  h.add(fight(4, 10, 1, "a rat"), "Ak'Anon");

  // By mob, case-insensitively, however many sittings it spans — newest first.
  assert.deepEqual(h.search("minotaur").fights.map((f) => f.label), ["a minotaur guard", "Minotaur Lord"]);
  // By zone, for the fights whose names have nothing in common.
  assert.equal(h.search("ak'anon").total, 1);
  assert.equal(h.search("steamfont").total, 3);
  // Every word has to match, in either field — which is what makes "mob + where" one search.
  assert.deepEqual(h.search("coyote steam").fights.map((f) => f.label), ["a coyote"]);
  assert.equal(h.search("coyote akanon").total, 0);
  // A fight with no zone on record is matched on its name alone, not dropped.
  const noZone = createCombatHistory(tempDir(), "s");
  noZone.add(fight(1, 10, 1, "a coyote"));
  assert.equal(noZone.search("coyote").total, 1);
});

test("a search sends back the newest matches and says how many it left out", () => {
  const h = createCombatHistory(tempDir(), "s");
  for (let i = 0; i < 120; i++) h.add(fight(i, i, 0, `a coyote ${i}`));

  const capped = h.search("coyote", 10);
  assert.equal(capped.total, 120, "the count is every match, not the slice");
  assert.equal(capped.fights.length, 10);
  assert.equal(capped.fights[0].label, "a coyote 119"); // newest, as the list shows them
  // Under the cap, the two agree.
  const few = h.search(" coyote 100 ", 10);
  assert.deepEqual(few.fights.map((f) => f.label), ["a coyote 100"]);
  assert.equal(few.total, 1);
});

test("zones aggregate every recorded fight, best experience rate first", () => {
  const h = createCombatHistory(tempDir(), "s");
  // Two fights in a good camp, one in a slow one.
  h.add(fight(1, 100, 10, "a coyote", { durationSec: 60, kills: 2, xpPct: 2 }), "Steamfont Mountains");
  h.add(fight(2, 100, 10, "a coyote", { durationSec: 60, kills: 2, xpPct: 2 }), "Steamfont Mountains");
  h.add(fight(3, 100, 10, "a rat", { durationSec: 120, kills: 1, xpPct: 0.5 }), "Ak'Anon");

  const [best, worst] = h.zones();
  assert.equal(best.zone, "Steamfont Mountains");
  assert.equal(best.fights, 2);
  assert.equal(best.kills, 4);
  assert.equal(best.xpPct, 4);
  assert.equal(best.xpPerMin, 2); // 4% over 2 minutes of combat
  assert.equal(best.dps, 1.7); // 200 damage over 120s
  assert.equal(worst.zone, "Ak'Anon");
  assert.equal(worst.xpPerMin, 0.25);
});

test("a fight with no known zone is left out of the zone report", () => {
  const h = createCombatHistory(tempDir(), "s");
  h.add(fight(1, 10, 1)); // the log hadn't told us a zone yet
  assert.deepEqual(h.zones(), []);
});

test("bests keep your top DPS per opponent", () => {
  const h = createCombatHistory(tempDir(), "s");
  h.add(fight(1, 100, 5, "Minotaur Lord", { durationSec: 10 })); // 10/s
  h.add(fight(2, 300, 5, "Minotaur Lord", { durationSec: 10 })); // 30/s ← best
  h.add(fight(3, 50, 5, "Minotaur Lord", { durationSec: 10 })); // 5/s
  h.add(fight(4, 60, 5, "a coyote", { durationSec: 10 }));

  const bests = h.bests();
  assert.equal(bests.length, 2);
  const lord = bests.find((b) => b.label === "Minotaur Lord")!;
  assert.equal(lord.dps, 30);
  assert.equal(lord.yourDealt, 300);
});

test("clear empties the store on disk too", () => {
  const dir = tempDir();
  const h = createCombatHistory(dir, "s");
  h.add(fight(1, 1, 1));
  h.clear();
  assert.deepEqual(h.sessions(), []);
  assert.deepEqual(createCombatHistory(dir, "s2").sessions(), []);
});

test("an unreadable history file is not a hard failure", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "combat-history.json"), "{not json");
  const h = createCombatHistory(dir, "s");
  assert.deepEqual(h.sessions(), []);
  h.add(fight(1, 5, 0)); // and it still records from there
  assert.equal(h.sessions()[0].yourDealt, 5);
});
