/**
 * Black-box tests for what the shopping list's store keeps about counting (ADR 0382): the one field
 * `countedByHand`, and that a list saved before it existed loads, counts and saves exactly as it did.
 * The counting itself is `held-count.test.ts`'s.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStore } from "../store";
import type { ShoppingList } from "../../src/shared/types";

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "eql-count-"));

/** A list as an older build wrote it — the shape of the real `shopping-list.json`, no `countedByHand` anywhere. */
const OLD_LIST: ShoppingList = {
  entries: [
    { id: "a", name: "Ruby", needed: 1, obtained: 2, addedAt: "2026-09-03T22:39:32.428Z", wikiPath: "/Ruby", origin: { kind: "quest", name: "Shov" } },
    { id: "b", name: "Bone Chips", needed: 20, obtained: 0, addedAt: "2026-08-02T21:50:49.496Z" },
  ],
  questRuns: {},
};

test("a list saved before rows could be typed counts loads unchanged, and reads as counting from the inventory", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "shopping-list.json"), JSON.stringify(OLD_LIST), "utf8");
  const list = createStore(dir).getList();
  // The one difference an old list shows is the mark that its order is now the player's (ADR 0388); this one was
  // already in the order it was always drawn in (Quest rows, then Other), so nothing is moved.
  assert.deepEqual(list, { ...OLD_LIST, arranged: true });
  assert.equal(list.entries.every((e) => e.countedByHand === undefined), true);
});

test("typing a figure marks the row as the player's, and it survives a restart; handing it back clears it", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "shopping-list.json"), JSON.stringify(OLD_LIST), "utf8");
  const store = createStore(dir);

  store.updateEntry("b", { obtained: 3, countedByHand: true });
  const reopened = createStore(dir).getList().entries.find((e) => e.id === "b");
  assert.deepEqual([reopened?.obtained, reopened?.countedByHand], [3, true]);

  store.updateEntry("b", { countedByHand: false });
  const handedBack = createStore(dir).getList().entries.find((e) => e.id === "b");
  assert.deepEqual([handedBack?.obtained, handedBack?.countedByHand], [3, false], "the figure stays; only the claim to it goes");
});

test("an auto-sold drop is not counted — the item never reached you — but kept, stored and combined ones are", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "shopping-list.json"), JSON.stringify(OLD_LIST), "utf8");
  const store = createStore(dir);
  const loot = (fate: "kept" | "sold" | "stored" | "combined") =>
    store.applyLoot({ kind: "loot", item: "Bone Chips", qty: 2, source: "a gnoll", fate, logId: 1, raw: "", at: "2026-11-08T00:10:00" });
  const obtained = () => store.getList().entries.find((e) => e.id === "b")?.obtained;

  assert.deepEqual(loot("sold"), [], "nothing matched, so no alert and no celebration either");
  assert.equal(obtained(), 0);
  for (const fate of ["kept", "stored", "combined"] as const) {
    const before = obtained() ?? 0;
    assert.equal(loot(fate).length, 1, fate);
    assert.equal(obtained(), before + 2, `a ${fate} drop of 2 counts 2`);
  }
});

test("what an auto-sold drop was for is found without crediting it, by the same match a drop uses", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "shopping-list.json"), JSON.stringify(OLD_LIST), "utf8");
  const store = createStore(dir);
  const loot = (fate: "kept" | "sold", item = "Bone Chips") =>
    ({ kind: "loot", item, qty: 2, source: "a gnoll", fate, logId: 1, raw: "", at: "2026-11-08T00:10:00" }) as const;

  assert.deepEqual(store.soldOnList(loot("sold")).map((e) => e.id), ["b"]);
  assert.equal(store.getList().entries.find((e) => e.id === "b")?.obtained, 0, "found, not counted");
  assert.deepEqual(store.soldOnList(loot("kept")), [], "only a sale is a sale");
  assert.deepEqual(store.soldOnList(loot("sold", "Silk Thread")), [], "an item nobody is tracking is not on the list");
  // A mob on the list is never looted, so a sale can't be "of" it either.
  store.addEntry({ name: "Ghoul Lord", kind: "mob" });
  assert.deepEqual(store.soldOnList(loot("sold", "Ghoul Lord's Cape")), []);
});

/** Three headings wanting the same item: 3 for a quest, 5 for a recipe, 2 for another quest (ADR 0387). */
const CHIPS_LIST: ShoppingList = {
  entries: [
    { id: "a", name: "Bone Chips", needed: 3, obtained: 0, addedAt: "2026-11-01T00:00:00Z", origin: { kind: "quest", name: "Quest A" } },
    { id: "b", name: "Bone Chips", needed: 5, obtained: 0, addedAt: "2026-11-01T00:00:00Z", origin: { kind: "recipe", name: "Recipe B" } },
    { id: "c", name: "Bone Chips", needed: 2, obtained: 0, addedAt: "2026-11-01T00:00:00Z", origin: { kind: "quest", name: "Quest C" } },
  ],
  questRuns: {},
  // Arranged already, so the order here is the player's and what is under test is the split, not the first sort.
  arranged: true,
};

test("a looted stack is split across the rows that want the item, not given whole to each", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "shopping-list.json"), JSON.stringify(CHIPS_LIST), "utf8");
  const store = createStore(dir);
  const loot = (qty: number) =>
    store.creditLoot({ kind: "loot", item: "Bone Chips", qty, source: "a skeleton", fate: "kept", logId: 1, raw: "", at: "2026-11-08T00:10:00" });
  const have = () => store.getList().entries.map((e) => e.obtained);

  assert.deepEqual(loot(5).map((c) => [c.entry.id, c.credit]), [["a", 3], ["b", 2]], "5 chips fill the first row and part of the second");
  assert.deepEqual(have(), [3, 2, 0], "not 5, 5 and 5 — three rows are not ticked by one stack");
  assert.deepEqual(loot(4).map((c) => [c.entry.id, c.credit]), [["b", 3], ["c", 1]], "the next ones carry on where that left off");
  assert.deepEqual(have(), [3, 5, 1]);
  assert.deepEqual(loot(3).map((c) => [c.entry.id, c.credit]), [["a", 2], ["c", 1]], "the last chip fills the third row, and what is past everything wanted goes to the first, which keeps counting");
  assert.deepEqual(have(), [5, 5, 2]);
});

test("applyLoot returns the rows a stack reached, and a row that got none isn't one of them", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "shopping-list.json"), JSON.stringify(CHIPS_LIST), "utf8");
  const store = createStore(dir);
  const event = { kind: "loot", item: "Bone Chips", qty: 2, source: "a skeleton", fate: "kept", logId: 1, raw: "", at: "2026-11-08T00:10:00" } as const;
  assert.deepEqual(store.applyLoot(event).map((e) => e.id), ["a"], "2 chips fit in the first row alone");
  assert.equal(store.getList().entries[1].lastSeenAt, undefined, "and the others weren't touched");
});

test("a group set to run twice wants twice, so a stack is split against that", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "shopping-list.json"), JSON.stringify({ ...CHIPS_LIST, questRuns: { "quest:Quest A": 2 } }), "utf8");
  const store = createStore(dir);
  store.creditLoot({ kind: "loot", item: "Bone Chips", qty: 5, source: "a skeleton", fate: "kept", logId: 1, raw: "", at: "2026-11-08T00:10:00" });
  assert.deepEqual(store.getList().entries.map((e) => e.obtained), [5, 0, 0], "Quest A now wants 6, so all 5 go to it");
});

test("a typed row still gains from a loot line — the figure is a baseline, not a freeze", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "shopping-list.json"), JSON.stringify(OLD_LIST), "utf8");
  const store = createStore(dir);
  store.updateEntry("b", { obtained: 3, countedByHand: true });
  store.applyLoot({ kind: "loot", item: "Bone Chips", qty: 2, source: "a gnoll", fate: "kept", logId: 1, raw: "", at: "2026-11-08T00:10:00" });
  const row = store.getList().entries.find((e) => e.id === "b");
  assert.deepEqual([row?.obtained, row?.countedByHand], [5, true]);
});
