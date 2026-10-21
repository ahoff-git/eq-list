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
  categoryOptions,
  classOptions,
  manaPerDamage,
  matchesSpell,
  minLevel,
  searchSpells,
  spellEraRows,
  spellBuffLinesText,
  spellClassesText,
  spellRows,
  spellSortValue,
  type SpellCriteria,
} from "../../src/shared/spells/spell-search";
import type { CachedSpell } from "../../src/shared/types";
import type { SpellCategory } from "../../src/shared/spells/spell-categories";

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

const OUT_OF_ERA_SPELL: CachedSpell = { ...spell("Ice Comet", ["Mana: 100"]), outOfEra: true };

const rows = () => spellRows(CATALOGUE);

test("a spell with no card sorts to the bottom under every column's own default direction", () => {
  const found = searchSpells(rows(), NO_CRITERIA, { key: "mana", desc: false });
  assert.equal(found.at(-1)?.spell.title, "Unknowable Rune");
  // Damage defaults descending, so the one spell that actually has any leads — the other two (no
  // card, and a heal that names none) tie at "unknown" and stay in their stable, pre-sorted order.
  const foundDesc = searchSpells(rows(), NO_CRITERIA, { key: "damage", desc: true });
  assert.equal(foundDesc[0]?.spell.title, "Burst of Fire");
});

test("a spell with no card sorts to the bottom even reversed — a header click, not just the opening view", () => {
  // The reported bug: "Level" opens ascending, so a fixed `Infinity` sentinel for "no level" landed
  // last there by luck rather than by rule — flip to descending (the second click every sortable
  // header invites) and it used to jump to the *top*, ahead of every real level.
  const found = searchSpells(rows(), NO_CRITERIA, { key: "level", desc: true });
  assert.equal(found.at(-1)?.spell.title, "Unknowable Rune", "still last, even sorted 'highest first'");
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

test("hideOutOfEra cuts a flagged spell by default, and untucking it brings the row back", () => {
  const withEra = spellRows([...CATALOGUE, OUT_OF_ERA_SPELL]);
  const found = searchSpells(withEra, NO_CRITERIA, { key: "name", desc: false });
  assert.ok(!found.some((r) => r.spell.title === "Ice Comet"), "out-of-era spell is hidden by default");

  // Ice Comet's fixture names no class, so the player-only cut is lifted to test the era toggle alone.
  const shown = searchSpells(withEra, { ...NO_CRITERIA, hideOutOfEra: false, playerOnly: false }, { key: "name", desc: false });
  assert.ok(shown.some((r) => r.spell.title === "Ice Comet"), "unticking the toggle brings it back");
});

test("a spell no class can cast under the live level cap is out of era, whatever its page says", () => {
  // Torrent of Poison's real page: `Category:Spells` and nothing else, so the wiki flag never fires.
  const unflagged = spell("Torrent of Poison", ["Classes: Shaman - Level 55"]);
  const shared = spell("Spirit of Wolf", ["Classes: Shaman - Level 9, Beastlord - Level 55"]);
  const corpus = spellEraRows(spellRows([...CATALOGUE, unflagged, shared, OUT_OF_ERA_SPELL]), 50);
  const flagged = (title: string) => corpus.find((r) => r.spell.title === title)?.spell.outOfEra;

  assert.equal(flagged("Torrent of Poison"), true);
  assert.equal(flagged("Spirit of Wolf"), undefined, "one class reaching it under the cap keeps it");
  assert.equal(flagged("Ice Comet"), true, "a wiki flag survives even with no class to judge by");
  assert.equal(searchSpells(corpus, NO_CRITERIA, { key: "name", desc: false }).length, CATALOGUE.length + 1);
  assert.equal(spellEraRows(spellRows([unflagged]), 60)[0].spell.outOfEra, undefined, "the day the cap rises");
});

test("playerOnly cuts a card that names no class by default, but never a card that says nothing", () => {
  // Blinding Fear's real card: "Classes: This spell is cast by NPCs only." — and no era category.
  const npc = spell("Blinding Fear", ["Blinds you with terror. Cast by Trakanon.", "Classes: This spell is cast by NPCs only."]);
  const corpus = spellRows([...CATALOGUE, npc]);
  const titles = (c: SpellCriteria) => searchSpells(corpus, c, { key: "name", desc: false }).map((r) => r.spell.title);

  assert.ok(!titles(NO_CRITERIA).includes("Blinding Fear"), "an NPC-only spell is hidden by default");
  assert.ok(titles(NO_CRITERIA).includes("Unknowable Rune"), "a cardless page keeps the benefit of the doubt");
  assert.ok(titles({ ...NO_CRITERIA, playerOnly: false }).includes("Blinding Fear"), "unticking brings it back");
});

test("classOptions lists every class any cached spell names", () => {
  assert.deepEqual(classOptions(rows()).sort(), ["Cleric", "Druid", "Ranger", "Shaman"]);
});

test("spellSortValue lowercases the name, so the sort isn't case-sensitive", () => {
  assert.equal(spellSortValue(rows()[0], "name"), "burst of fire");
});

test("classes sorts by the line as shown, lowest level first, and a spell naming none sinks", () => {
  const [nuke, heal, unknowable] = rows();
  assert.equal(spellClassesText(heal), "Cleric 1, Druid 3, Shaman 4");
  assert.equal(spellSortValue(nuke, "classes"), "druid 3, ranger 14");
  assert.equal(spellSortValue(unknowable, "classes"), undefined);
  const found = searchSpells(rows(), NO_CRITERIA, { key: "classes", desc: true });
  assert.deepEqual(found.map((r) => r.spell.title), ["Burst of Fire", "Minor Healing", "Unknowable Rune"]);
});

test("buffLine is undefined for a spell the guide doesn't cover, so it sorts last either way", () => {
  assert.equal(spellBuffLinesText(rows()[0]), "");
  assert.equal(spellSortValue(rows()[0], "buffLine"), undefined);
});

test("the yes/no columns sort yes above no, and an unread flag is no data rather than a no", () => {
  const [nuke, heal, unknowable] = rows();
  assert.equal(spellSortValue(heal, "beneficial"), 1);
  assert.equal(spellSortValue(nuke, "beneficial"), 0);
  assert.equal(spellSortValue(unknowable, "beneficial"), undefined);
  assert.equal(spellSortValue(nuke, "instant"), 1);
  assert.equal(spellSortValue(unknowable, "instant"), undefined);
  // The era flag is always known: unflagged is in era.
  assert.equal(spellSortValue(unknowable, "outOfEra"), 0);
  assert.equal(spellSortValue(spellRows([OUT_OF_ERA_SPELL])[0], "outOfEra"), 1);
  const found = searchSpells(rows(), NO_CRITERIA, { key: "beneficial", desc: true });
  assert.deepEqual(found.map((r) => r.spell.title), ["Minor Healing", "Burst of Fire", "Unknowable Rune"]);
});

// ── any text, and the spellbook's own categories ──

const CHARMS: CachedSpell[] = [
  spell("Solon's Song of the Sirens", [
    "An enticing melody that charms the target, allowing you to command it.",
    "Classes: Bard - Level 27",
  ]),
  spell("Cajoling Whispers", [
    "Dominates your target's mind, allowing you to control them for a short time.",
    "Classes: Enchanter - Level 37",
  ]),
  spell("Kelin's Lucid Lullaby", ["Classes: Bard - Level 15"]),
  ...CATALOGUE,
];

/** What the game file says, keyed by title — `electron/spells.ts`'s job in the app. */
const FILED: Record<string, SpellCategory> = {
  "Solon's Song of the Sirens": { category: "Utility Detrimental", subcategory: "Charm" },
  "Cajoling Whispers": { category: "Utility Detrimental", subcategory: "Charm" },
  "Kelin's Lucid Lullaby": { category: "Utility Detrimental", subcategory: "Enthrall" },
  "Burst of Fire": { category: "Direct Damage", subcategory: "Fire" },
};
const filedRows = () => spellRows(CHARMS, (title) => FILED[title]);
const titles = (criteria: SpellCriteria) =>
  filedRows()
    .filter((r) => matchesSpell(r, criteria))
    .map((r) => r.spell.title)
    .sort();

test("searching all text reaches the description, not just the name", () => {
  assert.deepEqual(titles({ ...NO_CRITERIA, text: "control them" }), []);
  assert.deepEqual(titles({ ...NO_CRITERIA, text: "control them", searchAll: true }), ["Cajoling Whispers"]);
});

test("searching all text reaches the spellbook category too", () => {
  // The Lullaby's card never says "enthrall"; the game's filing of it does.
  assert.deepEqual(titles({ ...NO_CRITERIA, text: "enthrall", searchAll: true }), ["Kelin's Lucid Lullaby"]);
  assert.deepEqual(titles({ ...NO_CRITERIA, text: "charm", searchAll: true }), ["Cajoling Whispers", "Solon's Song of the Sirens"]);
});

test("a bare category takes everything under it; a subcategory only itself", () => {
  assert.deepEqual(titles({ ...NO_CRITERIA, categories: ["Utility Detrimental"] }), [
    "Cajoling Whispers",
    "Kelin's Lucid Lullaby",
    "Solon's Song of the Sirens",
  ]);
  assert.deepEqual(titles({ ...NO_CRITERIA, categories: ["Utility Detrimental › Charm"] }), [
    "Cajoling Whispers",
    "Solon's Song of the Sirens",
  ]);
  // Several ticked widen, the way the class facet does.
  assert.deepEqual(titles({ ...NO_CRITERIA, categories: ["Utility Detrimental › Enthrall", "Direct Damage"] }), [
    "Burst of Fire",
    "Kelin's Lucid Lullaby",
  ]);
});

test("categoryOptions offers each category, with its subcategories directly beneath it", () => {
  assert.deepEqual(categoryOptions(filedRows()), [
    "Direct Damage",
    "Direct Damage › Fire",
    "Utility Detrimental",
    "Utility Detrimental › Charm",
    "Utility Detrimental › Enthrall",
  ]);
});

test("sorting by category groups the list, and an unfiled spell sinks to the bottom", () => {
  const found = searchSpells(filedRows(), NO_CRITERIA, { key: "category", desc: false });
  assert.deepEqual(
    found.map((r) => r.spell.title),
    ["Burst of Fire", "Cajoling Whispers", "Solon's Song of the Sirens", "Kelin's Lucid Lullaby", "Minor Healing", "Unknowable Rune"],
  );
});
