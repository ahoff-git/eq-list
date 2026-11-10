/**
 * Black-box tests for the order of the shopping list (`src/shared/items/list-order.ts`, ADR 0388): the one
 * sort a list gets when order becomes the player's, and the moves that rearrange it. Only need re-running if
 * that file changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOrder, arrangeOnce, moveGroup, moveRow } from "../../src/shared/items/list-order";
import { groupByOrigin } from "../../src/shared/items/grouping";
import type { ShoppingList, ShoppingListEntry } from "../../src/shared/types";

const row = (id: string, name: string, origin?: string, over: Partial<ShoppingListEntry> = {}): ShoppingListEntry => ({
  id,
  name,
  needed: 1,
  obtained: 0,
  addedAt: "",
  ...(origin ? { origin: { kind: "quest" as const, name: origin } } : {}),
  ...over,
});

/** Three quests and some loose items, stored in the order they were added — not alphabetical. */
const ADDED = [
  row("z1", "Zinc Ore", "Quest Z"),
  row("a1", "Ash Log", "Quest A"),
  row("o1", "Wolf Pelt"),
  row("m1", "Mica", "Quest M"),
  row("a2", "Amber", "Quest A"),
  row("o2", "Bat Wing"),
];
const ids = (entries: readonly ShoppingListEntry[]) => entries.map((e) => e.id);

// ── arrangeOnce ─────────────────────────────────────────────────────────────

test("a list from before order was the player's is sorted once: groups A–Z, Other last, rows A–Z", () => {
  const list: ShoppingList = { entries: ADDED, questRuns: {} };
  const arranged = arrangeOnce(list);
  assert.deepEqual(ids(arranged.entries), ["a2", "a1", "m1", "z1", "o2", "o1"], "Quest A (Amber, Ash Log), Quest M, Quest Z, then Other (Bat Wing, Wolf Pelt)");
  assert.equal(arranged.arranged, true);
  assert.deepEqual(ids(list.entries), ids(ADDED), "the list it was given is not touched");
});

test("that sort is exactly how the list used to be drawn, so nothing moves on the day it happens", () => {
  const before = groupByOrigin(arrangeOnce({ entries: ADDED, questRuns: {} }).entries, {}).map((g) => [g.label, g.entries.map((e) => e.name)]);
  assert.deepEqual(before, [
    ["Quest A", ["Amber", "Ash Log"]],
    ["Quest M", ["Mica"]],
    ["Quest Z", ["Zinc Ore"]],
    ["Other items", ["Bat Wing", "Wolf Pelt"]],
  ]);
});

test("a list already arranged is never sorted again — the order in it is the player's", () => {
  const list: ShoppingList = { entries: ADDED, questRuns: {}, arranged: true };
  assert.equal(arrangeOnce(list), list, "returned as it is, not copied");
  assert.deepEqual(ids(arrangeOnce(list).entries), ids(ADDED));
});

test("an empty list is arranged too, so what is added to it later starts in the order it arrives", () => {
  assert.deepEqual(arrangeOnce({ entries: [], questRuns: {} }), { entries: [], questRuns: {}, arranged: true });
});

// ── moveRow ─────────────────────────────────────────────────────────────────

const ARRANGED = arrangeOnce({ entries: ADDED, questRuns: {} }).entries; // a2 a1 | m1 | z1 | o2 o1

test("a row moves to just before, or just after, another row of its group", () => {
  assert.deepEqual(moveRow(ARRANGED, "a1", "a2"), ["a1", "a2", "m1", "z1", "o2", "o1"], "before");
  assert.deepEqual(moveRow(ARRANGED, "a2", "a1", true), ["a1", "a2", "m1", "z1", "o2", "o1"], "after");
  assert.deepEqual(moveRow(ARRANGED, "o1", "o2"), ["a2", "a1", "m1", "z1", "o1", "o2"], "in Other items too");
});

test("a row can't leave its group, or move against itself or something that isn't there — it changes nothing", () => {
  const same = ids(ARRANGED);
  assert.deepEqual(moveRow(ARRANGED, "a1", "z1"), same, "another group's row");
  assert.deepEqual(moveRow(ARRANGED, "a1", "a1"), same);
  assert.deepEqual(moveRow(ARRANGED, "a1", "nope"), same);
  assert.deepEqual(moveRow(ARRANGED, "nope", "a1"), same);
});

test("a move keeps every id exactly once, and leaves the rows of other groups where they were", () => {
  const moved = moveRow(ARRANGED, "a2", "a1", true);
  assert.deepEqual([...moved].sort(), ids(ARRANGED).sort());
  assert.deepEqual(moved.filter((id) => !id.startsWith("a")), ["m1", "z1", "o2", "o1"]);
});

test("rows of one group that are not side by side in storage still move against each other", () => {
  // Added in turns, so Quest A's rows have another group's between them: a1 · o1 · a2.
  const tangled = [row("a1", "Ash Log", "Quest A"), row("o1", "Wolf Pelt"), row("a2", "Amber", "Quest A")];
  assert.deepEqual(moveRow(tangled, "a2", "a1"), ["a2", "a1", "o1"]);
  assert.deepEqual(moveRow(tangled, "a1", "a2", true), ["o1", "a2", "a1"]);
});

// ── moveGroup ───────────────────────────────────────────────────────────────

test("a group moves as a block, before or after another, keeping the order of its own rows", () => {
  assert.deepEqual(moveGroup(ARRANGED, "quest:Quest Z", "quest:Quest A"), ["z1", "a2", "a1", "m1", "o2", "o1"], "before");
  assert.deepEqual(moveGroup(ARRANGED, "quest:Quest A", "quest:Quest Z", true), ["m1", "z1", "a2", "a1", "o2", "o1"], "after");
});

test("'Other items' is the catch-all that stays last: it can't be moved and nothing can be moved against it", () => {
  const same = ids(ARRANGED);
  assert.deepEqual(moveGroup(ARRANGED, "__other__", "quest:Quest A"), same);
  assert.deepEqual(moveGroup(ARRANGED, "quest:Quest A", "__other__", true), same);
  assert.deepEqual(moveGroup(ARRANGED, "quest:Quest A", "quest:Quest A"), same);
  assert.deepEqual(moveGroup(ARRANGED, "quest:Nowhere", "quest:Quest A"), same);
});

test("moving a group makes the groups contiguous, so the stored order and the drawn order agree", () => {
  const tangled = [row("a1", "Ash Log", "Quest A"), row("z1", "Zinc Ore", "Quest Z"), row("a2", "Amber", "Quest A")];
  assert.deepEqual(moveGroup(tangled, "quest:Quest Z", "quest:Quest A"), ["z1", "a1", "a2"]);
});

// ── applyOrder ──────────────────────────────────────────────────────────────

test("entries come back in the order the ids give", () => {
  assert.deepEqual(ids(applyOrder(ARRANGED, ["o1", "z1", "m1", "a1", "a2", "o2"])), ["o1", "z1", "m1", "a1", "a2", "o2"]);
});

test("an order a little behind the list drops nothing: unnamed rows follow, in their own order", () => {
  assert.deepEqual(ids(applyOrder(ARRANGED, ["z1", "a1"])), ["z1", "a1", "a2", "m1", "o2", "o1"]);
});

test("an id that names nothing is ignored and a repeated one counts once", () => {
  assert.deepEqual(ids(applyOrder(ARRANGED, ["nope", "m1", "m1", "a2"])), ["m1", "a2", "a1", "z1", "o2", "o1"]);
  assert.deepEqual(ids(applyOrder(ARRANGED, [])), ids(ARRANGED), "no order at all is no change");
});

test("applying an order never changes the entries themselves", () => {
  const out = applyOrder(ARRANGED, ["o1"]);
  assert.equal(out.find((e) => e.id === "o1"), ARRANGED.find((e) => e.id === "o1"), "the same objects, so a row's tally goes with it");
});
