/**
 * Reading the wiki's shape off pages we already hold
 * ([ADR 0180](../decisions/0180-the-wiki-has-a-shape-and-it-moves.md)).
 *
 * The arithmetic is small and the consequences are not: a candidate set that forgets its verdicts
 * re-probes the same few thousand dead ends every run, and one that forgets the roster re-fetches the
 * catalogue a page at a time. Both are silent — they cost requests, not correctness — which is
 * exactly the kind of thing worth pinning.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { candidatesFrom, probeOrder } from "../../src/shared/wiki-shape";

test("a link nothing knows about is a candidate", () => {
  const out = candidatesFrom({
    links: ["Mistmoore Heirloom Ring"],
    roster: ["Rusty Short Sword"],
    checked: [],
  });
  assert.deepEqual(out, ["Mistmoore Heirloom Ring"]);
});

test("a link the roster already names is not", () => {
  // The walk found it; there is nothing to discover, whatever kind it turns out to be.
  const out = candidatesFrom({
    links: ["Rusty Short Sword", "A guard"],
    roster: ["Rusty Short Sword", "A guard"],
    checked: [],
  });
  assert.deepEqual(out, []);
});

test("a title we have already checked is never checked again", () => {
  // The whole point of writing verdicts down: "not an item" is the answer for the overwhelming
  // majority, and without this every run pays for the same few thousand dead ends.
  const out = candidatesFrom({
    links: ["Some Faction", "Mistmoore Heirloom Ring"],
    roster: [],
    checked: ["Some Faction"],
  });
  assert.deepEqual(out, ["Mistmoore Heirloom Ring"]);
});

test("a popular mob linked from thirty zone pages is one candidate", () => {
  const out = candidatesFrom({
    links: ["A guard", "A guard", "A guard"],
    roster: [],
    checked: [],
  });
  assert.deepEqual(out, ["A guard"]);
});

test("matching is folded, so spacing and case don't smuggle a duplicate through", () => {
  // Links come out of hrefs and rosters out of category listings; the two write titles differently
  // often enough that comparing them raw would re-fetch pages we already hold.
  const out = candidatesFrom({
    links: ["  rusty   short sword ", "A GUARD"],
    roster: ["Rusty Short Sword"],
    checked: ["a guard"],
  });
  assert.deepEqual(out, []);
});

test("the cap is a guard against junk, not a tuning knob", () => {
  const links = Array.from({ length: 50 }, (_, i) => `Thing ${i}`);
  assert.equal(candidatesFrom({ links, roster: [], checked: [], cap: 10 }).length, 10);
});

test("two peers walk the same candidates in different places", () => {
  // The same argument as the shard ordering: without it both peers probe the same titles in the same
  // order all evening and the room learns half as much as it paid for.
  const candidates = Array.from({ length: 40 }, (_, i) => `Thing ${i}`);
  const a = probeOrder(candidates, "peer-a");
  const b = probeOrder(candidates, "peer-b");
  assert.notDeepEqual(a, b, "two peers should not start in the same place");
  // Same set, though — a different order must never mean different work.
  assert.deepEqual([...a].sort(), [...b].sort());
});

test("an order is stable for one peer, and safe when there is nothing to order", () => {
  const candidates = ["B", "A", "C"];
  assert.deepEqual(probeOrder(candidates, "peer-a"), probeOrder(candidates, "peer-a"));
  assert.deepEqual(probeOrder([], "peer-a"), []);
  assert.deepEqual(probeOrder(["only"], "peer-a"), ["only"]);
});
