import { test } from "node:test";
import assert from "node:assert/strict";

import { GRID_EXPECTATIONS, expectationsAt, findGrid } from "./grid-expectations.mjs";

test("an expectation without a view applies when the section opens, and one with a view only on that view", () => {
  assert.deepEqual(expectationsAt("items", null).map((e) => e.id), ["Items"]);
  assert.deepEqual(expectationsAt("items", "Search"), []);
  assert.deepEqual(expectationsAt("faction", "Hits (28)").map((e) => e.id), ["Faction · Hits"]);
  assert.deepEqual(expectationsAt("faction", "Standings (8)").map((e) => e.id), ["Faction · Standings"]);
  assert.deepEqual(expectationsAt("faction", null), []);
});

test("every table of the manual checklist that can be scripted has an entry", () => {
  const ids = GRID_EXPECTATIONS.map((e) => e.id);
  for (const wanted of ["Items", "Spells", "Loot · Drops", "Loot · Sells for", "Faction · Hits", "Faction · Standings", "Session · per mob", "Session · per zone"]) {
    assert.ok(ids.includes(wanted), wanted);
  }
});

test("exactly one grid carries the paging expectation, and it is the Faction Hits grid the regression was found on", () => {
  assert.deepEqual(GRID_EXPECTATIONS.filter((e) => e.paging).map((e) => e.id), ["Faction · Hits"]);
});

test("a grid is found by a column of its own, wherever it sits in the view", () => {
  const perMob = { hasField: "mob" };
  const perZone = { hasField: "fights" };
  assert.equal(findGrid([["zone", "fights", "kills"], ["mob", "kills"]], perMob), 1);
  assert.equal(findGrid([["zone", "fights", "kills"], ["mob", "kills"]], perZone), 0);
  assert.equal(findGrid([["mob", "kills"]], perZone), -1);
});

test("without a named column a grid is found by position, and a position past the end is none", () => {
  assert.equal(findGrid([["a"], ["b"]], {}), 0);
  assert.equal(findGrid([["a"], ["b"]], { gridIndex: 1 }), 1);
  assert.equal(findGrid([["a"]], { gridIndex: 1 }), -1);
  assert.equal(findGrid([], {}), -1);
});
