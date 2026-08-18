/**
 * Black-box tests for reading a loot table backwards: "who drops the thing I'm holding, and
 * where?" — the item page's half of ADR 0025's reconciliation.
 *
 * The verdicts are drop-truth's, so what's pinned here is what changes when the question is asked
 * from the item's end: that a mob is one row however many camps it was killed in, that a place with
 * no drop is still evidence rather than clutter, and that a wiki claim only becomes an `unseen` row
 * when our own kills are standing behind it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { itemDropSources, itemDropTotals, priceOfItem } from "../../src/shared/item-sources";
import { SUSPICIOUS_AFTER_KILLS } from "../../src/shared/drop-truth";
import type { MobKnowledge } from "../../src/shared/mob-stats";
import type { ItemSource } from "../../src/shared/types";

/** A pooled tally with just the parts these rows read. */
function known(
  mob: string,
  zone: string,
  kills: number,
  drops: Record<string, number>,
  extra: Partial<MobKnowledge> = {},
): MobKnowledge {
  return {
    mob,
    zone,
    kills,
    myKills: kills,
    drops: Object.entries(drops).map(([item, count]) => ({ item, count, rate: count / kills })),
    lastAt: "2026-07-17T18:41:14",
    contributors: [],
    copper: 0,
    copperPerKill: 0,
    ...extra,
  };
}

const drops = (mob: string, zone?: string): ItemSource => ({ kind: "drop", where: mob, detail: zone });

test("a drop the wiki links to that mob is confirmed, and carries the rate the page can't state", () => {
  const [row] = itemDropSources("Bone Chips", [known("a skeleton", "Befallen", 40, { "Bone Chips": 10 })], [
    drops("a skeleton", "Befallen"),
  ]);
  assert.equal(row.verdict, "confirmed");
  assert.equal(row.seen, 10);
  assert.equal(row.kills, 40);
  assert.equal(row.rate, 0.25);
  assert.equal(row.trustObserved, true);
});

// The headline claim of ADR 0025, arriving from the item's end: the wiki's "Drops From" has never
// heard of this mob, and nothing else on the page could ever say so.
test("a mob no wiki source names is undocumented", () => {
  const [row] = itemDropSources(
    "Minotaur Blood",
    [known("minotaur slaver", "Steamfont Mountains", 4, { "Minotaur Blood": 1 })],
    [drops("a minotaur guard")],
  );
  assert.equal(row.verdict, "undocumented");
  assert.equal(row.seen, 1);
  assert.equal(row.trustObserved, false, "four kills is not a rate");
});

test("a mob is one row however many camps it was killed in, and the places sit under it", () => {
  const [row] = itemDropSources(
    "Gnoll Fang",
    [
      known("a gnoll pup", "Blackburrow", 30, { "Gnoll Fang": 6 }),
      known("a gnoll pup", "Qeynos Hills", 10, { "Gnoll Fang": 4 }),
    ],
    [],
  );
  assert.equal(row.kills, 40);
  assert.equal(row.seen, 10);
  assert.equal(row.rate, 0.25, "the rate is the pooled one, not the mean of two rates");
  assert.deepEqual(
    row.places.map((p) => [p.zone, p.seen, p.rate]),
    [
      ["Blackburrow", 6, 0.2],
      ["Qeynos Hills", 4, 0.4],
    ],
  );
});

// "Where-ish" is the part only observation can answer, and it's per place: a mob that gives the
// item up in one camp and never in another is telling you where to stand.
test("a place that has never produced it is kept, and sorts below the ones that have", () => {
  const [row] = itemDropSources(
    "Rat Ears",
    [
      known("a rat", "Qeynos Catacombs", 50, {}),
      known("a rat", "Blackburrow", 20, { "Rat Ears": 5 }, { area: { y: 120, x: -40, spread: 30, samples: 12 } }),
    ],
    [],
  );
  assert.equal(row.places.length, 2);
  assert.equal(row.places[0].zone, "Blackburrow");
  assert.equal(row.places[0].seen, 5);
  assert.equal(row.places[0].area?.spread, 30, "the roam centre rides along — it's the only 'where' we have");
  assert.equal(row.places[1].zone, "Qeynos Catacombs");
  assert.equal(row.places[1].seen, 0);
});

// The wiki keeps the article and the log strips it (`mobKey`), and a page that failed to match its
// own mob would report every confirmed drop as a discovery.
test("the wiki's article and the log's stripped name are the same mob", () => {
  const [row] = itemDropSources("Bone Chips", [known("skeleton", "Befallen", 20, { "Bone Chips": 3 })], [
    drops("A Skeleton"),
  ]);
  assert.equal(row.verdict, "confirmed");
});

// Same fold as drop-truth, for the same reason: every grade is one drop with a second roll on it,
// and the wiki only ever lists the base item (ADR 0057).
test("a graded drop answers for the item the page is about", () => {
  const [row] = itemDropSources(
    "Minotaur Battle Axe",
    [known("minotaur slaver", "Steamfont Mountains", 8, { "Minotaur Battle Axe +1": 1, "Minotaur Battle Axe +3": 1 })],
    [],
  );
  assert.equal(row.seen, 2, "both grades count towards the one drop");
  assert.equal(row.rate, 0.25);
});

test("a wiki claim our kills keep failing to produce becomes an unseen row, and eventually a suspicious one", () => {
  const thin = itemDropSources("Amber", [known("minotaur slaver", "Steamfont Mountains", 4, {})], [drops("minotaur slaver")]);
  assert.equal(thin[0].verdict, "unseen");
  assert.equal(thin[0].suspicious, false, "four kills prove nothing");

  const thick = itemDropSources(
    "Amber",
    [known("minotaur slaver", "Steamfont Mountains", SUSPICIOUS_AFTER_KILLS, {})],
    [drops("minotaur slaver")],
  );
  assert.equal(thick[0].suspicious, true);
});

// Without kills there is no observation to add, and the wiki's own claim is already on the page
// above — a row saying "0 of 0" would be the app repeating the wiki back with a number attached.
test("a wiki-claimed mob we've never killed gets no row at all", () => {
  const rows = itemDropSources("Amber", [known("a rat", "Blackburrow", 30, {})], [drops("minotaur slaver")]);
  assert.deepEqual(rows, []);
});

test("what we've seen leads, and the wiki's contradicted claims sink", () => {
  const rows = itemDropSources(
    "Bone Chips",
    [
      known("a skeleton", "Befallen", 100, {}),
      known("a decaying skeleton", "Befallen", 20, { "Bone Chips": 8 }),
      known("a ghoul", "Befallen", 30, { "Bone Chips": 3 }),
    ],
    [drops("a skeleton"), drops("a decaying skeleton")],
  );
  assert.deepEqual(
    rows.map((r) => [r.mob, r.verdict]),
    [
      ["a decaying skeleton", "confirmed"],
      ["a ghoul", "undocumented"],
      ["a skeleton", "unseen"],
    ],
  );
});

test("the totals count the kills behind every row and the mobs that actually produced it", () => {
  const rows = itemDropSources(
    "Bone Chips",
    [known("a skeleton", "Befallen", 100, {}), known("a ghoul", "Befallen", 30, { "Bone Chips": 3 })],
    [drops("a skeleton")],
  );
  assert.deepEqual(itemDropTotals(rows), { kills: 130, seen: 3, mobs: 1 });
});

test("pooled kills keep their provenance", () => {
  const [row] = itemDropSources(
    "Bone Chips",
    [known("a skeleton", "Befallen", 60, { "Bone Chips": 9 }, { myKills: 20, contributors: ["Kainos"] })],
    [],
  );
  assert.equal(row.kills, 60);
  assert.equal(row.myKills, 20);
  assert.deepEqual(row.contributors, ["Kainos"]);
});

test("an item nothing has ever dropped, and a blank name, come back empty", () => {
  assert.deepEqual(itemDropSources("Rubicite Boots", [known("a rat", "Blackburrow", 30, {})], []), []);
  assert.deepEqual(itemDropSources("   ", [known("a rat", "Blackburrow", 30, { "Rat Ears": 5 })], []), []);
});

test("a price is found by the item's own name first, and by its base name failing that", () => {
  const prices = [
    { item: "Dragoon Dirk", unitCopper: 400 },
    { item: "Dragoon Dirk +2", unitCopper: 900 },
  ];
  assert.equal(priceOfItem("Dragoon Dirk +2", prices)?.unitCopper, 900);
  assert.equal(priceOfItem("dragoon dirk", prices)?.unitCopper, 400);
  // Only the graded sale exists, so it stands in — and comes back whole, so the caller can say so.
  assert.equal(priceOfItem("Dragoon Dirk", prices.slice(1))?.item, "Dragoon Dirk +2");
  assert.equal(priceOfItem("Bone Chips", prices), undefined);
});
