/**
 * Tests for the era verdict derived from the zones Lucy says an item comes from
 * ([src/shared/lucy-era.ts](../../src/shared/lucy-era.ts)).
 *
 * **Every zone string quoted here is a real one, copied off a real Lucy item page.** That matters
 * more than usual: the whole module exists because Lucy has no era field, so its only evidence is
 * how that site happens to spell a zone — and an invented spelling would test nothing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { eraFromSourceZones, placeableZone, zoneReadings } from "../../src/shared/lucy-era";
import { outOfEraSet } from "../../src/shared/zones/expansions";

// ── reading one of Lucy's zone strings ────────────────────────────────────────

test("a parenthesised gloss is tried as a name of its own", () => {
  // Lucy calls The Hole by its modern name and glosses it with the one players use. The gloss is the
  // only half the gazetteer knows, so dropping it would lose the zone entirely.
  const readings = zoneReadings("Ruins of Old Paineel 2.0 (The Hole)");
  assert.ok(readings.includes("The Hole"));
  assert.ok(readings.includes("Ruins of Old Paineel 2.0"));
  assert.equal(readings[0], "Ruins of Old Paineel 2.0 (The Hole)", "the literal string is tried first");
});

test("an expansion tag and a revamp version are decoration, not identity", () => {
  assert.ok(zoneReadings("The Overthere [RoS]").includes("The Overthere"));
  assert.ok(zoneReadings("Crystal Caverns [ToV]").includes("Crystal Caverns"));
  assert.ok(zoneReadings("West Freeport 2.0").includes("West Freeport"));
  assert.ok(zoneReadings("Lavastorm Mountains 3.0").includes("Lavastorm Mountains"));
});

test("a plain name is left alone", () => {
  assert.deepEqual(zoneReadings("Grobb"), ["Grobb"]);
});

// ── placing a zone ───────────────────────────────────────────────────────────

test("zones this server runs are placeable, however Lucy spells them", () => {
  for (const zone of [
    "Grobb",
    "Southern Felwithe",
    "West Freeport 2.0",
    "Ruins of Old Paineel 2.0 (The Hole)",
  ]) {
    assert.ok(placeableZone(zone), `${zone} should be placeable`);
  }
});

test("zones from expansions this server hasn't opened are not", () => {
  // Kael Drakkel and Western Wastes are Velious; Shar Vahl and Shadeweaver's Tangle are Luclin;
  // Stratos is far later still. The gazetteer stops at the Planes, so none of these can be placed.
  for (const zone of [
    "Kael Drakkel",
    "Western Wastes [CoV]",
    "Shar Vahl, Divided",
    "Shadeweaver's Tangle",
    "Stratos: Zephyr's Flight",
    "Guild Hall - Housing Edition",
  ]) {
    assert.equal(placeableZone(zone), false, `${zone} should not be placeable`);
  }
});

// ── the verdict ──────────────────────────────────────────────────────────────

test("one placeable zone is enough to call an item in era", () => {
  const v = eraFromSourceZones(["Kael Drakkel", "Grobb", "Stratos: Zephyr's Flight"]);
  assert.equal(v.era, "in-era");
  assert.match(v.why, /Grobb/, "the reason names the zone that decided it");
});

test("sources only in zones we can't place means out of era", () => {
  const v = eraFromSourceZones(["Kael Drakkel", "Kael Drakkel"]);
  assert.equal(v.era, "out-of-era");
  assert.match(v.why, /Kael Drakkel/);
});

test("no zones at all is unknown, not out of era", () => {
  // The distinction is the point: a quest-reward or crafted item has no zones to judge, and calling
  // that "out of era" would hide a chunk of Lucy's catalogue on no evidence whatsoever.
  for (const zones of [[], [""], ["   "]]) {
    const v = eraFromSourceZones(zones);
    assert.equal(v.era, "unknown");
    assert.match(v.why, /no mob or merchant/i);
  }
});

test("the reason counts the other in-era zones rather than listing them all", () => {
  const v = eraFromSourceZones(["Grobb", "Southern Felwithe", "Paineel"]);
  assert.equal(v.era, "in-era");
  assert.match(v.why, /and 2 others/);
});

// ── the live half: a zone the gazetteer knows, but the server hasn't opened yet ────────────────
// ADR 0170's named gap — `placeableZone` alone only asks whether the zone exists on this server at
// all (permanent), never whether that expansion's era is open *right now* (live). `closed` (the
// same live list `useClosedZones()` reads) lets the verdict tell the two apart.

test("a placeable zone the live list marks shut is out of era, not in era", () => {
  const closed = outOfEraSet(["Grobb"]);
  const v = eraFromSourceZones(["Grobb"], closed);
  assert.equal(v.era, "out-of-era");
  assert.match(v.why, /Grobb/);
  assert.match(v.why, /hasn't opened/);
});

test("omitting the live list falls back to the permanent-only reading", () => {
  // Same zone as above, no `closed` argument — reproduces the pre-existing behavior exactly.
  const v = eraFromSourceZones(["Grobb"]);
  assert.equal(v.era, "in-era");
});

test("an unplaceable zone stays out of era whether or not a live list is supplied", () => {
  // `closed` only ever narrows "in-era" to "out-of-era" — it can't rescue a zone the gazetteer
  // never heard of in the first place.
  const closed = outOfEraSet(["Grobb"]);
  const v = eraFromSourceZones(["Kael Drakkel"], closed);
  assert.equal(v.era, "out-of-era");
  assert.match(v.why, /Kael Drakkel/);
});

test("one open zone among several placeable ones still reads in era, naming the open one", () => {
  const closed = outOfEraSet(["Paineel"]);
  const v = eraFromSourceZones(["Kael Drakkel", "Grobb", "Paineel"], closed);
  assert.equal(v.era, "in-era");
  assert.match(v.why, /Grobb/, "the open zone decided it, not the shut one");
});
