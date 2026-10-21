/**
 * Black-box tests for the hover card's ownership lines (ADR 0320): where you hold an item and at what
 * best grade, and which sharing peers hold it — nothing at all when nobody does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ownershipNotes } from "../../src/shared/items/ownership-notes";

const place = (text: string, count = 1, exaltation = false) => ({ text, count, exaltation });

test("nobody holds it: no lines", () => {
  assert.deepEqual(ownershipNotes(undefined, undefined, undefined), []);
  assert.deepEqual(ownershipNotes([], undefined, []), []);
});

test("yours: the total, the best grade, and where", () => {
  assert.deepEqual(ownershipNotes([place("Bank 14", 2), place("Worn Fingers")], 3, undefined), ["You have 3 (best +3): Bank 14 ×2, Worn Fingers"]);
});

test("an ungraded copy says no grade; an exaltation says it is one", () => {
  assert.deepEqual(ownershipNotes([place("in Gnoll Slayer (Worn Primary)", 1, true)], undefined, undefined), ["You have 1: in Gnoll Slayer (Worn Primary) (exaltation)"]);
});

test("past three places, the rest are counted", () => {
  const four = ["Bank 1", "Bank 2", "Bank 3", "Bank 4"].map((t) => place(t));
  assert.deepEqual(ownershipNotes(four, undefined, undefined), ["You have 4: Bank 1, Bank 2, Bank 3, 1 more"]);
});

test("peers who share: each by name, with their count", () => {
  assert.deepEqual(ownershipNotes(undefined, undefined, [{ by: "Bob", count: 2 }, { by: "Ann", count: 1 }]), ["Peers: Bob 2, Ann 1"]);
});
