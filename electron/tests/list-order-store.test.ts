/**
 * Black-box tests for what the shopping list's store keeps about order (ADR 0388): an old list is sorted once
 * and marked, a new row joins the end, a reorder is kept across a restart, and what is allocated first follows it.
 * The moves themselves are `list-order.test.ts`'s.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../store";
import type { ShoppingList } from "../../src/shared/types";

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "eql-order-"));
const entry = (id: string, name: string, origin?: string, needed = 1) => ({
  id,
  name,
  needed,
  obtained: 0,
  addedAt: "2026-11-01T00:00:00Z",
  ...(origin ? { origin: { kind: "quest" as const, name: origin } } : {}),
});

/** A list as an older build wrote it: no `arranged`, and rows in the order they were added. */
const OLD: ShoppingList = {
  entries: [entry("z", "Zinc Ore", "Quest Z"), entry("a", "Ash Log", "Quest A"), entry("o", "Wolf Pelt")],
  questRuns: {},
};
const seeded = (list: object = OLD) => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "shopping-list.json"), JSON.stringify(list), "utf8");
  return dir;
};
const order = (dir: string) => createStore(dir).getList().entries.map((e) => e.id);

test("a list saved before order was the player's loads sorted the way it was always drawn, and marked", () => {
  const list = createStore(seeded()).getList();
  assert.deepEqual(list.entries.map((e) => e.id), ["a", "z", "o"], "Quest A, Quest Z, then Other");
  assert.equal(list.arranged, true);
});

test("a row added afterwards joins the end of the list instead of being sorted back among the rest", () => {
  const dir = seeded();
  const store = createStore(dir);
  store.addEntry({ name: "Amber", origin: { kind: "quest", name: "Quest A" } });
  assert.equal(store.getList().entries.at(-1)?.name, "Amber", "last in storage, so last in its group");
  assert.equal(createStore(dir).getList().entries.at(-1)?.name, "Amber", "and it stays there after a restart");
});

test("a reorder is kept across a restart, and the list is not sorted again over it", () => {
  const dir = seeded();
  const store = createStore(dir);
  store.reorder(["o", "z", "a"]);
  assert.deepEqual(order(dir), ["o", "z", "a"]);
  assert.deepEqual(order(dir), ["o", "z", "a"], "twice, to be sure a load doesn't undo it");
});

test("an order that is a little behind the list drops nothing", () => {
  const store = createStore(seeded());
  store.reorder(["z"]);
  assert.deepEqual(store.getList().entries.map((e) => e.id), ["z", "a", "o"], "z first, the rest after, in the order they were");
});

test("an order naming nothing the list holds changes nothing, and the list is still marked as the player's", () => {
  const store = createStore(seeded());
  store.reorder(["nope", "also-nope"]);
  assert.deepEqual(store.getList().entries.map((e) => e.id), ["a", "z", "o"]);
});

test("the order a list is arranged in is the order a looted stack and a held pile are handed out", () => {
  // The same item under two quests: whichever the player put first is filled first (ADR 0387 + 0388).
  const list: ShoppingList = {
    entries: [entry("a", "Bone Chips", "Quest A", 3), entry("b", "Bone Chips", "Quest B", 3)],
    questRuns: {},
  };
  const loot = { kind: "loot", item: "Bone Chips", qty: 3, source: "a skeleton", fate: "kept", logId: 1, raw: "", at: "2026-11-08T00:10:00" } as const;

  const first = createStore(seeded(list));
  first.creditLoot(loot);
  assert.deepEqual(first.getList().entries.map((e) => [e.id, e.obtained]), [["a", 3], ["b", 0]], "Quest A first: A gets the chips");

  const flipped = createStore(seeded(list));
  flipped.reorder(["b", "a"]);
  flipped.creditLoot(loot);
  assert.deepEqual(flipped.getList().entries.map((e) => [e.id, e.obtained]), [["b", 3], ["a", 0]], "Quest B moved first: B gets them");
});
