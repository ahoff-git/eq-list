/**
 * Black-box tests for `faction-pooling.ts` — how much of a pooled faction-cause tally is yours, and
 * how much the pattern across its hits is worth believing. Deliberately thin: `provenanceOf` and
 * `causeConfidence`/`causeConfidenceWhy` are already covered by `pooling.test.ts` and
 * `faction-cause.test.ts` respectively, so this only has to pin the folding between them.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { factionPoolStanding, factionPoolWhy } from "../../src/shared/faction/faction-pooling";
import type { FactionCauseKnowledge } from "../../src/shared/faction/faction-observation";

const known = (over: Partial<FactionCauseKnowledge> = {}): FactionCauseKnowledge => ({
  faction: "Wharf Rats",
  kind: "kill",
  source: "a dock worker",
  net: -6,
  hits: 3,
  myHits: 2,
  contributors: [{ id: "c-1", name: "Bob" }],
  ...over,
});

test("provenance and confidence are read straight off the pooled totals", () => {
  const standing = factionPoolStanding(known());
  assert.equal(standing.hits, 3);
  assert.equal(standing.myHits, 2);
  assert.equal(standing.contributors, 1);
  assert.equal(standing.provenance, "pooled"); // 2 of 3 hits yours — neither side is the whole story
});

test("the why sentence names the split and leans on causeConfidenceWhy for the pattern", () => {
  const why = factionPoolWhy(known());
  assert.match(why, /3 hits/);
  assert.match(why, /2 of them yours/);
  assert.match(why, /1 other player/);
});

test("nothing pooled yet reads as exactly that", () => {
  assert.equal(factionPoolWhy(known({ hits: 0, myHits: 0, contributors: [] })), "Nothing pooled yet.");
});

test("entirely your own reads as such, with nobody else named", () => {
  const why = factionPoolWhy(known({ hits: 2, myHits: 2, contributors: [] }));
  assert.match(why, /all your own hits/);
});
