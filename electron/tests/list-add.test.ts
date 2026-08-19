/**
 * Black-box tests for what an add says it did — the confirmation a "+ Add" raises.
 *
 * The cases that matter are the ones where "what you pressed" and "what the list did" differ: an
 * item already spoken for by another quest, a repeat press that bumps a count instead of making a
 * row, a whole quest arriving at once, and a mob that is a target rather than a thing to collect.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeAdd, summarizeAdd } from "../../src/shared/list-add";
import type { ShoppingList, ShoppingListEntry } from "../../src/shared/types";

function entry(p: Partial<ShoppingListEntry> & { name: string }): ShoppingListEntry {
  return { id: `${p.name}:${p.origin?.name ?? ""}`, needed: 1, obtained: 0, addedAt: "", ...p };
}

const list = (entries: ShoppingListEntry[], questRuns: Record<string, number> = {}): ShoppingList => ({
  entries,
  questRuns,
});

const EMPTY = list([]);

test("a first add names the item and how many are needed", () => {
  const after = list([entry({ name: "Rusty Short Sword" })]);
  const summary = summarizeAdd(EMPTY, after);
  assert.deepEqual(summary.items, [{ name: "Rusty Short Sword", kind: undefined, needed: 1, added: 1 }]);
  assert.deepEqual(describeAdd(summary), { title: "+ Rusty Short Sword", detail: "1 needed" });
});

test("an item something else already wants reports the new grand total", () => {
  const before = list([entry({ name: "Bone Chips", needed: 4, origin: { kind: "quest", name: "Cleric Robe" } })]);
  const after = list([...before.entries, entry({ name: "Bone Chips", needed: 2 })]);
  const summary = summarizeAdd(before, after);
  assert.deepEqual(summary.items, [{ name: "Bone Chips", kind: undefined, needed: 6, added: 2 }]);
  // The press is worth 2; the figure that says whether to keep farming is 6, and both are said.
  assert.deepEqual(describeAdd(summary), { title: "+ Bone Chips", detail: "+2 · 6 needed in total" });
});

test("multi-run groups are counted the way the list counts them", () => {
  const origin = { kind: "quest", name: "Journeyman's Boots" } as const;
  const before = list([entry({ name: "Bone Chips", needed: 5, origin })], { "quest:Journeyman's Boots": 3 });
  const after = list([...before.entries, entry({ name: "Bone Chips", needed: 1 })], before.questRuns);
  const summary = summarizeAdd(before, after);
  // 5 × 3 runs, plus the 1 just added.
  assert.equal(summary.items[0].needed, 16);
  assert.equal(summary.items[0].added, 1);
});

test("a whole quest is one notice, named after the quest", () => {
  const origin = { kind: "quest", name: "Cleric Robe" } as const;
  const after = list([
    entry({ name: "Bone Chips", needed: 10, origin }),
    entry({ name: "Rat Ears", needed: 4, origin }),
  ]);
  const summary = summarizeAdd(EMPTY, after);
  assert.equal(summary.items.length, 2);
  assert.deepEqual(describeAdd(summary, "Cleric Robe"), {
    title: "+ Cleric Robe",
    detail: "2 items · 14 to collect in all",
  });
});

test("an add that changed nothing says so rather than claiming success", () => {
  const same = list([entry({ name: "Fippy Darkpaw", kind: "mob" })]);
  const summary = summarizeAdd(same, same);
  assert.deepEqual(summary.items, []);
  assert.deepEqual(describeAdd(summary, "Fippy Darkpaw"), {
    title: "Fippy Darkpaw is already on your list",
    detail: "Nothing new to add.",
  });
  assert.deepEqual(describeAdd(summary).title, "Already on your list");
});

test("a mob is worded as a target, never as a count to collect", () => {
  const summary = summarizeAdd(EMPTY, list([entry({ name: "Fippy Darkpaw", kind: "mob" })]));
  assert.deepEqual(describeAdd(summary), {
    title: "+ Fippy Darkpaw",
    detail: "Added as a target — see the Hunt tab",
  });
});

test("a grade is not a different item — it adds to the one already listed", () => {
  const before = list([entry({ name: "Crushbone Belt", needed: 2 })]);
  const after = list([entry({ name: "Crushbone Belt", needed: 3 })]);
  const summary = summarizeAdd(before, after);
  assert.deepEqual(summary.items, [{ name: "Crushbone Belt", kind: undefined, needed: 3, added: 1 }]);
});

test("removing something is not an add", () => {
  const before = list([entry({ name: "Bone Chips", needed: 4 }), entry({ name: "Rat Ears" })]);
  const after = list([entry({ name: "Bone Chips", needed: 4 })]);
  assert.deepEqual(summarizeAdd(before, after).items, []);
});
