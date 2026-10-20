/**
 * Black-box tests for the page-level join of grades and spell levels: which ladder a page is on, what
 * level a held name states, and the card a slider or a hover shows at that level (ADR 0312).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { cardAtLevel, changedParts, ladderOf, levelInName, levelledTitle, unrankedSpellTitle } from "../../src/shared/upgrade-view";
import type { WikiPage } from "../../src/shared/types";

const page = (kind: WikiPage["kind"], title: string, lines: string[], extra: Partial<WikiPage> = {}) =>
  ({ kind, title, card: { title, lines }, ...extra }) as Pick<WikiPage, "kind" | "title" | "card" | "spellCategory">;

const BOW = page("item", "Runed Oak Bow", ["MAGIC ITEM", "Slot: RANGE", "Skill: Archery Atk Delay: 43", "DMG: 21", "WT: 4.5 Range: 125 Size: LARGE"]);
const KELIN = page("spell", "Kelin's Lugubrious Lament", [
  "A sad song that calms the aggressive nature of many creatures. Affects creatures up to level 60.",
  "Classes: Bard - Level 8 (Autogranted)", "Reduce Aggro Radius by 5 (up to L60)", "Reaction Radius (10/60)", "Pacify",
  "Enhanced by instrument? :: No", "Mana: 0", "Skill: Stringed", "Casting Time: 3.00", "Recast Time: 0.00",
  "Fizzle Time: 0.00", "Resist: Magic (0)", "Range: 200", "Target Type: Single", "Spell Type: Beneficial", "Duration: 30 Sec",
]);

test("a held name states its level: a grade on an item, a numeral on a spell", () => {
  assert.equal(levelInName("Dragoon Dirk +2", "item"), 2);
  assert.equal(levelInName("Shock of Lightning VI", "spell"), 6);
  assert.equal(levelInName("Cloak of Flames II", "item"), 0, "on an item a numeral is part of the name");
  assert.equal(unrankedSpellTitle("Shock of Lightning VI"), "Shock of Lightning");
  assert.equal(unrankedSpellTitle("Shock of Lightning"), undefined);
});

test("only a page whose card a level would change gets a ladder", () => {
  assert.deepEqual(ladderOf(BOW), { kind: "item", max: 10 });
  assert.equal(ladderOf(page("item", "A Nickel Key", ["WT: 0.1 Size: TINY"])), undefined);
  assert.equal(ladderOf(page("mob", "a gnoll", ["Level: 5"])), undefined);
  assert.equal(ladderOf(page("mob", "A reanimated hand", ["Level: 39-41", "AC: 356", "HP: 3230-3270 (1)"])), undefined, "a mob's AC is not gear");
  // A recipe page carries the crafted item's card — this one verbatim from the cache — and motes level it.
  const greaves = page("recipe", "Dwarven Plate Greaves (Enchanted Imbued)", [
    "MAGIC ITEM", "Slot: LEGS", "AC: 20", "STR: +8 STA: +8 WIS: +4", "SV FIRE: +4 SV MAGIC: +2",
    "WT: 8.5 Size: LARGE", "Class: WAR CLR PAL", "Race: ALL", "Deity: Brell Serilis",
  ]);
  assert.deepEqual(ladderOf(greaves), { kind: "item", max: 10 });
  assert.equal(cardAtLevel(greaves, ladderOf(greaves), 2)!.lines[2], "AC: 24");
  assert.equal(ladderOf(KELIN)?.kind, "spell");
  assert.equal(ladderOf(page("spell", "Gate", ["Classes: Wizard - Level 4", "Spell Type: Beneficial", "Duration: Instant"])), undefined);
});

test("the card at a level carries the level in its title, and level 0 is the page's own card", () => {
  assert.equal(cardAtLevel(BOW, ladderOf(BOW), 0), BOW.card);
  const plus3 = cardAtLevel(BOW, ladderOf(BOW), 3)!;
  assert.equal(plus3.title, "Runed Oak Bow +3");
  assert.equal(plus3.lines[3], "DMG: 27");
  const kelin = cardAtLevel(KELIN, ladderOf(KELIN), 2)!;
  assert.equal(kelin.title, "Kelin's Lugubrious Lament II");
  assert.equal(kelin.lines[2], "Reduce Aggro Radius by 5 (up to L62)");
  assert.equal(kelin.lines[3], "Reaction Radius (10/62)");
  assert.equal(kelin.lines.at(-1), "Duration: 36 Sec");
  assert.equal(levelledTitle("Kelin's Lugubrious Lament", ladderOf(KELIN), 0), "Kelin's Lugubrious Lament");
});

test("a spell page with the game's category follows it rather than the card's wording", () => {
  // Kelin's reads as a buff to the wiki's classifier; the game files it as a Calm, a debuff — same
  // rates, but the rule shown beside the slider should name the game's filing.
  const filed = { ...KELIN, spellCategory: { category: "Utility Detrimental", subcategory: "Calm" } };
  const ladder = ladderOf(filed);
  assert.equal(ladder?.kind === "spell" && ladder.rule.key, "debuff");
});

test("a levelled line marks exactly the numbers the level moved", () => {
  assert.deepEqual(changedParts("AC: 20", "AC: 24"), [
    { text: "AC: ", changed: false },
    { text: "24", changed: true },
  ]);
  // Several numbers on a line: the one that moved is marked, a weight already at its 0.1 floor isn't.
  assert.deepEqual(changedParts("WT: 0.1 Range: 125 Size: LARGE", "WT: 0.1 Range: 135 Size: LARGE"), [
    { text: "WT: 0.1 Range: ", changed: false },
    { text: "135", changed: true },
    { text: " Size: LARGE", changed: false },
  ]);
  assert.deepEqual(changedParts("Casting Time: 3.00", "Casting Time: 2.88"), [
    { text: "Casting Time: ", changed: false },
    { text: "2.88", changed: true },
  ]);
  assert.deepEqual(changedParts("Race: ALL", "Race: ALL"), [{ text: "Race: ALL", changed: false }]);
  assert.deepEqual(changedParts(undefined, "SV VOID: +2"), [{ text: "SV VOID: +2", changed: true }], "new at this level");
});
