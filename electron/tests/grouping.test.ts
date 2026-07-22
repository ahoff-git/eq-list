/**
 * Black-box tests for list grouping: items cluster under the quest/recipe that
 * added them, standalone items land in "Other items" (last), and per-group
 * progress is computed correctly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByOrigin, effectiveNeeded, originKey } from "../../src/shared/grouping";
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
