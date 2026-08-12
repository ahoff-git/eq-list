/**
 * Black-box tests for the sort shape every sortable table shares: what a header click does, and
 * that a sort never reorders rows the chosen column can't tell apart.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareValues, distinct, distinctSorted, nextSort, sortRows, type Sort } from "../../src/shared/sorting";

test("clicking the sorted column flips it; clicking another switches to it", () => {
  const start: Sort<"a" | "b"> = { key: "a", desc: true };
  assert.deepEqual(nextSort(start, "a"), { key: "a", desc: false });
  assert.deepEqual(nextSort({ key: "a", desc: false }, "a"), { key: "a", desc: true });
  assert.deepEqual(nextSort(start, "b"), { key: "b", desc: true });
  // A name column opens at A rather than Z — the caller says which.
  assert.deepEqual(nextSort(start, "b", false), { key: "b", desc: false });
});

test("numbers compare numerically, text as text", () => {
  assert.ok(compareValues(9, 10) < 0, "not '9' > '1'");
  assert.ok(compareValues("apple", "banana") < 0);
});

test("a sort is stable, so ties keep the order they came in", () => {
  const rows = [
    { name: "first", n: 1 },
    { name: "second", n: 1 },
    { name: "third", n: 1 },
  ];
  const pick = (r: (typeof rows)[number]) => r.n;
  assert.deepEqual(sortRows(rows, { key: "n", desc: true }, pick).map((r) => r.name), ["first", "second", "third"]);
  assert.deepEqual(sortRows(rows, { key: "n", desc: false }, pick).map((r) => r.name), ["first", "second", "third"]);
});

test("a picker's options are each name once, in the order a person reads them", () => {
  const mobs = ["a gnoll pup", "Grikbar kobold", "a gnoll pup", "bandit"];
  assert.deepEqual(distinctSorted(mobs), ["a gnoll pup", "bandit", "Grikbar kobold"]);
  // Not the bare `sort()` two of these lists used, which puts every capital ahead of every lowercase.
  assert.notDeepEqual(distinctSorted(mobs), [...new Set(mobs)].sort());
});

test("distinct keeps first-seen order, because some lists are already in the order they mean", () => {
  // The hunt's mob names feed a batch of lookups, where the order is the order they were found in.
  assert.deepEqual(distinct(["b", "a", "b", "c"]), ["b", "a", "c"]);
  assert.deepEqual(distinct([]), []);
});

test("sorting leaves the caller's array alone", () => {
  const rows = [{ n: 2 }, { n: 1 }];
  const sorted = sortRows(rows, { key: "n", desc: false }, (r) => r.n);
  assert.deepEqual(rows.map((r) => r.n), [2, 1], "the input is untouched");
  assert.deepEqual(sorted.map((r) => r.n), [1, 2]);
});
