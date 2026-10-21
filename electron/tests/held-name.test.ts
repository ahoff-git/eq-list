/**
 * Black-box tests for reading a held item's name (`src/shared/items/held-name.ts`). Only need
 * re-running if that file changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { heldName, isExaltation } from "../../src/shared/items/held-name";

test("a held name says its page, its grade, and whether it's a stone", () => {
  assert.deepEqual(heldName("Gnoll Slayer +3"), { title: "Gnoll Slayer", grade: 3, exaltation: false });
  assert.deepEqual(heldName("Backpack*"), { title: "Backpack", grade: 0, exaltation: false });
  assert.deepEqual(heldName("Minotaur Horn (Exaltation)"), { title: "Minotaur Horn", grade: 0, exaltation: true });
  assert.deepEqual(heldName("Bone Chips"), { title: "Bone Chips", grade: 0, exaltation: false });
  assert.equal(isExaltation("Spiky Splintmail (exaltation) "), true);
  assert.equal(isExaltation("Exaltation Ring"), false);
});
