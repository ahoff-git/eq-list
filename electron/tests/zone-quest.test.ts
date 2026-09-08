/**
 * Black-box tests for reading a "Tests" quest's zone off its own title
 * ([src/shared/zones/quest-zone.ts](../../src/shared/zones/quest-zone.ts)).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { zoneFromTestsQuestTitle } from "../../src/shared/zones/quest-zone";

test("a class's own Tests quest names its zone through the class prefix", () => {
  assert.equal(zoneFromTestsQuestTitle("Wizard Plane of Sky Tests"), "Plane of Sky");
  assert.equal(zoneFromTestsQuestTitle("Cleric Plane of Sky Tests"), "Plane of Sky");
  // Bare, with no class prefix at all.
  assert.equal(zoneFromTestsQuestTitle("Plane of Sky Tests"), "Plane of Sky");
});

test("only a title that actually ends in Tests is read this way", () => {
  assert.equal(zoneFromTestsQuestTitle("Plane of Sky"), undefined);
  assert.equal(zoneFromTestsQuestTitle("Bear Hide Armor"), undefined);
});

test("a Tests title that names no real zone is left unplaced, not guessed at", () => {
  // "Crusader's" is nobody's zone — the resolver has nothing to narrow to, so this stays silent
  // rather than inventing a place.
  assert.equal(zoneFromTestsQuestTitle("Crusader's Tests"), undefined);
});
