/**
 * Black-box tests for a zone's stated levels
 * ([src/shared/zones/levels.ts](../../src/shared/zones/levels.ts)).
 *
 * Two properties carry the feature. **Verbatim**: a zone with two bands keeps both, because the span
 * they'd collapse to is a claim the wiki declined to make. **Loose but not reckless**: the names in
 * hand come from item pages, map packs and the log, so a range has to survive rephrasing — while
 * refusing to answer at all rather than pin somebody else's danger on a zone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ZONE_LEVELS, zoneLevelText, zoneLevelWhy, zoneLevels } from "../../src/shared/zones/levels";

test("a zone's levels are the wiki's, word for word", () => {
  assert.equal(zoneLevels("Greater Faydark")?.levels, "1-12");
  // Two bands and a gap. Flattening this to 1-35 would say Butcherblock holds levels 20-34, which is
  // exactly what the wiki took the trouble not to say.
  assert.equal(zoneLevels("Butcherblock Mountains")?.levels, "1-15, 35");
  // Prose the wiki wrote on purpose survives too — where each band is, is half the answer.
  assert.equal(zoneLevels("Temple of Droga")?.levels, "29-34 Droga Main, 33-38 Inner Sanctum");
});

test("only the hyphen between two levels becomes a dash — the rest is left alone", () => {
  assert.equal(zoneLevelText({ zone: "Blackburrow", levels: "4-15+" }), "4–15+");
  assert.equal(zoneLevelText({ zone: "x", levels: "1 - 20, 35" }), "1–20, 35");
  // Not a range: a lone number, and a hyphen with no level on the far side of it.
  assert.equal(zoneLevelText({ zone: "Tutorial Zone", levels: "1" }), "1");
  assert.equal(zoneLevelText({ zone: "x", levels: "20-40+ (50+ inside pit)" }), "20–40+ (50+ inside pit)");
});

test("the same zone under another name is the same zone", () => {
  const feerrott = zoneLevels("The Feerrott")?.levels;
  assert.ok(feerrott);
  // The log's article, a difficulty grade, and a mapmaker's spelling all land on it.
  assert.equal(zoneLevels("Feerrott")?.levels, feerrott);
  assert.equal(zoneLevels("The Feerrott 3")?.levels, feerrott);
  assert.equal(zoneLevels("The Ferrott")?.levels, feerrott);
  // Word order is the one no fold can reach and the resolver's `order` tier can.
  assert.equal(zoneLevels("Mountains of Rathe")?.levels, zoneLevels("Rathe Mountains")?.levels);
});

test("a page-title qualifier is not part of the zone's name", () => {
  // The wiki disambiguates a god from his zone, and one Chardok from the other. A drop source says
  // neither, so the lookup must not require them — while the answer still names its page.
  assert.equal(zoneLevels("Cazic Thule")?.levels, ZONE_LEVELS["Cazic Thule (Zone)"]);
  assert.equal(zoneLevels("Cazic Thule")?.zone, "Cazic Thule (Zone)");
  assert.ok(zoneLevels("Chardok")?.levels);
});

test("silence where the wiki is silent, and where a name can't be placed", () => {
  // Cities state no monster levels — nothing in their infobox to show, so nothing is shown.
  assert.equal(zoneLevels("Kaladim"), undefined);
  assert.equal(zoneLevels("Freeport"), undefined);
  assert.equal(zoneLevels(""), undefined);
  assert.equal(zoneLevels("   "), undefined);
  // Spelling alone is refused: a range is read as "this is what you're walking into", and the nearest
  // name is not good enough a reason to hang one zone's danger on another.
  assert.equal(zoneLevels("Blackburrower Deeps"), undefined);
  assert.equal(zoneLevels("Plane of Nonexistence"), undefined);
});

test("a range says where it came from, and says so louder when the name differs", () => {
  const asked = zoneLevels("Greater Faydark");
  assert.ok(asked);
  assert.match(zoneLevelWhy(asked, "Greater Faydark"), /levels 1-12/);
  assert.doesNotMatch(zoneLevelWhy(asked, "Greater Faydark"), /eqlwiki's "/);
  // Answered from a page the caller didn't name — worth spotting, so it's spelled out.
  assert.match(zoneLevelWhy(asked, "Faydark"), /eqlwiki's "Greater Faydark"/);
});

test("the shipped table is levels, not shrugs", () => {
  const entries = Object.entries(ZONE_LEVELS);
  assert.ok(entries.length > 90, `expected the wiki's ~99 zones, got ${entries.length}`);
  for (const [zone, levels] of entries) {
    assert.match(levels, /\d/, `${zone} states no level at all`);
  }
});
