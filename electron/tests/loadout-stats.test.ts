/**
 * Black-box tests for `loadout-stats.ts`: what worn gear adds up to, and the before/after comparison
 * best in slot shows. Only need re-running if that file changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareLoadoutStats, loadoutStats } from "../../src/shared/items/loadout-stats";

test("stats add up across pieces; haste is the best piece's, not a sum; a weapon's swing isn't a total", () => {
  const total = loadoutStats([
    { stats: { ac: 10, hp: 25, str: 3, haste: 20, dmg: 9, delay: 30, wt: 2.5 } },
    { stats: { ac: 5, hp: 10, svFire: 4, haste: 36, dmg: 7, delay: 24, wt: 1 } },
  ]);
  assert.deepEqual(total, { ac: 15, hp: 35, str: 3, svFire: 4, haste: 36, wt: 3.5 });
});

test("a stat no piece gives is absent, not zero", () => {
  assert.deepEqual(loadoutStats([{ stats: {} }]), {});
});

test("the comparison lists each stat either side gives, in card order, with the change", () => {
  assert.deepEqual(compareLoadoutStats({ hp: 30, wt: 4 }, { ac: 12, hp: 50, wt: 3 }), [
    { key: "ac", before: undefined, after: 12, change: 12 },
    { key: "hp", before: 30, after: 50, change: 20 },
    { key: "wt", before: 4, after: 3, change: -1 },
  ]);
});
