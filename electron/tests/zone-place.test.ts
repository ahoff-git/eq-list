/**
 * Which place a recorded zone name means — the read-time half of zone naming
 * ([ADR 0083](../../specs/decisions/0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)).
 *
 * Two properties carry the design, and they pull against each other:
 *
 *  - **A key comes from a table.** `placeName` must answer the same way whatever else it has been
 *    asked, because it names groups in stored data that is re-aggregated constantly. Anything derived
 *    from the batch — most-seen, first-seen, clustering — fails that, which is why it isn't used.
 *  - **A zone nobody has named keeps its own name.** The fallback must not guess: it folds decoration
 *    away (that's a rule, not an assumption) and stops there.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { placeKey, placeName, samePlace } from "../../src/shared/zones/place";
import { zoneKey } from "../../src/shared/names";

test("a recorded name resolves to the place we name, however it was written", () => {
  for (const recorded of [
    "Steamfont Mountains",
    "The Steamfont Mountains",
    "The Steamfont Mountains 2 (Adaptive)",
    "Steamfont Mountains 3",
    "steamfont mountains",
  ]) {
    assert.equal(placeName(recorded), "Steamfont Mountains", recorded);
  }
  // The three vocabularies for one place, all landing on the name we show (ADR 0076).
  assert.equal(placeName("Kerra Isle"), "Kerra Ridge"); // the log's
  assert.equal(placeName("Kerra Island"), "Kerra Ridge"); // the wiki's
  assert.equal(placeName("Toxulia Forest"), "Toxxulia Forest"); // a pack's, a letter out (ADR 0075)
  assert.equal(placeName("Gukbottom"), "Lower Guk"); // a file name, as an old build would have shown it
});

test("the answer is a property of the name alone — nothing about the batch can change it", () => {
  // Same question, asked in different company. This is what "entirely repeatable" needs: aggregation
  // runs over stored rows every time a panel opens, and the grouping must not drift.
  const asked = ["Toxulia Forest", "Toxxulia Forest", "The Toxxulia Forest 3", "Toxulia Forest"];
  const first = asked.map(placeName);
  const again = [...asked].reverse().map(placeName).reverse();
  assert.deepEqual(again, first);
  assert.deepEqual(new Set(first), new Set(["Toxxulia Forest"]));
});

test("a zone no table knows keeps its own name, folded only by rule", () => {
  // A Legends custom zone, a Kunark zone the gazetteer's in-era scope excludes, a pack's own map.
  assert.equal(placeName("Somewhere Invented"), "Somewhere Invented");
  assert.equal(placeName("Somewhere Invented 3 (Adaptive)"), "Somewhere Invented");
  assert.equal(placeKey("Somewhere Invented 2"), zoneKey("Somewhere Invented"));
  // And two *different* unknown spellings stay apart: guessing they're one place is the assumption
  // this refuses. A filter may still admit both — see below.
  assert.notEqual(placeKey("Somewhere Invented"), placeKey("Somewhere Invnted"));
});

test("a place is grouped by key, and two real zones never share one", () => {
  assert.equal(placeKey("The Feerrott 2"), placeKey("feerrott"));
  assert.notEqual(placeKey("East Commonlands"), placeKey("West Commonlands"));
  assert.notEqual(placeKey("North Qeynos"), placeKey("South Qeynos"));
  assert.notEqual(placeKey("Upper Guk"), placeKey("Lower Guk"));
  // A sub-zone is its own camp, not its parent's: `narrow` is deliberately off here.
  assert.notEqual(placeKey("North Qeynos"), placeKey("Qeynos"));
});

test("a filter may be looser than a key", () => {
  // `samePlace` answers questions ("what died here?"), so it gets the one-edit rule as a second
  // chance for a pair no table can reach — showing a row that doesn't belong is recoverable, where a
  // key that merged two camps would corrupt every rate derived from them.
  assert.ok(samePlace("Toxxulia Forest", "Toxulia Forest"));
  assert.ok(samePlace("Somewhere Invented", "Somewhere Invnted"), "neither is in any table");
  assert.ok(samePlace("The Steamfont Mountains 2 (Adaptive)", "Steamfont Mountains"));
  assert.ok(!samePlace("East Commonlands", "West Commonlands"));
  assert.ok(!samePlace(undefined, "Steamfont Mountains"));
  assert.ok(!samePlace("Steamfont Mountains", ""));
});
