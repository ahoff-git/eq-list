/**
 * Black-box tests for mob knowledge: observed drop rates, roam areas, and pooling one
 * player's observations with another's. Rates are the point, so the tests care most about the
 * denominator being right and provenance surviving the merge.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeObservations, mobKey, observeMobs, type MobObservation } from "../../src/shared/mob-stats";
import type { KillRecord } from "../../src/shared/types";

test("mobKey folds the wiki's article and case onto the kill log's stripped name", () => {
  // The live bug: kills are article-stripped ("a gnoll" → "gnoll") but the wiki keeps it,
  // so a Hunt-tab lookup by wiki name has to fold both to reach the same knowledge.
  assert.equal(mobKey("a gnoll"), mobKey("gnoll"));
  assert.equal(mobKey("An Obsolete Model"), mobKey("obsolete model"));
  assert.equal(mobKey("Fippy Darkpaw"), "fippy darkpaw"); // no article to strip
  assert.equal(mobKey("gnoll"), mobKey("gnoll")); // idempotent
});

function kill(p: Partial<KillRecord> & { mob: string }): KillRecord {
  return {
    id: Math.random().toString(36).slice(2),
    logId: 1,
    at: p.at ?? "2026-07-29T01:00:00.000Z",
    confidence: p.confidence ?? 1,
    zone: p.zone ?? "Steamfont Mountains",
    ...p,
  };
}

test("kills roll up into a per-mob, per-zone tally", () => {
  const [obs] = observeMobs([
    kill({ mob: "a coyote", drops: ["Chunk of Meat"] }),
    kill({ mob: "a coyote" }),
    kill({ mob: "a coyote", drops: ["Chunk of Meat", "Coyote Fang"] }),
  ]);

  assert.equal(obs.mob, "a coyote");
  assert.equal(obs.kills, 3);
  assert.deepEqual(obs.drops, { "Chunk of Meat": 2, "Coyote Fang": 1 });
});

// A corpse can yield two of the same item. `drops` is the numerator of a per-kill rate, so
// counting the second one would make a rate above 100% — which is not a probability.
test("two of an item from one corpse is still one kill that dropped it", () => {
  const [obs] = observeMobs([kill({ mob: "a rock spider", drops: ["Spiderling Silk", "Spiderling Silk"] })]);
  assert.equal(obs.kills, 1);
  assert.deepEqual(obs.drops, { "Spiderling Silk": 1 });
});

// The log reports every death in earshot. Counting strangers' kills pads the denominator with
// corpses you never had a chance to loot, and every rate drops for no reason.
test("someone else's kill doesn't count towards your drop rate", () => {
  const [obs] = observeMobs([
    kill({ mob: "a kobold", mine: true, drops: ["Bone Chips"] }),
    kill({ mob: "a kobold", mine: true }),
    kill({ mob: "a kobold", mine: false }),
    kill({ mob: "a kobold", mine: false }),
  ]);
  assert.equal(obs.kills, 2);
  assert.deepEqual(obs.drops, { "Bone Chips": 1 });
});

test("a kill you looted counts even if someone else landed the blow", () => {
  const [obs] = observeMobs([kill({ mob: "a kobold", mine: false, drops: ["Bone Chips"] })]);
  assert.equal(obs.kills, 1);
});

test("kills recorded before the killer was captured are taken at face value", () => {
  const [obs] = observeMobs([kill({ mob: "a kobold" }), kill({ mob: "a kobold" })]);
  assert.equal(obs.kills, 2);
});

test("the same mob in two zones is two tallies", () => {
  const obs = observeMobs([
    kill({ mob: "a rat", zone: "Ak'Anon" }),
    kill({ mob: "a rat", zone: "Steamfont Mountains" }),
  ]);
  assert.equal(obs.length, 2);
});

test("kills with no zone are skipped — an unplaceable rate compares to nothing", () => {
  assert.deepEqual(observeMobs([kill({ mob: "a rat", zone: undefined })]), []);
});

test("the roam area is the middle of where you killed it, and how far that spreads", () => {
  const [obs] = observeMobs([
    kill({ mob: "a coyote", y: 0, x: 0 }),
    kill({ mob: "a coyote", y: 100, x: 0 }),
    kill({ mob: "a coyote", y: 50, x: 50 }),
  ]);

  assert.equal(obs.area?.y, 50);
  assert.equal(obs.area?.x, 17);
  assert.equal(obs.area?.samples, 3);
  assert.ok(obs.area!.spread > 0);
});

test("positions too vague to trust are left out of the area", () => {
  const [obs] = observeMobs([
    kill({ mob: "a coyote", y: 10, x: 10, confidence: 1 }),
    kill({ mob: "a coyote", y: 9000, x: 9000, confidence: 0.05 }), // a wild guess
  ]);
  assert.equal(obs.area?.samples, 1);
  assert.equal(obs.area?.y, 10);
});

test("a drop rate is drops over kills, and says how much of it you saw", () => {
  const mine = observeMobs([
    kill({ mob: "a coyote", drops: ["Chunk of Meat"] }),
    kill({ mob: "a coyote" }),
    kill({ mob: "a coyote" }),
    kill({ mob: "a coyote" }),
  ]);

  const [known] = mergeObservations(mine, []);
  assert.equal(known.kills, 4);
  assert.equal(known.myKills, 4);
  assert.deepEqual(known.drops, [{ item: "Chunk of Meat", count: 1, rate: 0.25 }]);
  assert.deepEqual(known.contributors, []);
});

test("pooling a peer's observations sharpens the rate and records who helped", () => {
  const mine = observeMobs([kill({ mob: "a coyote", drops: ["Chunk of Meat"] })]);
  const theirs: MobObservation[] = [
    {
      mob: "a coyote",
      zone: "Steamfont Mountains",
      kills: 9,
      drops: { "Chunk of Meat": 2 },
      lastAt: "2026-07-29T02:00:00.000Z",
      by: "Bunnyslayer",
    },
  ];

  const [known] = mergeObservations(mine, theirs);
  assert.equal(known.kills, 10);
  assert.equal(known.myKills, 1); // one of the ten was yours
  assert.deepEqual(known.drops, [{ item: "Chunk of Meat", count: 3, rate: 0.3 }]);
  assert.deepEqual(known.contributors, ["Bunnyslayer"]);
  assert.equal(known.lastAt, "2026-07-29T02:00:00.000Z"); // the freshest of the two
});

test("pooled areas widen to cover every observer, weighted by their samples", () => {
  const mine = observeMobs([
    kill({ mob: "a coyote", y: 0, x: 0 }),
    kill({ mob: "a coyote", y: 0, x: 0 }),
    kill({ mob: "a coyote", y: 0, x: 0 }),
  ]);
  const theirs: MobObservation[] = [
    {
      mob: "a coyote",
      zone: "Steamfont Mountains",
      kills: 1,
      drops: {},
      area: { y: 400, x: 0, spread: 0, samples: 1 },
      lastAt: "2026-07-29T01:00:00.000Z",
      by: "Bunnyslayer",
    },
  ];

  const [known] = mergeObservations(mine, theirs);
  // Weighted toward the three samples at the origin, not the midpoint of the two centres.
  assert.equal(known.area?.y, 100);
  assert.equal(known.area?.samples, 4);
  // …and the spread has to reach the far observation, not shrink toward the average.
  assert.ok(known.area!.spread >= 300, `expected the area to cover both, got ${known.area!.spread}`);
});

test("mobs come back most-killed first", () => {
  const mine = observeMobs([
    kill({ mob: "a rat" }),
    kill({ mob: "a coyote" }),
    kill({ mob: "a coyote" }),
  ]);
  assert.deepEqual(
    mergeObservations(mine, []).map((k) => k.mob),
    ["a coyote", "a rat"],
  );
});
