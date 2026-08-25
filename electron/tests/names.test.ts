/**
 * Black-box tests for the numbers EQL decorates a name with. Both readers have to agree on where
 * a name ends and its number begins, because everything downstream either matches on the base
 * name (the wiki, the map, a drop rate) or shows the whole one (the loot feed, a camp's history).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { itemBaseName, itemGrade, zoneBaseName, zoneDifficulty, zoneDifficultyLabel, zoneKey, zoneMode } from "../../src/shared/names";

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

/**
 * The other half of the fold: the map keys on the base name, so the difficulty has to be readable
 * *back off* the log's wording or it would simply be lost (ADR 0134). These are the five tiers.
 */
test("a difficulty can be said out loud, from the number alone", () => {
  assert.equal(zoneDifficultyLabel("Blackburrow"), undefined, "an ordinary zone has nothing to say");
  assert.equal(zoneDifficultyLabel("Blackburrow 0"), "D0");
  assert.equal(zoneDifficultyLabel("Blackburrow 1"), "D1 Awakened");
  assert.equal(zoneDifficultyLabel("Blackburrow 2"), "D2 Adaptive");
  assert.equal(zoneDifficultyLabel("Blackburrow 3"), "D3 Fused");
  assert.equal(zoneDifficultyLabel("Blackburrow 4"), "D4 Refined");
  // The log's own tag wins where it wrote one, so a renamed or added tier reads as the game says.
  assert.equal(zoneDifficultyLabel("The Steamfont Mountains 2 (Adaptive)"), "D2 Adaptive");
  assert.equal(zoneDifficultyLabel("Blackburrow 5 (Ascendant)"), "D5 Ascendant");
  // A tier past the table, with nothing naming it, is still worth stating as a number.
  assert.equal(zoneDifficultyLabel("Blackburrow 7"), "D7");
  // A ruleset with no number is the game's other wording, and it is all there is to say.
  assert.equal(zoneDifficultyLabel("Nagafen's Lair - Solo"), "Solo");
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

test("the game writes a ruleset two ways, and both fold", () => {
  // The second wording came out of a real peer's observations — `Nagafen's Lair - Solo` beside
  // `Nagafen's Lair` — so it's the game's, not a guess, and left unfolded it is a second camp.
  assert.equal(zoneBaseName("Nagafen's Lair - Solo"), "Nagafen's Lair");
  assert.equal(zoneMode("Nagafen's Lair - Solo"), "Solo");
  assert.equal(zoneKey("Kedge Keep - Solo"), zoneKey("Kedge Keep"));
  // Both decorations at once, in either order of reading.
  assert.equal(zoneBaseName("Cazic-Thule 3 - Solo"), "Cazic-Thule");
  assert.equal(zoneDifficulty("Cazic-Thule 3 - Solo"), 3);
  assert.equal(zoneMode("Cazic-Thule 3 - Solo"), "Solo");
  // **Spaces around the dash are required**, because a hyphen inside a word is part of the name —
  // and no zone the app ships has " - " in it, which is what makes this safe to fold at all.
  assert.equal(zoneBaseName("Cazic-Thule"), "Cazic-Thule");
  assert.equal(zoneBaseName("Takish-Hiz"), "Takish-Hiz");
  assert.equal(zoneMode("Kor-Sha Laboratory"), undefined);
});

test("the names a real log uses reach the zones we name", () => {
  // EverQuest's own long names for `guktop` / `gukbottom`, and fandom's for `cazicthule` — all three
  // observed in a peer's log, where our gazetteer's shorter names never appear.
  assert.equal(zoneKey("The City of Guk"), zoneKey("Upper Guk"));
  assert.equal(zoneKey("The Ruins of Old Guk"), zoneKey("Lower Guk"));
  assert.equal(zoneKey("Temple of Cazic-Thule"), zoneKey("Cazic-Thule"));
  // Still two Guks, which is the thing an alias must never undo.
  assert.notEqual(zoneKey("The City of Guk"), zoneKey("The Ruins of Old Guk"));
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
