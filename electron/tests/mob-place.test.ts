/**
 * Black-box tests for where a mob is and who says so: your kills, peers' kills, and the wiki's
 * stated coordinate, ranked rather than merged (ADR 0142). Also the stat-card reader the map and
 * the wiki page view share.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardLoc, cardZone, mobPlace, placeLabel, statesNothing, wikiPlace } from "../../src/shared/map/mob-place";
import type { MobArea } from "../../src/shared/mob-stats";

const area = (over: Partial<MobArea> = {}): MobArea => ({ y: 100, x: -200, spread: 30, samples: 8, ...over });

// ── the ranking ──────────────────────────────────────────────────────────────

test("your own kills place it, and say so by saying nothing else", () => {
  const place = mobPlace({ mine: area(), pooled: area() });
  assert.equal(place?.source, "yours");
  assert.deepEqual([place?.y, place?.x, place?.spread, place?.samples], [100, -200, 30, 8]);
  assert.match(place!.why, /within about 30 units/);
  assert.doesNotMatch(place!.why, /pooled|not yours/);
});

test("kills of yours and a peer's are pooled, and the pooled figure is the one used", () => {
  const place = mobPlace({
    mine: area(),
    pooled: area({ y: 150, x: -250, spread: 60, samples: 20 }),
    contributors: ["Bob"],
  });
  assert.equal(place?.source, "pooled");
  // The pooled centre, not yours: `mergeAreas` weights by sample count and can only widen.
  assert.deepEqual([place?.y, place?.x, place?.spread, place?.samples], [150, -250, 60, 20]);
  assert.match(place!.why, /pooled with Bob/);
});

test("a position that is nobody's but a peer's says whose it is", () => {
  const place = mobPlace({ pooled: area(), contributors: ["Bob"] });
  assert.equal(place?.source, "peers");
  assert.match(place!.why, /Bob' kills, not yours/);
});

test("the wiki answers only where no kill can", () => {
  const wiki = { zone: "Steamfont Mountains", loc: { y: 1555, x: -2410 } };
  // With kills of any kind, it isn't consulted at all.
  assert.equal(mobPlace({ mine: area(), wiki })?.source, "yours");
  assert.equal(mobPlace({ pooled: area(), contributors: ["Bob"], wiki })?.source, "peers");

  const stated = mobPlace({ wiki });
  assert.equal(stated?.source, "wiki");
  assert.deepEqual([stated?.y, stated?.x], [1555, -2410]);
  // No spread and no samples: nothing was measured, and "±0 from 0 kills" would read as the
  // tightest figure on the map rather than the softest.
  assert.equal(stated?.spread, undefined);
  assert.equal(stated?.samples, 0);
  assert.match(stated!.why, /wiki states this spot in Steamfont Mountains/);
});

test("a stated spread of zero is not the same as no spread at all", () => {
  // Every kill on one point is the tightest measurement there is; a wiki point is no measurement.
  assert.equal(mobPlace({ mine: area({ spread: 0, samples: 1 }) })?.spread, 0);
  assert.equal(mobPlace({ wiki: { loc: { y: 1, x: 2 } } })?.spread, undefined);
});

test("nothing that can place it is an answer, not a guess", () => {
  assert.equal(mobPlace({}), undefined);
  // A wiki page that names a zone but states no coordinate places nothing.
  assert.equal(mobPlace({ wiki: { zone: "Steamfont Mountains" } }), undefined);
});

test("each source is named in words", () => {
  assert.deepEqual(
    (["yours", "pooled", "peers", "wiki"] as const).map(placeLabel),
    ["your kills", "pooled kills", "peers' kills", "the wiki"],
  );
});

// ── the stat card ────────────────────────────────────────────────────────────

const LINES = ["Race: Minotaur", "Level: 30", "Zone: Steamfont Mountains", "Location: (1555, -2410)", "AC: 214"];

test("reads the spawn zone and the coordinate off a mob's stat card", () => {
  assert.equal(cardZone(LINES), "Steamfont Mountains");
  assert.deepEqual(cardLoc(LINES), { y: 1555, x: -2410 });
  assert.deepEqual(wikiPlace({ title: "Minotaur Lord", lines: LINES }), {
    zone: "Steamfont Mountains",
    loc: { y: 1555, x: -2410 },
  });
});

test("both spellings of the zone row are read", () => {
  assert.equal(cardZone(["Spawn Zone: Lower Guk"]), "Lower Guk");
});

test("a card that states nothing states nothing", () => {
  // The hill giant's real card: a zone and a location, both of them the word "Various".
  const various = ["Zone: Various", "Location: Various"];
  assert.equal(cardZone(various), undefined);
  assert.equal(cardLoc(various), undefined);
  assert.equal(wikiPlace({ title: "A Hill Giant", lines: various }), undefined);
  assert.equal(wikiPlace(undefined), undefined);
  for (const blank of ["Various", "unknown", "None", "n/a", "--"]) assert.ok(statesNothing(blank));
  assert.equal(statesNothing("Lower Guk"), false);
});

test("a decimal coordinate is read as written", () => {
  assert.deepEqual(cardLoc(["Location: (-1555.5, 2410)"]), { y: -1555.5, x: 2410 });
});

test("half a card is still half an answer", () => {
  assert.deepEqual(wikiPlace({ title: "x", lines: ["Zone: Lower Guk"] }), { zone: "Lower Guk", loc: undefined });
  assert.deepEqual(wikiPlace({ title: "x", lines: ["Location: (1, 2)"] }), { zone: undefined, loc: { y: 1, x: 2 } });
});
