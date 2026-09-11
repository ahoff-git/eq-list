/**
 * Tests for joining the race-unlock requirements against the ledger's standings, and for deciding
 * when that join changed enough to be worth an alert. See `src/shared/faction-unlock-progress.ts`'s
 * header for why `net` here is "observed since tracking began", never a lifetime total.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RACE_UNLOCK_TARGET,
  computeRaceUnlockProgress,
  diffRaceUnlockProgress,
  type RaceUnlockProgress,
} from "../../src/shared/faction-unlock-progress";
import type { FactionStanding } from "../../src/shared/types";

function standing(p: Partial<FactionStanding> & { faction: string; net: number }): FactionStanding {
  return { raises: 0, lowers: 0, floors: 0, ceilings: 0, firstAt: "a", lastAt: "a", causes: [], ...p };
}

test("a required faction the ledger has never seen reads as net 0, not missing", () => {
  const progress = computeRaceUnlockProgress([]);
  const barbarian = progress.find((p) => p.race === "Barbarian")!;
  assert.ok(barbarian, "Barbarian is a real race in the generated table");
  assert.ok(barbarian.factions.length > 0);
  for (const f of barbarian.factions) {
    assert.equal(f.net, 0);
    assert.equal(f.target, RACE_UNLOCK_TARGET);
    assert.equal(f.remaining, RACE_UNLOCK_TARGET);
  }
});

test("a faction the ledger has actually tracked reports its real net and clamped remainder", () => {
  const progress = computeRaceUnlockProgress([standing({ faction: "Rogues of the White Rose", net: 2500 })]);
  const barbarian = progress.find((p) => p.race === "Barbarian")!;
  const rogues = barbarian.factions.find((f) => f.faction === "Rogues of the White Rose")!;
  assert.equal(rogues.net, 2500);
  // Past the target is still 2500 net (an honest figure), but "remaining" never goes negative.
  assert.equal(rogues.remaining, 0);
});

test("a race unlocked by a prerequisite race or a task carries no faction progress at all", () => {
  const progress = computeRaceUnlockProgress([]);
  const halfElf = progress.find((p) => p.race === "Half Elf")!;
  const kerran = progress.find((p) => p.race === "Kerran")!;
  assert.equal(halfElf.requirement.kind, "prerequisite-race");
  assert.deepEqual(halfElf.factions, []);
  assert.equal(kerran.requirement.kind, "task");
  assert.deepEqual(kerran.factions, []);
});

const snapshot = (race: string, faction: string, net: number): RaceUnlockProgress[] => [
  { race, requirement: { race, kind: "factions", factions: [faction], method: { steps: [], hitGroups: [] } }, factions: [{ faction, net, target: RACE_UNLOCK_TARGET, remaining: Math.max(0, RACE_UNLOCK_TARGET - net) }] },
];

test("a watched race's faction moving produces an alert with the true delta", () => {
  const before = snapshot("Barbarian", "Rogues of the White Rose", 100);
  const after = snapshot("Barbarian", "Rogues of the White Rose", 105);
  const alerts = diffRaceUnlockProgress(before, after, new Set(["Barbarian"]));
  assert.deepEqual(alerts, [{ race: "Barbarian", faction: "Rogues of the White Rose", net: 105, delta: 5 }]);
});

test("an unwatched race produces no alert no matter how much it moved", () => {
  const before = snapshot("Barbarian", "Rogues of the White Rose", 100);
  const after = snapshot("Barbarian", "Rogues of the White Rose", 2000);
  assert.deepEqual(diffRaceUnlockProgress(before, after, new Set()), []);
  assert.deepEqual(diffRaceUnlockProgress(before, after, new Set(["Dwarf"])), []);
});

test("no prior snapshot means no baseline to compare against, so nothing is reported", () => {
  const after = snapshot("Barbarian", "Rogues of the White Rose", 2000);
  assert.deepEqual(diffRaceUnlockProgress([], after, new Set(["Barbarian"])), []);
});

test("a faction that didn't change produces no alert", () => {
  const before = snapshot("Barbarian", "Rogues of the White Rose", 100);
  const after = snapshot("Barbarian", "Rogues of the White Rose", 100);
  assert.deepEqual(diffRaceUnlockProgress(before, after, new Set(["Barbarian"])), []);
});
