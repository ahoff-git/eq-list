/**
 * Black-box tests for the best-in-slot core (`src/shared/items/bis.ts`): the loadout pick, the
 * two-hander and LORE rules, and hunt suggestions. Only need re-running if that file changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bestLoadout, copiesFor, gradedValues, huntSuggestions, mergedGrade, type BisCandidate } from "../../src/shared/items/bis";
import { NO_ITEM_STATS, type ItemStats } from "../../src/shared/items/item-stats";

let n = 0;
function item(title: string, slots: string[], value: number, extra: Partial<BisCandidate> = {}): BisCandidate {
  return { id: `${title}#${n++}`, title, grade: 0, slots, value, anyValue: value, lore: false, twoHanded: false, ...extra };
}
const worn = (l: ReturnType<typeof bestLoadout>) =>
  l.picks.map((p) => `${p.slot}:${p.item.title}`).sort();

test("the best set is found even when the most valuable item should not take the flexible slot", () => {
  // One ANY slot and one FINGER slot. Greedy-by-slot would put the 10-ring in FINGER and leave the
  // 9-ring nowhere better than ANY — fine — but an earring worth 8 must not be shut out by a ring
  // taking ANY when FINGER was free for it.
  const layout = ["ANY", "FINGER"];
  const loadout = bestLoadout([item("Big Ring", ["FINGER"], 10), item("Earring", ["EAR"], 8), item("Small Ring", ["FINGER"], 3)], layout);
  assert.deepEqual(worn(loadout), ["ANY:Earring", "FINGER:Big Ring"]);
  assert.equal(loadout.total, 18);
});

test("ANY takes whatever is worth most once the dedicated slots are full", () => {
  const layout = ["ANY", "ANY", "CHEST"];
  const loadout = bestLoadout([item("Tunic", ["CHEST"], 5), item("Breastplate", ["CHEST"], 9), item("Charm", ["CHARM"], 4), item("Robe", ["CHEST"], 1)], layout);
  // Which of two equal-valued arrangements is chosen doesn't matter; what's worn and its total do.
  assert.deepEqual(loadout.picks.map((p) => p.item.title).sort(), ["Breastplate", "Charm", "Tunic"]);
  assert.equal(loadout.total, 18);
});

test("a weapon in an Any Slot isn't swung, so its damage counts for nothing there", () => {
  const layout = ["ANY", "PRIMARY"];
  // The dagger is mostly damage; the mace mostly stats. The mace belongs in ANY, the dagger in hand.
  const loadout = bestLoadout([item("Dagger", ["PRIMARY"], 10, { anyValue: 1 }), item("Mace", ["PRIMARY"], 8, { anyValue: 7 })], layout);
  assert.deepEqual(worn(loadout), ["ANY:Mace", "PRIMARY:Dagger"]);
  assert.equal(loadout.total, 17);
});

test("a two-hander wins only when it beats a main-hand and off-hand together", () => {
  const layout = ["PRIMARY", "SECONDARY"];
  const sword = item("Sword", ["PRIMARY", "SECONDARY"], 6);
  const shield = item("Shield", ["SECONDARY"], 5);
  const small = item("Greatsword", ["PRIMARY"], 10, { twoHanded: true });
  assert.deepEqual(worn(bestLoadout([sword, shield, small], layout)), ["PRIMARY:Sword", "SECONDARY:Shield"]);
  const big = item("Greatsword", ["PRIMARY"], 12, { twoHanded: true });
  const loadout = bestLoadout([sword, shield, big], layout);
  assert.deepEqual(worn(loadout), ["PRIMARY:Greatsword"]);
  assert.equal(loadout.picks[0].slotIndex, 0, "slot indexes stay on the full layout");
});

test("LORE: one of each, the best copy", () => {
  const layout = ["FINGER", "FINGER"];
  const loadout = bestLoadout(
    [item("Lore Ring", ["FINGER"], 9, { lore: true, grade: 4 }), item("Lore Ring", ["FINGER"], 5, { lore: true }), item("Plain Ring", ["FINGER"], 2)],
    layout,
  );
  assert.deepEqual(worn(loadout), ["FINGER:Lore Ring", "FINGER:Plain Ring"]);
  assert.equal(loadout.picks.find((p) => p.item.title === "Lore Ring")?.item.grade, 4);
});

test("worthless items are not worn just to fill a slot", () => {
  assert.equal(bestLoadout([item("Junk", ["HEAD"], 0)], ["HEAD"]).picks.length, 0);
});

test("hunting: each target is weighed against the weakest thing it would push out", () => {
  const layout = ["FINGER", "FINGER", "HEAD", "PRIMARY", "SECONDARY"];
  const held = bestLoadout(
    [item("Ring A", ["FINGER"], 8), item("Ring B", ["FINGER"], 3), item("Sword", ["PRIMARY"], 4), item("Shield", ["SECONDARY"], 4)],
    layout,
  );
  const found = huntSuggestions(held, [
    item("Ring C", ["FINGER"], 6),
    item("Hat", ["HEAD"], 2),
    item("Ring D", ["FINGER"], 2),
    item("Big Axe", ["PRIMARY"], 10, { twoHanded: true }),
  ], layout);
  assert.deepEqual(
    found.map((s) => [s.item.title, s.gain, s.replaces?.item.title ?? "empty"]),
    [
      ["Ring C", 3, "Ring B"],
      ["Big Axe", 2, "Sword"],
      ["Hat", 2, "empty"],
    ],
  );
});

test("merging: each copy is worth 2^grade, and the result lands on the highest grade it fills", () => {
  assert.deepEqual(mergedGrade([0, 0]), { grade: 1, exp: 0 });
  assert.deepEqual(mergedGrade([0, 0, 0]), { grade: 1, exp: 1 });
  assert.deepEqual(mergedGrade([2, 2]), { grade: 3, exp: 0 }, "two +2s are a +3");
  assert.deepEqual(mergedGrade([4, 0, 0]), { grade: 4, exp: 2 });
  assert.deepEqual(mergedGrade(new Array(5000).fill(0)), { grade: 10, exp: 0 }, "capped at +10");
  assert.deepEqual(mergedGrade([]), { grade: 0, exp: 0 });
  assert.deepEqual([0, 1, 2, 4].map(copiesFor), [1, 2, 4, 16]);
});

test("graded values: the grade's numbers, and an Any Slot that ignores damage and delay", () => {
  const card: ItemStats = { ...NO_ITEM_STATS, stats: { str: 5, dmg: 20, delay: 30 } };
  const score = (s: ItemStats) => (s.stats.str ?? 0) + (s.stats.dmg ?? 0);
  assert.deepEqual(gradedValues(card, 0, score), { value: 25, anyValue: 5 });
  // +2: STR 5 → 7 (a stat of 10 or less gains 1 a grade); DMG 20 → 24 (+10% a grade, rounded down).
  assert.deepEqual(gradedValues(card, 2, score), { value: 31, anyValue: 7 });
});

test("a two-hander can still be worn, unswung, in an Any Slot beside a main hand and off hand", () => {
  // Its card lists only PRIMARY; not swinging it must not stop it being worn in an Any Slot.
  const layout = ["ANY", "PRIMARY", "SECONDARY"];
  const loadout = bestLoadout(
    [item("Sword", ["PRIMARY"], 6), item("Shield", ["SECONDARY"], 5), item("Staff", ["PRIMARY"], 8, { twoHanded: true, anyValue: 4 })],
    layout,
  );
  assert.deepEqual(worn(loadout), ["ANY:Staff", "PRIMARY:Sword", "SECONDARY:Shield"]);
  assert.equal(loadout.total, 15);
});

test("hunting: an off-hand while swinging a two-hander is weighed against the two-hander it unseats", () => {
  const layout = ["PRIMARY", "SECONDARY"];
  const held = bestLoadout([item("Greataxe", ["PRIMARY"], 10, { twoHanded: true })], layout);
  const found = huntSuggestions(held, [item("Buckler", ["SECONDARY"], 4)], layout);
  // Wearing the buckler means putting the axe away: 4 - 10 is no gain.
  assert.deepEqual(found, []);
});
