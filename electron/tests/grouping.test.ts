/**
 * Black-box tests for list grouping: items cluster under the quest/recipe that
 * added them, standalone items land in "Other items" (last), and per-group
 * progress is computed correctly.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByOrigin } from "../../src/shared/grouping";
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
