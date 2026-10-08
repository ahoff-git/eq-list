/**
 * Tests for the Mob Knowledge panel's own small badges (`src/shared/mob-provenance.ts`) — the same
 * shape `faction-sort.test.ts` exercises `pooledCauseBadge` with.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { disagreeBadge, provenanceBadge } from "../../src/shared/mob/mob-provenance";
import type { MobKnowledge } from "../../src/shared/mob/mob-stats";

function known(p: Partial<MobKnowledge> & { kills: number; myKills: number }): MobKnowledge {
  return {
    mob: "a gnoll pup",
    zone: "Blackburrow",
    drops: [],
    lastAt: "2026-08-19T01:00:00.000Z",
    contributors: [],
    copper: 0,
    copperPerKill: 0,
    ...p,
  };
}

// ─── provenanceBadge ──────────────────────────────────────────────────────────────────────────────

test("a tally nobody else touched shows no badge at all", () => {
  assert.equal(provenanceBadge(known({ kills: 40, myKills: 40, contributors: [] })), undefined);
});

test("a tally that's all yours shows no badge even if a peer is listed with nothing in it", () => {
  // Not a real shape `mergeObservations` would produce, but the badge should still refuse to guess
  // at grading a "yours" verdict rather than inventing a label for it.
  assert.equal(provenanceBadge(known({ kills: 40, myKills: 40, contributors: ["Bob"] })), undefined);
});

test("mostly yours, pooled, and mostly theirs each grade differently, from kills not head count", () => {
  const mostlyYours = provenanceBadge(known({ kills: 100, myKills: 90, contributors: ["Bob"] }));
  assert.equal(mostlyYours?.label, "mostly yours");
  assert.match(mostlyYours!.title, /100 kills/);

  const pooled = provenanceBadge(known({ kills: 100, myKills: 50, contributors: ["Bob", "Alice"] }));
  assert.equal(pooled?.label, "pooled");

  const theirs = provenanceBadge(known({ kills: 100, myKills: 5, contributors: ["Bob"] }));
  assert.equal(theirs?.label, "mostly theirs");
  assert.equal(theirs?.confidence, "solid");
});

test("the badge's confidence tracks the sample-size ladder, not the provenance split", () => {
  const thin = provenanceBadge(known({ kills: 4, myKills: 2, contributors: ["Bob"] }));
  assert.equal(thin?.confidence, "thin");
  const solid = provenanceBadge(known({ kills: 100, myKills: 50, contributors: ["Bob"] }));
  assert.equal(solid?.confidence, "solid");
});

// ─── disagreeBadge ────────────────────────────────────────────────────────────────────────────────

test("a drop with no disagreement shows no badge", () => {
  const k = known({
    kills: 120,
    myKills: 20,
    drops: [{ item: "Gnoll Fang", count: 30, myCount: 5, rate: 0.25 }],
  });
  assert.equal(disagreeBadge(k, k.drops[0]), undefined);
});

test("a plain disagreement gets a badge naming both rates and both sample sizes", () => {
  const k = known({
    kills: 120,
    myKills: 20,
    drops: [{ item: "Gnoll Fang", count: 61, myCount: 1, rate: 0.508 }],
  });
  const badge = disagreeBadge(k, k.drops[0]);
  assert.ok(badge);
  assert.equal(badge.label, "disagrees");
  assert.match(badge.title, /5\.0%/); // mine: 1/20, rare enough for a decimal place
  assert.match(badge.title, /60%/); // theirs: 60/100
  assert.match(badge.title, /20 kills/);
  assert.match(badge.title, /100 kills/);
});

test("a difference resting on a small sample gets no badge, the same floor `disagreements()` uses", () => {
  const k = known({
    kills: 302,
    myKills: 2,
    drops: [{ item: "Gnoll Fang", count: 16, myCount: 1, rate: 0.053 }],
  });
  assert.equal(disagreeBadge(k, k.drops[0]), undefined);
});
