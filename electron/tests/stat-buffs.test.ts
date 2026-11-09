/**
 * Black-box tests for which buffs and abilities move the stats a stats read measures
 * (`src/shared/buffs/stat-buffs.ts`). The category names are the game's own (`dbstr_us.txt`, type 5); the
 * ability descriptions are the wiki's, as `aa-list.generated.ts` holds them.
 * Only need re-running if that module or the AA catalogue changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { abilityMovesStats, movesStats } from "../../src/shared/buffs/stat-buffs";

test("the game's stat buff families move stats: attributes, armor class, resists, hit points", () => {
  for (const [category, subcategory] of [
    ["Statistic Buffs", "Strength"], // Spirit Strength
    ["Statistic Buffs", "Stamina"],
    ["Statistic Buffs", "Wisdom/Intelligence"],
    ["Statistic Buffs", "Armor Class"],
    ["Statistic Buffs", "Resist Buff"], // Resist Fire
    ["Statistic Buffs", undefined], // the generic stat buff
    ["HP Buffs", "Aegolism"],
    ["HP Buffs", "Symbol"],
    ["HP Buffs", "Shielding"],
    ["Utility Beneficial", "Armor Class"], // Field Armorer
    ["Auras", "HP Buffs"], // Circle of Divinity
    ["Resist Buff", undefined],
  ] as const) assert.equal(movesStats({ category, ...(subcategory && { subcategory }) }), true, `${category} › ${subcategory}`);
});

test("what the page doesn't read doesn't count: attack, haste, regen, runes, damage shields, pets", () => {
  for (const [category, subcategory] of [
    ["Statistic Buffs", "Attack"], // Yaulp
    ["Statistic Buffs", "Shielding"],
    ["Statistic Buffs", "Fizzle Rate"],
    ["Regen", "Mana"], // Clarity is mana regeneration, not a bigger pool
    ["Regen", "Health"],
    ["Utility Beneficial", "Haste"],
    ["Utility Beneficial", "Rune"],
    ["Utility Beneficial", "Damage Shield"],
    ["Utility Beneficial", "Spell Focus"],
    ["Heals", undefined],
    ["Pet", "Resist Buff"], // a pet's resists are not yours
  ] as const) assert.equal(movesStats({ category, ...(subcategory && { subcategory }) }), false, `${category} › ${subcategory}`);
});

test("a spell the game files nowhere is not guessed at", () => {
  assert.equal(movesStats(undefined), false);
});

test("an ability that names the stats it raises moves them", () => {
  assert.equal(abilityMovesStats("Innate Eminence"), true, "strength, stamina, agility… by 2/4/6/8/10 points");
  assert.equal(abilityMovesStats("Innate Spell Resistance"), true, "cold, disease, fire, magic and poison resistances");
  assert.equal(abilityMovesStats("Natural Durability"), true, "maximum base health");
  assert.equal(abilityMovesStats("Combat Stability"), true, "the armor class soft cap");
});

test("an ability that only costs less, regenerates, or resists a spell effect does not", () => {
  assert.equal(abilityMovesStats("Mental Clarity"), false, "mana regeneration");
  assert.equal(abilityMovesStats("Circular Breathing"), false, "endurance regeneration");
  assert.equal(abilityMovesStats("Spell Casting Mastery"), false, "a mana cost");
  assert.equal(abilityMovesStats("Adamant Will"), false, "a chance to resist charm is not a resist stat");
  assert.equal(abilityMovesStats("Quick Buff"), false);
});

test("a toggle that flips for free all day is never a stat change", () => {
  assert.equal(abilityMovesStats("Symphonic Aura: Enabled"), false);
  assert.equal(abilityMovesStats("Spell Casting Subtlety: Disabled"), false);
});

test("an ability the catalogue doesn't know is assumed to — a wrong yes costs a glance, a wrong no leaves a stale read", () => {
  assert.equal(abilityMovesStats("Unbound Strikethrough"), true);
});

test("names match without regard to case or stray spaces", () => {
  assert.equal(abilityMovesStats("  innate eminence "), true);
  assert.equal(abilityMovesStats("MENTAL CLARITY"), false);
});
