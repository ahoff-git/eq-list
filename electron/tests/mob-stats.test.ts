/**
 * Black-box tests for mob knowledge: observed drop rates, roam areas, and pooling one
 * player's observations with another's. Rates are the point, so the tests care most about the
 * denominator being right and provenance surviving the merge.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dropKey,
  dropSources,
  mergeObservations,
  mobKey,
  observeMobs,
  sumObservations,
  type MobKnowledge,
  type MobObservation,
} from "../../src/shared/mob-stats";
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

// One Steamfont, whatever the door was set to (ADR 0059). The difficulty changes what the mobs
// hit for; it doesn't make it a different animal in a different place.
test("a zone's difficulty variants are one tally, named for the zone", () => {
  const obs = observeMobs([
    kill({ mob: "a rat", zone: "The Steamfont Mountains", drops: ["Rat Ear"] }),
    kill({ mob: "a rat", zone: "The Steamfont Mountains 2 (Adaptive)", drops: ["Rat Ear"] }),
    kill({ mob: "a rat", zone: "Steamfont Mountains 3" }),
  ]);
  assert.equal(obs.length, 1);
  assert.equal(obs[0].kills, 3);
  assert.deepEqual(obs[0].drops, { "Rat Ear": 2 });
  // Named for the place, not the first door seen — the sample is no longer one variant's.
  assert.equal(obs[0].zone, "The Steamfont Mountains");
});

// Retired tallies and peers' carry whatever their build stamped. Folding at the key is what makes
// merging them retroactive: no migration, and no sample split in two by a spelling.
test("a tally stored under a decorated zone merges with the plain one", () => {
  const older: MobObservation = {
    mob: "a rat",
    zone: "Steamfont Mountains 2 (Adaptive)",
    kills: 10,
    drops: { "Rat Ear": 4 },
    lastAt: "2026-07-29T01:00:00.000Z",
  };
  const [summed] = sumObservations([older], observeMobs([kill({ mob: "a rat", zone: "Steamfont Mountains" })]));
  assert.equal(summed.kills, 11);
  assert.equal(summed.zone, "Steamfont Mountains");

  const [pooled] = mergeObservations(observeMobs([kill({ mob: "a rat", zone: "Steamfont Mountains" })]), [
    { ...older, by: "Fippy" },
  ]);
  assert.equal(pooled.kills, 11);
  assert.equal(pooled.myKills, 1);
});

// The other spelling problem (ADR 0075): a map pack's label is a letter out, so a peer's tally for
// the zone you're standing in used to sit beside yours as a second camp with its own thin rate.
test("two spellings of one zone are one tally, under the spelling seen most", () => {
  const obs = observeMobs([
    kill({ mob: "a rat", zone: "Toxxulia Forest", drops: ["Rat Ear"] }),
    kill({ mob: "a rat", zone: "Toxulia Forest" }),
    kill({ mob: "a rat", zone: "Toxxulia Forest" }),
  ]);
  assert.equal(obs.length, 1);
  assert.equal(obs[0].kills, 3);
  assert.equal(obs[0].zone, "Toxxulia Forest");

  const theirs: MobObservation = {
    mob: "a rat",
    zone: "Toxulia Forest",
    kills: 20,
    drops: { "Rat Ear": 5 },
    lastAt: "2026-07-29T01:00:00.000Z",
    by: "Fippy",
  };
  const [pooled] = mergeObservations(obs, [theirs]);
  assert.equal(pooled.kills, 23);
  assert.equal(pooled.myKills, 3);
  // Yours names the pool even though they out-killed you: it's the spelling your own log uses.
  assert.equal(pooled.zone, "Toxxulia Forest");
  assert.deepEqual(pooled.contributors, ["Fippy"]);
});

test("zones that merely look alike stay two tallies", () => {
  const obs = observeMobs([
    kill({ mob: "a rat", zone: "East Commonlands" }),
    kill({ mob: "a rat", zone: "West Commonlands" }),
  ]);
  assert.equal(obs.length, 2, "a rate for one camp must never absorb the other's kills");
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

// ── what the mob itself carried ──
//
// Coin is a mob's own money, gathered separately from what its drops vendor for (ADR 0047).
// It merges by addition like a drop count, so a pooled coin-per-kill is one bigger sample
// rather than an average of averages.

test("coin off corpses rolls up into a per-kill figure", () => {
  const [obs] = observeMobs([
    kill({ mob: "a coyote", coin: 30 }),
    kill({ mob: "a coyote" }), // carried nothing, which still counts as a kill
    kill({ mob: "a coyote", coin: 10 }),
    kill({ mob: "a coyote" }),
  ]);
  assert.equal(obs.copper, 40);

  const [known] = mergeObservations([obs], []);
  assert.equal(known.copper, 40);
  assert.equal(known.copperPerKill, 10); // 40 over 4 kills, empty corpses included
});

test("a pooled coin-per-kill is one bigger sample, not an average of averages", () => {
  const mine = observeMobs([kill({ mob: "a coyote", coin: 100 })]);
  const theirs: MobObservation[] = [
    {
      mob: "a coyote",
      zone: "Steamfont Mountains",
      kills: 9,
      drops: {},
      copper: 90,
      lastAt: "2026-07-29T02:00:00.000Z",
      by: "Bunnyslayer",
    },
  ];

  const [known] = mergeObservations(mine, theirs);
  assert.equal(known.copper, 190);
  assert.equal(known.copperPerKill, 19); // 190 over 10 — not (100 + 10) / 2
});

test("a peer who reports no coin at all pools as nothing, not as a gap", () => {
  const theirs: MobObservation[] = [
    { mob: "a coyote", zone: "Steamfont Mountains", kills: 4, drops: {}, lastAt: "", by: "Bunnyslayer" },
  ];
  const [known] = mergeObservations([], theirs);
  assert.equal(known.copper, 0);
  assert.equal(known.copperPerKill, 0);
});

test("coin you took is proof the corpse was yours, whoever landed the blow", () => {
  const [obs] = observeMobs([kill({ mob: "a coyote", killer: "Bunnyslayer", mine: false, coin: 30 })]);
  assert.equal(obs.kills, 1, "you looted it, so it counts");
  assert.equal(obs.copper, 30);
});

/** A tally with just the parts `dropSources` reads. */
function known(mob: string, zone: string, items: string[]): MobKnowledge {
  return {
    mob,
    zone,
    kills: 10,
    myKills: 10,
    drops: items.map((item) => ({ item, count: 1, rate: 0.1 })),
    lastAt: "2026-07-29T01:00:00.000Z",
    contributors: [],
    copper: 0,
    copperPerKill: 0,
  };
}

test("dropKey folds case and stray space, and nothing else", () => {
  assert.equal(dropKey("  Snake Fang "), dropKey("snake fang"));
  // Unlike a mob's name, an item's article is part of it — the loot line names it in full.
  assert.notEqual(dropKey("a Shiny Brass Idol"), dropKey("Shiny Brass Idol"));
});

test("a drop knows every mob it comes off, not just the one it's listed under", () => {
  const sources = dropSources([
    known("a puma", "Kerra Ridge", ["Puma Skin", "Snake Fang"]),
    known("a snake", "Kerra Ridge", ["Snake Fang"]),
    known("a bat", "Kerra Ridge", ["Bat Wing"]),
  ]);
  assert.deepEqual(sources.get(dropKey("Snake Fang")), ["a puma", "a snake"]);
  assert.deepEqual(sources.get(dropKey("Bat Wing")), ["a bat"]);
  assert.equal(sources.get(dropKey("Puma Skin"))?.length, 1);
});

test("an item is looked up however it was written down", () => {
  const sources = dropSources([known("a puma", "Kerra Ridge", ["  SNAKE fang"])]);
  assert.deepEqual(sources.get(dropKey("Snake Fang")), ["a puma"]);
});

test("the same mob behind two doors is one thing to go looking for", () => {
  // Zones are tallied separately, but the answer to "where is this from" is a set of mobs to
  // point at — naming the puma twice would ring nothing extra and read as two of them.
  const sources = dropSources([
    known("a puma", "Kerra Ridge", ["Puma Skin"]),
    known("a puma", "Blackburrow", ["Puma Skin"]),
  ]);
  assert.deepEqual(sources.get(dropKey("Puma Skin")), ["a puma"]);
});

test("an item nothing here drops has no sources rather than an empty answer", () => {
  const sources = dropSources([known("a puma", "Kerra Ridge", ["Puma Skin"])]);
  assert.equal(sources.get(dropKey("Rusty Dagger")), undefined);
});
