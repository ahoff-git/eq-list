/**
 * Black-box tests for list grouping: items cluster under the quest/recipe that
 * added them, standalone items land in "Other items" (last), and per-group
 * progress is computed correctly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByOrigin, effectiveNeeded, originKey, itemDemands, itemTotals, normalizeItemName } from "../../src/shared/grouping";
import type { ShoppingListEntry } from "../../src/shared/types";

function entry(p: Partial<ShoppingListEntry> & { name: string }): ShoppingListEntry {
  return { id: p.name, needed: 1, obtained: 0, addedAt: "", ...p };
}

test("groups by origin, Other last", () => {
  const groups = groupByOrigin([
    entry({ name: "Aviak Talon", origin: { kind: "quest", name: "Aviak Talons" } }),
    entry({ name: "Bone Chips" }),
    entry({ name: "Aviak Feather", origin: { kind: "quest", name: "Aviak Talons" } }),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].label, "Aviak Talons");
  assert.equal(groups[0].entries.length, 2);
  assert.equal(groups[1].label, "Other items");
  assert.equal(groups[1].kind, null);
});

test("per-group progress and completion", () => {
  const [g] = groupByOrigin([
    entry({ name: "A", needed: 2, obtained: 2, origin: { kind: "recipe", name: "Batwing Crunchies" } }),
    entry({ name: "B", needed: 3, obtained: 1, origin: { kind: "recipe", name: "Batwing Crunchies" } }),
  ]);
  assert.equal(g.needed, 5);
  assert.equal(g.obtained, 3);
  assert.equal(g.complete, false);
});

test("obtained is clamped per entry", () => {
  const [g] = groupByOrigin([
    entry({ name: "A", needed: 1, obtained: 9, origin: { kind: "quest", name: "Q" } }),
  ]);
  assert.equal(g.obtained, 1);
  assert.equal(g.complete, true);
});

test("quest runs scale needed counts", () => {
  const origin = { kind: "quest" as const, name: "Aviak Talons" };
  const entries = [
    entry({ name: "Aviak Talon", needed: 4, obtained: 4, origin }),
    entry({ name: "Feather", needed: 1, obtained: 1, origin }),
  ];
  // 1 run: complete (4/4, 1/1).
  const [one] = groupByOrigin(entries, {});
  assert.equal(one.runs, 1);
  assert.equal(one.needed, 5);
  assert.equal(one.complete, true);

  // 3 runs: need 12 + 3, so it's no longer complete and totals scale.
  const [three] = groupByOrigin(entries, { [originKey(origin)]: 3 });
  assert.equal(three.runs, 3);
  assert.equal(three.needed, 15);
  assert.equal(three.complete, false);
  assert.equal(effectiveNeeded(entries[0], three.runs), 12);

  // "Other" (no origin) is never multiplied.
  const [other] = groupByOrigin([entry({ name: "Bone Chips", needed: 2 })], { __other__: 5 });
  assert.equal(other.runs, 1);
  assert.equal(other.needed, 2);
});

test("itemTotals sums an item across groups, scaled by each group's runs", () => {
  // The rat-ear example: a recipe (2 ears/pie) run ×2 → 4, plus a quest needing 4 → 8 total.
  const pie = { kind: "recipe" as const, name: "Rat Ear Pie" };
  const quest = { kind: "quest" as const, name: "Rat Catcher" };
  const groups = groupByOrigin(
    [
      entry({ name: "Rat Ear", needed: 2, origin: pie }),
      entry({ name: "Rat Ear", needed: 4, origin: quest }),
    ],
    { [originKey(pie)]: 2 },
  );
  assert.equal(itemTotals(groups).get(normalizeItemName("Rat Ear")), 8);

  // An item wanted by only one group totals to its own need (so the UI hides the parens).
  const solo = groupByOrigin([entry({ name: "Bone Chips", needed: 3 })]);
  assert.equal(itemTotals(solo).get("bone chips"), 3);
});

test("itemDemands names who wants an item, and sums to the same total", () => {
  // Same rat-ear example: the hover has to be able to say *which* quests make up the 8.
  const pie = { kind: "recipe" as const, name: "Rat Ear Pie" };
  const quest = { kind: "quest" as const, name: "Rat Catcher" };
  const groups = groupByOrigin(
    [
      entry({ name: "Rat Ear", needed: 2, origin: pie }),
      entry({ name: "Rat Ear", needed: 4, origin: quest }),
      entry({ name: "Rat Ear", needed: 1 }), // and one added on its own
    ],
    { [originKey(pie)]: 2 },
  );

  const demands = itemDemands(groups).get(normalizeItemName("Rat Ear"))!;
  assert.deepEqual(
    demands.map((d) => [d.label, d.kind, d.need, d.runs]),
    [
      ["Rat Ear Pie", "recipe", 4, 2], // 2 per pie × 2 runs
      ["Rat Catcher", "quest", 4, 1],
      ["Other items", null, 1, 1],
    ],
  );
  // The hint and its explanation come from one place, so they can't drift apart.
  assert.equal(
    demands.reduce((n, d) => n + d.need, 0),
    itemTotals(groups).get(normalizeItemName("Rat Ear")),
  );
});

// The one fold every "is this the item?" question goes through — the loot line against the list
// (store.ts), the log against the wiki (drop-truth.ts), an item's total across groups.
test("normalizeItemName folds case, spacing and an item's grade", () => {
  assert.equal(normalizeItemName("  Crushbone   Belt "), "crushbone belt");
  // A looted "Crushbone Belt +2" is the "Crushbone Belt" a quest asked for.
  assert.equal(normalizeItemName("Crushbone Belt +2"), normalizeItemName("Crushbone Belt"));
});

test("itemDemands lists a single claim for an item only one group wants", () => {
  const groups = groupByOrigin([entry({ name: "Bone Chips", needed: 3 })]);
  const demands = itemDemands(groups).get("bone chips")!;
  assert.equal(demands.length, 1);
  assert.equal(demands[0].need, 3);
});
