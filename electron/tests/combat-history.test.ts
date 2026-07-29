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
import type { CombatantStat, FightStats } from "../../src/shared/types";

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
  };
}

/** A fight at minute `min`, where you dealt `yours` and the mob dealt `theirs`. */
function fight(min: number, yours: number, theirs: number, mob = "a coyote", extra: Partial<FightStats> = {}): FightStats {
  const stamp = (m: number) => `2026-07-29T01:${String(m).padStart(2, "0")}:00.000Z`;
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
  for (let i = 0; i < 1005; i++) h.add(fight(1, i, 0, `fight-${i}`));

  const fights = h.fights("s");
  assert.equal(fights.length, 1000);
  assert.equal(fights[0].label, "fight-1004"); // newest kept
  assert.equal(fights.at(-1)!.label, "fight-5"); // first five dropped
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
