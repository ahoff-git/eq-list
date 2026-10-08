/**
 * Black-box tests for `mergeFactionObservations` ([src/shared/faction-observation.ts](../../src/shared/faction-observation.ts))
 * — folding your own ledger-derived tallies with what peers have reported, one row per
 * (faction, kind, source). See `pooling.test.ts` for the sibling check this mirrors.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeFactionObservations, type FactionObservation } from "../../src/shared/faction/faction-observation";

const mine = (over: Partial<FactionObservation> = {}): FactionObservation => ({
  faction: "Wharf Rats",
  kind: "kill",
  source: "a dock worker",
  net: -4,
  hits: 2,
  ...over,
});

test("mine alone is yours, with nobody else credited", () => {
  const [row] = mergeFactionObservations([mine()], []);
  assert.equal(row.hits, 2);
  assert.equal(row.myHits, 2);
  assert.equal(row.net, -4);
  assert.deepEqual(row.contributors, []);
});

test("a peer's tally for the same (faction, kind, source) pools into one row, not two", () => {
  const theirs = mine({ net: -2, hits: 1, by: "Bob", byId: "c-1" });
  const [row] = mergeFactionObservations([mine()], [theirs]);
  assert.equal(row.hits, 3);
  assert.equal(row.myHits, 2, "your own share is still visible after pooling");
  assert.equal(row.net, -6);
  assert.deepEqual(row.contributors, [{ id: "c-1", name: "Bob" }]);
});

test("the same contributor reporting twice for one row is credited once, not twice", () => {
  const a = mine({ faction: "Wharf Rats", net: -1, hits: 1, by: "Bob", byId: "c-1" });
  const b = mine({ faction: "Wharf Rats", net: -1, hits: 1, by: "Bob", byId: "c-1" });
  const [row] = mergeFactionObservations([], [a, b]);
  assert.equal(row.contributors.length, 1);
  assert.equal(row.hits, 2, "both rows still count toward the pooled total");
});

test("a kill cause and a dialogue cause for the same faction+source never blend into one row", () => {
  const kill = mine({ kind: "kill", source: "Bob", net: -4, hits: 2 });
  const dialogue = mine({ kind: "dialogue", source: "Bob", net: 2, hits: 1 });
  const rows = mergeFactionObservations([kill, dialogue], []);
  assert.equal(rows.length, 2);
  assert.ok(rows.some((r) => r.kind === "kill" && r.net === -4));
  assert.ok(rows.some((r) => r.kind === "dialogue" && r.net === 2));
});

test("two different factions never fold together even with the same cause name", () => {
  const a = mine({ faction: "Wharf Rats" });
  const b = mine({ faction: "Coalition of Tradefolk" });
  const rows = mergeFactionObservations([a, b], []);
  assert.equal(rows.length, 2);
});

test("nothing pooled and nothing of your own is simply nothing", () => {
  assert.deepEqual(mergeFactionObservations([], []), []);
});

test("biggest |net| leads", () => {
  const small = mine({ faction: "A", net: 1, hits: 1 });
  const big = mine({ faction: "B", net: -10, hits: 5 });
  const [first, second] = mergeFactionObservations([small, big], []);
  assert.equal(first.faction, "B");
  assert.equal(second.faction, "A");
});
