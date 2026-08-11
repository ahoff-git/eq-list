/**
 * Black-box tests for the numbers EQL decorates a name with. Both readers have to agree on where
 * a name ends and its number begins, because everything downstream either matches on the base
 * name (the wiki, the map, a drop rate) or shows the whole one (the loot feed, a camp's history).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { itemBaseName, itemGrade, zoneBaseName, zoneDifficulty, zoneKey, zoneMode } from "../../src/shared/names";

test("an item's grade is read off the name and can be taken back off it", () => {
  assert.equal(itemGrade("Dragoon Dirk +2"), 2);
  assert.equal(itemBaseName("Dragoon Dirk +2"), "Dragoon Dirk");
  // Real lines from the log: the grade is what an upgrade changes, and it reaches double figures.
  assert.equal(itemBaseName("Crushbone Belt +5"), "Crushbone Belt");
  assert.equal(itemGrade("Crushbone Belt +12"), 12);
});

test("an ungraded item keeps its name and reports no grade", () => {
  assert.equal(itemGrade("Dragoon Dirk"), undefined);
  assert.equal(itemBaseName("Dragoon Dirk"), "Dragoon Dirk");
  // A number that isn't a grade belongs to the item — nothing here may invent a base name.
  assert.equal(itemBaseName("Golden Amulet of Mischief"), "Golden Amulet of Mischief");
  assert.equal(itemGrade("Ring of the Shissar 2 Handed"), undefined);
});

test("a zone's difficulty is read off its name, however the server writes it", () => {
  assert.equal(zoneDifficulty("Blackburrow 3"), 3);
  assert.equal(zoneBaseName("Blackburrow 3"), "Blackburrow");
  assert.equal(zoneBaseName("The Feerrott 2"), "The Feerrott");
  // Not betting on one spelling of it: the parenthesised and `+N` forms fold the same way.
  assert.equal(zoneBaseName("Blackburrow (3)"), "Blackburrow");
  assert.equal(zoneDifficulty("Blackburrow +3"), 3);
});

test("the ruleset a harder zone scales by folds away with the number", () => {
  // Real lines: the server writes the difficulty and the ruleset, and the map has to see neither.
  assert.equal(zoneBaseName("The Steamfont Mountains 2 (Adaptive)"), "The Steamfont Mountains");
  assert.equal(zoneBaseName("Blackburrow 2 (Adaptive)"), "Blackburrow");
  assert.equal(zoneDifficulty("Blackburrow 2 (Adaptive)"), 2);
  assert.equal(zoneMode("Blackburrow 2 (Adaptive)"), "Adaptive");
  // A ruleset can ride an ordinary zone too, and the tag is read whatever it says.
  assert.equal(zoneBaseName("Greater Faydark (Hardcore)"), "Greater Faydark");
  assert.equal(zoneMode("Greater Faydark (Hardcore)"), "Hardcore");
});

test("an ordinary zone reports no difficulty", () => {
  assert.equal(zoneDifficulty("Greater Faydark"), undefined);
  assert.equal(zoneBaseName("Greater Faydark"), "Greater Faydark");
  assert.equal(zoneMode("Greater Faydark"), undefined);
  // A separator is required, so a zone whose name simply ends in a digit survives intact.
  assert.equal(zoneBaseName("Warrens2"), "Warrens2");
  // A parenthesised number is a difficulty, not a ruleset — nothing here reads it as a mode.
  assert.equal(zoneMode("Blackburrow (3)"), undefined);
});

// ── the zone key: one fold behind every "same zone?" ──

test("every variant of a zone folds to one key", () => {
  // The whole point: a camp is one camp however hard the door was set, and whatever the ruleset.
  const key = zoneKey("The Steamfont Mountains");
  assert.equal(zoneKey("The Steamfont Mountains 2 (Adaptive)"), key);
  assert.equal(zoneKey("Steamfont Mountains 3 (Fused)"), key);
  assert.equal(zoneKey("steamfont mountains"), key);
  assert.equal(zoneKey("  The   Steamfont Mountains  "), key);
});

test("a zone the log and the maps name differently folds to the map's name", () => {
  // The log says Kerra Isle; both map packs' own labels say Kerra Ridge, and it's one place —
  // 454 of 463 positions recorded in "Kerra Isle" sit inside `kerraridge`'s lines.
  assert.equal(zoneKey("Kerra Isle"), zoneKey("Kerra Ridge"));
  assert.equal(zoneKey("Kerra Isle"), "kerra ridge", "the map's name is the canonical one");
  // Decoration comes off before the alias is looked up, so every difficulty of it folds too.
  assert.equal(zoneKey("Kerra Isle 3 (Fused)"), zoneKey("Kerra Ridge"));
  assert.equal(zoneKey("Kerra Isle 1 (Awakened)"), zoneKey("Kerra Ridge"));
});

test("a zone with no alias is left exactly as it folds", () => {
  assert.equal(zoneKey("Blackburrow"), "blackburrow");
  assert.equal(zoneKey("The Feerrott"), "feerrott");
  // Two zones that merely share words must not collapse into one.
  assert.notEqual(zoneKey("East Commonlands"), zoneKey("West Commonlands"));
});

test("the apostrophe folds, because the maps and the log write it differently", () => {
  // Verified against a real log: the zone line says `Ak'Anon` and `Erud's Crossing`, while every map
  // label writes a backtick. Unfolded, a zone named off a label could never match the line that
  // takes you there.
  assert.equal(zoneKey("Ak`Anon"), zoneKey("Ak'Anon"));
  assert.equal(zoneKey("Kurn`s Tower"), zoneKey("Kurn's Tower"));
  assert.equal(zoneKey("Erud’s Crossing"), zoneKey("Erud's Crossing"), "and the curly one people paste");
});
