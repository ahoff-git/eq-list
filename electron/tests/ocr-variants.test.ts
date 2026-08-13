/**
 * Black-box tests for the OCR confusion table. These pin the two halves of it: which readings of a
 * grab are offered at all (`ocrReadings` — the table, applied), and which one is believed once the
 * names we know get a say (`bestReading`). The tally itself is the tested surface, so adding a
 * misreading means adding a case here and nothing else.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ocrReadings, bestReading } from "../../src/shared/ocr-variants";

/** A few real EQ names, standing in for the mirrored wiki title index. */
const KNOWN = ["Morning Star", "Rusty Long Sword", "Crushbone Belt", "Flowing Black Silk Sash", "Quill"];

test("the raw reading leads, and text no confusion can touch offers nothing else", () => {
  assert.deepEqual(ocrReadings("Rusty Blade"), ["Rusty Blade"]);
  assert.equal(ocrReadings("Moming Star")[0], "Moming Star");
});

test("rn read as m is recovered, one letter at a time", () => {
  const readings = ocrReadings("Moming Star");
  assert.ok(readings.includes("Morning Star"), readings.join(" | "));
  // The leading M is a suspect too — correcting every m at once must not be the only offer.
  assert.ok(readings.includes("Rnoming Star"));
});

test("readings are deduped and capped", () => {
  const readings = ocrReadings("Mmmm");
  assert.equal(new Set(readings).size, readings.length);
  assert.ok(ocrReadings("Moming Momings of Momentum", 4).length <= 4);
});

test("nothing to read is no reading at all", () => {
  assert.deepEqual(ocrReadings("   "), []);
});

test("case is carried into the correction", () => {
  assert.ok(ocrReadings("Moming").includes("Rnoming"));
  assert.ok(ocrReadings("moming").includes("rnoming"));
});

test("the reading that matches a name we know wins", () => {
  assert.equal(bestReading(ocrReadings("Moming Star"), KNOWN), "Morning Star");
});

test("a clean grab is never corrected into something else", () => {
  assert.equal(bestReading(ocrReadings("Morning Star"), KNOWN), "Morning Star");
  assert.equal(bestReading(ocrReadings("Crushbone Belt"), KNOWN), "Crushbone Belt");
  // A grade is dropped for the scoring, but the reading itself keeps it (ADR 0057).
  assert.equal(bestReading(ocrReadings("Crushbone Belt +5"), KNOWN), "Crushbone Belt +5");
});

test("an item we have no page for keeps what OCR actually read", () => {
  assert.equal(bestReading(ocrReadings("Moming Trinket of Zeb"), KNOWN), "Moming Trinket of Zeb");
});

test("with no names to judge against, the raw reading stands", () => {
  assert.equal(bestReading(ocrReadings("Moming Star"), []), "Moming Star");
  assert.equal(bestReading([], KNOWN), "");
});

test("the rarer confusions are in the table too", () => {
  assert.ok(ocrReadings("Guill").includes("Quill"));
  assert.equal(bestReading(ocrReadings("Guill"), KNOWN), "Quill");
});
