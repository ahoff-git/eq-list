/**
 * Black-box tests for the hover card's ownership lines (ADR 0320): where you hold an item and at what
 * best grade, and which sharing peers hold it — nothing at all when nobody does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { heldOnPageText, ownershipNotes } from "../../src/shared/items/ownership-notes";

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

test("an item page's line: the total, best grade, and a count per area in the dump's order", () => {
  const places = [
    { label: "Bags", slots: ["1", "3"], count: 600 },
    { label: "Bank", slots: ["14"], count: 30 },
    { label: "Tradeskill depot", slots: [], count: 10 },
  ];
  assert.equal(heldOnPageText({ count: 640, bestGrade: 0, places }), "640 — Bags 600 · Bank 30 · Tradeskill depot 10");
  assert.equal(heldOnPageText({ count: 1, bestGrade: 3, places: [{ label: "Worn", slots: ["Fingers"], count: 1 }] }), "1 (best +3) — Worn 1");
});

