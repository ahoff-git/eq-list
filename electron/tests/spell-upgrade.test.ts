/**
 * Black-box tests for spell levels: what a spell or song becomes at upgrade level N.
 *
 * Expected values are what eqlwiki's own spell-page slider (`ext.spellLevelSlider`) shows for the
 * same card — checked by running that script on 169 live spell pages, where every category and every
 * Mana / Casting Time / Duration figure agreed. Card lines are verbatim from the app's page cache.
 * The one deliberate departure is *which* rule a spell gets: the game's own spellbook category wins
 * over the wiki's prose guess (ADR 0312), pinned below with the bard songs the guess gets wrong.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SPELL_LEVEL_RULES,
  levelledFacts,
  levelledSpellLines,
  rankLevel,
  ruleForCategory,
  ruleFromCard,
  spellLevelRule,
} from "../../src/shared/spells/spell-upgrade";
import type { SpellFacts } from "../../src/shared/spells/spell-file";

const SHOCK = [
  "Strikes your target with a bolt of lightning, causing 83 damage.",
  "Classes: Wizard - Level 10 (Autogranted)",
  "Decrease Hitpoints by 74 (L10) to 83 (L15)",
  "Mana: 50", "Skill: Evocation", "Casting Time: 2.20", "Recast Time: 1.50", "Fizzle Time: 2.50",
  "Resist: Magic (0)", "Range: 200", "Target Type: Single", "Spell Type: Detrimental", "Duration: Instant",
];
const LARGO = [
  "A binding melody that surrounds your target in magical bonds, slowing their movement and attack speed, as well as lowering their agility. The spell is listed as Largo's Assonant Binding on the spell vendor.",
  "Classes: Bard - Level 51",
  "Decrease AC by 15 (L51) to 19 (L65)", "Decrease Attack Speed by 30% (L51) to 35% (L60)",
  "Decrease Movement Speed by 52% (L51) to 61% (L60)", "Decrease AGI by 45 (L51) to 50 (L60)",
  "Enhanced by instrument? :: Yes",
  "Mana: 0", "Skill: Singing", "Casting Time: 3.00", "Recast Time: 0.00", "Fizzle Time: 0.00", "Resist: Magic (0)",
  "Range: 150", "Target Type: Single", "Spell Type: Detrimental", "Duration: 3 ticks",
];
const MESMERIZATION = [
  "Cause enemies in a small area around your target to fall into an enchanted sleep for up to 24 secs (4 ticks). This spell works on creatures up to level 55. (2.91 mana per second)",
  "Classes: Enchanter - Level 16 (Autogranted)",
  "Mesmerize (2/55)", "Memblur(1%)",
  "Mana: 60", "Skill: Conjuration", "Casting Time: 3.00", "Recast Time: 1.50", "Fizzle Time: 2.25", "Resist: Magic (0)",
  "Range: 200 (AE Range: 30)", "Target Type: Targeted AE", "Spell Type: Detrimental", "Duration: 4 ticks",
];
const RESTLESS_BONES = [
  "Animates an undead servant from the remnants of the fallen. Consumes bone chips when cast.",
  "Classes: Necromancer - Level 16, Shadow Knight - Level 30",
  "Summon Pet: Level 16 Skeletal Pet",
  "Mana: 160", "Skill: Conjuration", "Casting Time: 9.00", "Recast Time: 1.50", "Fizzle Time: 2.25",
  "Resist: Unresistable", "Range", "Target Type: Self", "Spell Type: Pet", "Duration: Instant",
];

const line = (lines: string[], label: string) => lines.find((l) => l.startsWith(`${label}:`));

test("the cast line's numeral is the level", () => {
  assert.equal(rankLevel("VI"), 6);
  assert.equal(rankLevel("x"), 10);
  assert.equal(rankLevel(undefined), 0);
  assert.equal(rankLevel("XL"), 0, "a numeral past the ladder is not a level we know");
});

test("a nuke gets 2% cheaper and faster a level, and its damage never moves", () => {
  const rule = ruleFromCard(SHOCK);
  assert.equal(rule?.key, "nuke_lifetap");
  const vi = levelledSpellLines(SHOCK, rule, 6);
  assert.equal(line(vi, "Mana"), "Mana: 44");
  assert.equal(line(vi, "Casting Time"), "Casting Time: 1.94");
  assert.equal(line(vi, "Duration"), "Duration: Instant");
  assert.equal(vi[2], "Decrease Hitpoints by 74 (L10) to 83 (L15)");
  assert.deepEqual(levelledSpellLines(SHOCK, rule, 0), SHOCK);
});

test("a song's duration scales into the wiki's fractional ticks, and a 0-mana song stays 0", () => {
  const rule = ruleFromCard(LARGO);
  assert.equal(rule?.key, "debuff");
  const one = levelledSpellLines(LARGO, rule, 1);
  assert.equal(line(one, "Mana"), "Mana: 0");
  assert.equal(line(one, "Casting Time"), "Casting Time: 2.88");
  assert.equal(line(one, "Duration"), "Duration: 3.3 ticks");
  assert.equal(line(levelledSpellLines(LARGO, rule, 10), "Duration"), "Duration: 6 ticks");
});

test("a mez's level caps rise one per level, wherever the card states them", () => {
  const rule = ruleFromCard(MESMERIZATION);
  assert.equal(rule?.key, "charm_mez");
  const v = levelledSpellLines(MESMERIZATION, rule, 5);
  assert.equal(v[2], "Mesmerize (2/60)");
  assert.match(v[0], /creatures up to level 60\./);
  assert.match(v[0], /up to 24 secs \(4 ticks\)/, "a duration in prose is not the Duration field");
  assert.equal(line(v, "Mana"), "Mana: 48");
  assert.equal(line(v, "Duration"), "Duration: 6 ticks");
});

test("a pet spell summons a higher-level pet and changes nothing else", () => {
  const rule = ruleFromCard(RESTLESS_BONES);
  assert.equal(rule?.key, "pet");
  const v = levelledSpellLines(RESTLESS_BONES, rule, 3);
  assert.equal(v[2], "Summon Pet: Level 19 Skeletal Pet", "once — though both of the wiki's patterns match this line");
  // "Pet" before the level, not after it: the shape the wiki's second pattern exists for.
  assert.equal(levelledSpellLines(["Summon Pet: Level 5 Fire Elemental"], rule, 3)[0], "Summon Pet: Level 8 Fire Elemental");
  assert.equal(line(v, "Mana"), "Mana: 160");
  assert.equal(line(v, "Casting Time"), "Casting Time: 9.00");
});

test("the game's own category decides the rule, and fixes the songs the wiki's guess gets wrong", () => {
  assert.equal(ruleForCategory({ category: "Statistic Buffs", subcategory: "Resist Buff" })?.key, "buff"); // Psalm of Mystic Shielding
  assert.equal(ruleForCategory({ category: "Utility Beneficial", subcategory: "Damage Shield" })?.key, "buff"); // McVaxius' Rousing Rondo
  assert.equal(ruleForCategory({ category: "Utility Detrimental", subcategory: "Enthrall" })?.key, "charm_mez");
  assert.equal(ruleForCategory({ category: "Utility Detrimental", subcategory: "Slow" })?.key, "debuff");
  assert.equal(ruleForCategory({ category: "Heals", subcategory: "Duration Heals" })?.key, "hot");
  assert.equal(ruleForCategory({ category: "Taps", subcategory: "Duration Tap" })?.key, "dot");
  assert.equal(ruleForCategory({ category: "Pet", subcategory: "Sum: Undead" })?.key, "pet");
  assert.equal(ruleForCategory({ category: "Transport", subcategory: "Antonica" }), undefined);
  assert.equal(ruleForCategory({ category: "Heals", subcategory: "Cure" }), undefined);
  // The card is only asked when the game wasn't.
  assert.equal(spellLevelRule({ category: "Direct Damage", subcategory: "Fire" }, LARGO)?.key, "nuke_lifetap");
  assert.equal(spellLevelRule(undefined, LARGO)?.key, "debuff");
});

test("file facts level the same way: cost, cast time, and the duration ceiling a timer counts down", () => {
  const shock: SpellFacts = {
    id: 383, name: "Shock of Lightning", mana: 50, castMs: 2200, recoveryMs: 1500, recastMs: 0,
    levels: { Wizard: 10 }, beneficial: false, permanent: false, instant: true,
  };
  const vi = levelledFacts(shock, SPELL_LEVEL_RULES.nuke_lifetap, 6);
  assert.equal(vi.mana, 44);
  assert.equal(vi.castMs, 1940);
  assert.equal(levelledFacts(shock, undefined, 6), shock, "no rule, no change");
  const root = { ...shock, name: "Root", maxDurationSeconds: 48, instant: false };
  assert.equal(levelledFacts(root, SPELL_LEVEL_RULES.debuff, 5).maxDurationSeconds, 72);
  assert.equal(levelledFacts(root, SPELL_LEVEL_RULES.debuff, 0), root);
});
