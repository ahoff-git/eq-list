/**
 * Black-box tests for `loadout-stats.ts`: what worn gear adds up to, and the before/after comparison
 * best in slot shows. Only need re-running if that file changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareLoadoutStats, effectiveStats, loadoutStats } from "../../src/shared/items/loadout-stats";
import { derivedRates } from "../../src/shared/items/derived-stats";

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

test("HP, mana and AC include what the attributes give, for your classes at your level, and say how much", () => {
  // Warrior/Shaman/Wizard at 50: STA → HP through the Warrior and Shaman pools, INT → mana through the
  // Wizard's, WIS → mana through the Shaman's, AGI → AC for anyone (`derived-stats.ts`).
  const rates = derivedRates({ classes: ["Warrior", "Shaman", "Wizard"], level: 50 });
  const hpPerSta = rates.find((r) => r.from === "sta")!.perPoint;
  const { total, fromAttributes } = effectiveStats({ hp: 100, sta: 40, agi: 30 }, rates);
  assert.equal(fromAttributes.hp, Math.round(40 * hpPerSta));
  assert.equal(total.hp, 100 + Math.round(40 * hpPerSta), "gear HP plus what the STA gives");
  assert.equal(total.ac, 10, "30 AGI is 10 AC, with no AC on the gear at all");
  assert.equal(total.sta, 40, "the attribute itself is still counted as itself");
});

test("the comparison shows effective totals both sides, and the attribute part of each", () => {
  const rates = derivedRates({ classes: ["Warrior"], level: 50 });
  const [hp] = compareLoadoutStats({ hp: 50 }, { hp: 50, sta: 30 }, rates).filter((r) => r.key === "hp");
  const fromSta = Math.round(30 * rates.find((r) => r.from === "sta")!.perPoint);
  assert.deepEqual(hp, { key: "hp", before: 50, after: 50 + fromSta, change: fromSta, fromAttributes: { before: undefined, after: fromSta } });
  assert.deepEqual(compareLoadoutStats({ hp: 50 }, { hp: 60 }), [{ key: "hp", before: 50, after: 60, change: 10 }], "no rates, no attribute part");
});
