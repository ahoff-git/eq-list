/**
 * Black-box tests for the spell catalogue's search and sort.
 *
 * Pins the three things worth pinning: a missing value sorts to the bottom of *that column's own*
 * default direction (not just "always last"), the class facet ORs within itself the same way an
 * item facet does, and the name filter is a literal subtractive filter, not a fuzzy one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_CRITERIA,
  classOptions,
  manaPerDamage,
  matchesSpell,
  minLevel,
  searchSpells,
  spellRows,
  spellSortValue,
  type SpellCriteria,
} from "../../src/shared/spell-search";
import type { CachedSpell } from "../../src/shared/types";

const spell = (title: string, lines: string[]): CachedSpell => ({
  title,
  wikiPath: `/${title.replace(/ /g, "_")}`,
  card: { title, lines },
  fetchedAt: "2026-08-01T12:00:00.000Z",
});

const CATALOGUE: CachedSpell[] = [
  spell("Burst of Fire", [
    "Classes: Druid - Level 3, Ranger - Level 14",
    "Decrease Hitpoints by 11 (L3) to 14 (L8)",
    "Mana: 7",
    "Casting Time: 1.50",
    "Range: 200",
    "Spell Type: Detrimental",
    "Duration: Instant",
  ]),
  spell("Minor Healing", [
    "Classes: Cleric - Level 1, Druid - Level 3, Shaman - Level 4",
    "Mana: 10",
    "Casting Time: 1.50",
    "Spell Type: Beneficial",
    "Duration: Instant",
  ]),
  // No card at all — the one every catalogue has a few of (a page fetched before it had a card).
  spell("Unknowable Rune", []),
];

const rows = () => spellRows(CATALOGUE);

test("a spell with no card sorts to the bottom under every column's own default direction", () => {
  const found = searchSpells(rows(), NO_CRITERIA, { key: "mana", desc: false });
  assert.equal(found.at(-1)?.spell.title, "Unknowable Rune");
  // Damage defaults descending, so the one spell that actually has any leads — the other two (no
  // card, and a heal that names none) tie at "unknown" and stay in their stable, pre-sorted order.
  const foundDesc = searchSpells(rows(), NO_CRITERIA, { key: "damage", desc: true });
  assert.equal(foundDesc[0]?.spell.title, "Burst of Fire");
});

test("level sorts by the lowest level any class can cast it at", () => {
  const found = searchSpells(rows(), NO_CRITERIA, { key: "level", desc: false });
  assert.deepEqual(
    found.map((r) => r.spell.title),
    ["Minor Healing", "Burst of Fire", "Unknowable Rune"], // Cleric 1 < Druid 3, then the unplaced one
  );
});

test("manaPerDamage is only defined when both mana and damage are known", () => {
  const [nuke, heal] = rows();
  assert.equal(manaPerDamage(nuke.stats), 0.5); // 7 mana / 14 damage
  assert.equal(manaPerDamage(heal.stats), undefined); // no damage — a heal isn't "inefficient"
});

test("minLevel is undefined for a spell that names no class at all", () => {
  const [, , unknowable] = rows();
  assert.equal(minLevel(unknowable.stats.levels), undefined);
});

test("the class facet ORs within itself — ticking two classes widens, not narrows", () => {
  const criteria: SpellCriteria = { ...NO_CRITERIA, classes: ["Cleric", "Ranger"] };
  const kept = rows().filter((r) => matchesSpell(r, criteria));
  assert.deepEqual(
    kept.map((r) => r.spell.title).sort(),
    ["Burst of Fire", "Minor Healing"], // Ranger has the nuke, Cleric has the heal
  );
});

test("the name filter is literal and subtractive, not fuzzy", () => {
  const criteria: SpellCriteria = { ...NO_CRITERIA, text: "burst fire" }; // word order free
  assert.equal(rows().filter((r) => matchesSpell(r, criteria)).length, 1);
  const typo: SpellCriteria = { ...NO_CRITERIA, text: "brust" };
  assert.equal(rows().filter((r) => matchesSpell(r, typo)).length, 0);
});

test("classOptions lists every class any cached spell names", () => {
  assert.deepEqual(classOptions(rows()).sort(), ["Cleric", "Druid", "Ranger", "Shaman"]);
});

test("spellSortValue lowercases the name, so the sort isn't case-sensitive", () => {
  assert.equal(spellSortValue(rows()[0], "name"), "burst of fire");
});
