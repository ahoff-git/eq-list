/** Black-box tests for the plan cache: a repeat is a lookup, a changed input is a miss, the oldest goes first. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlanCache, planKey } from "../../src/lib/items/plan-cache";

test("the same big inputs and equal small ones make one key; a new object or a changed value makes another", () => {
  const rows = [{}];
  assert.equal(planKey([rows, null], { a: 1 }), planKey([rows, null], { a: 1 }));
  assert.notEqual(planKey([rows], { a: 1 }), planKey([[{}]], { a: 1 }));
  assert.notEqual(planKey([rows], { a: 1 }), planKey([rows], { a: 2 }));
});

test("a hit doesn't recompute, and the least recently used entry is the one dropped", () => {
  const cache = createPlanCache<number>(2);
  let runs = 0;
  const get = (k: string) => cache.get(k, () => ++runs);
  get("a");
  get("b");
  get("a"); // a is now newest
  get("c"); // drops b
  assert.equal(runs, 3);
  get("a");
  assert.equal(runs, 3, "a survived");
  get("b");
  assert.equal(runs, 4, "b was dropped");
});
