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
  roamWhy,
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

// **What's stored is what the log said** (ADR 0083). An observation is written to disk and sent to
// peers, so it keeps the zone name verbatim — difficulty, ruleset, spelling and all — and every "these
// are one camp" judgement waits until something reads it.
test("a stored observation keeps the log's own zone name, variant and all", () => {
  const obs = observeMobs([
    kill({ mob: "a rat", zone: "The Steamfont Mountains", drops: ["Rat Ear"] }),
    kill({ mob: "a rat", zone: "The Steamfont Mountains 2 (Adaptive)", drops: ["Rat Ear"] }),
    kill({ mob: "a rat", zone: "Steamfont Mountains 3" }),
  ]);
  assert.deepEqual(
    obs.map((o) => `${o.zone} ×${o.kills}`),
    ["The Steamfont Mountains ×1", "The Steamfont Mountains 2 (Adaptive) ×1", "Steamfont Mountains 3 ×1"],
    "a variant must not be rewritten into a name the log never used",
  );
  // Summing is storage too — it's how a record that ages out keeps what it taught (ADR 0056) — so it
  // keeps the wording as well, and only adds up rows that are genuinely the same row.
  const summed = sumObservations(obs, obs);
  assert.deepEqual(summed.map((o) => o.kills), [2, 2, 2]);
  assert.deepEqual(summed.map((o) => o.zone), obs.map((o) => o.zone));
});

// One Steamfont, whatever the door was set to (ADR 0059). The difficulty changes what the mobs hit
// for; it doesn't make it a different animal in a different place — so the *aggregation* pools them.
test("the pooled view is one camp per place, named by the mapping table", () => {
  const mine = observeMobs([
    kill({ mob: "a rat", zone: "The Steamfont Mountains", drops: ["Rat Ear"] }),
    kill({ mob: "a rat", zone: "The Steamfont Mountains 2 (Adaptive)", drops: ["Rat Ear"] }),
    kill({ mob: "a rat", zone: "Steamfont Mountains 3" }),
  ]);
  const older: MobObservation = {
    mob: "a rat",
    zone: "Steamfont Mountains 2 (Adaptive)",
    kills: 10,
    drops: { "Rat Ear": 4 },
    lastAt: "2026-07-29T01:00:00.000Z",
    by: "Fippy",
  };
  const pooled = mergeObservations(mine, [older]);
  assert.equal(pooled.length, 1);
  assert.equal(pooled[0].kills, 13);
  assert.equal(pooled[0].myKills, 3);
  assert.deepEqual(pooled[0].drops, [{ item: "Rat Ear", count: 6, rate: 0.462, myCount: 2 }]);
  // The table's name for the place, so it can't depend on which row happened to arrive first.
  assert.equal(pooled[0].zone, "Steamfont Mountains");
});

// The other spelling problem (ADR 0075): a map pack's label is a letter out, so a peer's tally for
// the zone you're standing in used to sit beside yours as a second camp with its own thin rate.
test("two spellings of one zone pool into one camp, under the name we show", () => {
  const mine = observeMobs([
    kill({ mob: "a rat", zone: "Toxxulia Forest", drops: ["Rat Ear"] }),
    kill({ mob: "a rat", zone: "Toxulia Forest" }),
    kill({ mob: "a rat", zone: "Toxxulia Forest" }),
  ]);
  assert.equal(mine.length, 2, "stored as the log spelled them");
  const theirs: MobObservation = {
    mob: "a rat",
    zone: "Toxulia Forest",
    kills: 20,
    drops: { "Rat Ear": 5 },
    lastAt: "2026-07-29T01:00:00.000Z",
    by: "Fippy",
  };
  const [pooled] = mergeObservations(mine, [theirs]);
  assert.equal(pooled.kills, 23);
  assert.equal(pooled.myKills, 3);
  // Not "the spelling seen most" — the gazetteer's, so the same rows always read the same way.
  assert.equal(pooled.zone, "Toxxulia Forest");
  assert.deepEqual(pooled.contributors, ["Fippy"]);
});

test("aggregating is repeatable — the answer doesn't depend on the order rows arrive", () => {
  // The property that "entirely repeatable and fixable" needs: no clustering, no first-seen or
  // most-seen naming, nothing that a different order could answer differently.
  const rows: MobObservation[] = ["Toxxulia Forest", "Toxulia Forest", "The Toxxulia Forest 3"].map((zone, i) => ({
    mob: "a rat",
    zone,
    kills: i + 1,
    drops: { "Rat Ear": 1 },
    lastAt: `2026-07-2${i + 1}T01:00:00.000Z`,
  }));
  const forwards = mergeObservations(rows, []);
  const backwards = mergeObservations([...rows].reverse(), []);
  assert.deepEqual(backwards, forwards);
  assert.equal(forwards.length, 1);
  assert.equal(forwards[0].kills, 6);
  assert.equal(forwards[0].zone, "Toxxulia Forest");
});

test("zones that merely look alike stay two tallies", () => {
  const kills = [kill({ mob: "a rat", zone: "East Commonlands" }), kill({ mob: "a rat", zone: "West Commonlands" })];
  assert.equal(observeMobs(kills).length, 2, "a rate for one camp must never absorb the other's kills");
  // And they must not be pooled by the aggregation either — this is the merge that would hide it.
  assert.equal(mergeObservations(observeMobs(kills), []).length, 2);
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
  assert.deepEqual(known.drops, [{ item: "Chunk of Meat", count: 1, rate: 0.25, myCount: 1 }]);
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
  assert.deepEqual(known.drops, [{ item: "Chunk of Meat", count: 3, rate: 0.3, myCount: 1 }]);
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
    drops: items.map((item) => ({ item, count: 1, rate: 0.1, myCount: 1 })),
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

// The one sentence three lists show under a roam area. It must hedge (it's an average of kills, not
// a spawn point) and it must carry its sample, since a centre from one kill is not a camp.
test("a roam area says how rough it is and what it rests on", () => {
  assert.equal(
    roamWhy({ y: 120.4, x: -40.6, spread: 30, samples: 12 }),
    "Killed within about 30 units of 120, -41, averaged over 12 positioned kills",
  );
  assert.match(roamWhy({ y: 1, x: 2, spread: 0, samples: 1 }), /over 1 positioned kill$/);
});
