/**
 * spell-search.ts — asking the spell cache a question, instead of asking it for a name.
 *
 * The spell counterpart to `item-search.ts`, over a much thinner question: not "what's the best
 * thing I could wear", but "rank what I already have cached by level, cost, range, damage". So this
 * keeps the shape — rows built once from the cache, a criteria object, a sort key — and drops what
 * a spell doesn't need: no stat weights (a spell's damage isn't subjective the way a WIS ring's
 * worth is), no effect facets, no on-disk pack. See
 * [ADR 0195](../../specs/decisions/0195-a-spell-catalog-trusts-the-wikis-own-numbers.md) for why the
 * numbers themselves are approximate, and
 * [ADR 0210](../../specs/decisions/0210-out-of-era-flagging-reaches-spells-the-shopping-list-and-lucys-live-verdict.md)
 * for the era toggle 0195 deferred.
 *
 * Pure and DOM-free — the panel renders these decisions, this module makes them.
 */
import { createLogger } from "../logging";
import { minLevel, pastLevelCap } from "./spell-era";
import { parseSpellStats, type SpellStats } from "./spell-stats";
import { spellSourceSortValue } from "./spell-sources";
import { CATEGORY_SEPARATOR, categoryLabel, type SpellCategory } from "./spell-categories";
import { buffLinesFor } from "../buffs/buff-lines";
import { distinctSorted, sortRows, type Sort } from "../sorting";
import type { CachedSpell } from "../types";

const log = createLogger("spell-search");

// Lived here before the level rule moved to `spell-era.ts`; still exported here for its callers.
export { minLevel };

/** One spell in the searchable catalogue: what the cache holds, plus what it means. */
export interface SpellRow {
  spell: CachedSpell;
  stats: SpellStats;
  /** Where the game's own spellbook files it — absent with no game install to ask. */
  category?: SpellCategory;
}

/**
 * The searchable catalogue: cards read as numbers. Built once per catalogue, not per keystroke.
 * `categoryOf` is the game file's answer (`spell-categories.ts`), when there is one to ask.
 */
export function spellRows(
  spells: readonly CachedSpell[],
  categoryOf?: (title: string) => SpellCategory | undefined,
): SpellRow[] {
  return spells.map((spell) => {
    const category = categoryOf?.(spell.title);
    const row: SpellRow = { spell, stats: parseSpellStats(spell.card?.lines) };
    return category ? { ...row, category } : row;
  });
}

/**
 * The catalogue read against the era that's open now — the spell counterpart to `item-era.ts`'s
 * `eraCorpus`.
 *
 * The wiki's flag is a *page category*, and most level 51-60 spells carry none (Torrent of Poison,
 * Primal Avatar: `Category:Spells` and nothing else), so the flag alone let them through. A spell no
 * class can cast at or under `levelCap` is out of era whatever its page says (`spell-era.ts`, the
 * same rule the search box and page view apply).
 */
export function spellEraRows(rows: readonly SpellRow[], levelCap: number): SpellRow[] {
  let widened = 0;
  const out = rows.map((row) => {
    if (row.spell.outOfEra || !pastLevelCap(row.stats.levels, levelCap)) return row;
    widened++;
    return { ...row, spell: { ...row.spell, outOfEra: true } };
  });
  if (widened) log.debug("level cap", levelCap, "marks", widened, "unflagged spells out of era");
  return out;
}

/** Everything one search is narrowed by. */
export interface SpellCriteria {
  /** Name contains every word of this, in any order — same rule as the Items tab's name box. */
  text: string;
  /**
   * Match `text` against **everything the spell says about itself** — the wiki card's description
   * and effect lines, and its spellbook category — not just its name. How "charm" finds Solon's
   * Song of the Sirens, and "control them" finds Cajoling Whispers.
   */
  searchAll: boolean;
  /**
   * Ticked spellbook categories (`categoryOptions`). Either a bare category ("Direct Damage"), which
   * takes everything filed under it, or one subcategory ("Utility Detrimental › Charm"). Several
   * ticked are an *or*; empty doesn't narrow.
   */
  categories: string[];
  /** Ticked classes. An empty list is "don't narrow by class". Several ticked are an *or*. */
  classes: string[];
  /** Drop what the server hasn't opened yet — the same toggle the Items tab has. */
  hideOutOfEra: boolean;
  /** Drop what no player class can cast — NPC abilities, procs, focus and potion effects. */
  playerOnly: boolean;
}

export const NO_CRITERIA: SpellCriteria = {
  text: "",
  searchAll: false,
  categories: [],
  classes: [],
  hideOutOfEra: true,
  playerOnly: true,
};

/** How many conditions are currently cutting the list. */
export function activeCriteria(c: SpellCriteria): number {
  // The era and player-only flags are deliberately not counted — see `item-search.ts`'s
  // `activeCriteria` for why.
  return (c.text.trim() ? 1 : 0) + (c.classes.length ? 1 : 0) + (c.categories.length ? 1 : 0);
}

/** Every class any cached spell names, for the class picker. */
export function classOptions(rows: readonly SpellRow[]): string[] {
  return distinctSorted(rows.flatMap((row) => Object.keys(row.stats.levels)));
}

/**
 * Every spellbook category any cached spell is filed under, for the category picker: each bare
 * category, and each category › subcategory pair beneath it. Sorted, so a category's subcategories
 * fall directly under it in the menu.
 */
export function categoryOptions(rows: readonly SpellRow[]): string[] {
  return distinctSorted(rows.flatMap((row) => (row.category ? [row.category.category, categoryLabel(row.category)] : [])));
}

/** Is this row filed under the ticked label — the bare category, or that exact subcategory? */
function inCategory(row: SpellRow, label: string): boolean {
  if (!row.category) return false;
  return label.includes(CATEGORY_SEPARATOR) ? categoryLabel(row.category) === label : row.category.category === label;
}

/** What `text` is matched against: the name, or with `searchAll` everything the spell says. */
function searchableText(row: SpellRow, all: boolean): string {
  if (!all) return row.spell.title;
  return [row.spell.title, ...(row.spell.card?.lines ?? []), row.category ? categoryLabel(row.category) : ""].join("\n");
}

/** Does the text contain every word typed? Literal, not fuzzy — a filter only ever cuts. */
function matchesText(haystack: string, text: string): boolean {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const lower = haystack.toLowerCase();
  return words.every((w) => lower.includes(w));
}

/**
 * Can some player class cast it? A card that reads but names no class is an NPC ability, a proc, a
 * focus or a potion effect (ADR 0297). A card with no lines at all says nothing either way, so it
 * keeps its row — the same benefit of the doubt `pastLevelCap` gives it.
 */
export function isPlayerSpell(row: SpellRow): boolean {
  return minLevel(row.stats.levels) !== undefined || !row.spell.card?.lines.length;
}

/** Does this row survive every criterion? */
export function matchesSpell(row: SpellRow, c: SpellCriteria): boolean {
  if (c.hideOutOfEra && row.spell.outOfEra) return false;
  if (c.playerOnly && !isPlayerSpell(row)) return false;
  if (!matchesText(searchableText(row, c.searchAll), c.text)) return false;
  if (c.categories.length && !c.categories.some((label) => inCategory(row, label))) return false;
  if (c.classes.length && !c.classes.some((cls) => row.stats.levels[cls] !== undefined)) return false;
  return true;
}

/** Which column the results are ordered by. */
/** Every key `spellSortValue` answers. A runtime list, not just a type, so the MCP server offers exactly
 *  these rather than a hand-kept copy that drifts. */
export const SPELL_SORT_KEYS = [
  "name",
  "level",
  "mana",
  "castSec",
  "recastSec",
  "range",
  "damage",
  "manaPerDamage",
  "source",
  "category",
  "classes",
  "buffLine",
  "outOfEra",
  "beneficial",
  "instant",
] as const;

export type SpellSortKey = (typeof SPELL_SORT_KEYS)[number];

/** Every class that can cast it, lowest level first ("Cleric 1, Druid 3") — empty when none is named. */
export function spellClassesText(row: SpellRow): string {
  return Object.entries(row.stats.levels)
    .sort(([, a], [, b]) => (a ?? 0) - (b ?? 0))
    .map(([cls, level]) => `${cls} ${level}`)
    .join(", ");
}

/** The buff lines it belongs to, per eqlwiki's guide — empty for anything the guide doesn't cover. */
export function spellBuffLinesText(row: SpellRow): string {
  return buffLinesFor(row.spell.title)
    .map((l) => l.label)
    .join(", ");
}

/** A yes/no flag as a sort value: yes ranks above no, and an unread flag stays `undefined`. */
const flagValue = (flag: boolean | undefined): number | undefined => (flag === undefined ? undefined : flag ? 1 : 0);

/**
 * What a point of mana bought, for ranking only — see the module note on why this is approximate
 * rather than the tracker's persisted, measured figure.
 */
export function manaPerDamage(stats: SpellStats): number | undefined {
  if (!stats.mana || !stats.damage) return undefined;
  return Math.round((stats.mana / stats.damage) * 100) / 100;
}

/**
 * What a row is worth in the sorted column.
 *
 * A value the card never gave is `undefined`, not a signed `Infinity` standing in for one —
 * `sortRows` puts a row with no data last whichever direction is showing, rather than only in
 * whichever direction happened to be this column's default.
 */
export function spellSortValue(row: SpellRow, key: SpellSortKey): string | number | undefined {
  switch (key) {
    case "name":
      return row.spell.title.toLowerCase();
    case "level":
      return minLevel(row.stats.levels);
    case "damage":
      return row.stats.damage;
    case "manaPerDamage":
      return manaPerDamage(row.stats);
    case "source":
      return spellSourceSortValue(row.spell.title);
    case "category":
      // Sorting by it is what *groups* the list: each category's subcategories together, in order.
      return row.category ? categoryLabel(row.category).toLowerCase() : undefined;
    case "classes":
      // The line as shown, so it groups by whichever class reaches the spell first.
      return spellClassesText(row).toLowerCase() || undefined;
    case "buffLine":
      return spellBuffLinesText(row).toLowerCase() || undefined;
    case "outOfEra":
      // Always known: a spell without the flag is in era, not unread.
      return row.spell.outOfEra ? 1 : 0;
    case "beneficial":
      return flagValue(row.stats.beneficial);
    case "instant":
      return flagValue(row.stats.instant);
    default:
      return row.stats[key];
  }
}

/** The whole question, answered: cut the catalogue down, order it. */
export function searchSpells(rows: readonly SpellRow[], criteria: SpellCriteria, sort: Sort<SpellSortKey>): SpellRow[] {
  if (criteria.hideOutOfEra) {
    const outOfEra = rows.reduce((n, row) => n + (row.spell.outOfEra ? 1 : 0), 0);
    if (outOfEra) log.debug("era filter hiding", outOfEra, "of", rows.length, "cached spells");
  }
  if (criteria.playerOnly) {
    const npcOnly = rows.reduce((n, row) => n + (isPlayerSpell(row) ? 0 : 1), 0);
    if (npcOnly) log.debug("player-only filter hiding", npcOnly, "of", rows.length, "cached spells");
  }
  const kept = rows.filter((row) => matchesSpell(row, criteria));
  // Ties break by name, the same way `searchItems` does — `sortRows` is stable.
  kept.sort((a, b) => a.spell.title.localeCompare(b.spell.title));
  return sortRows(kept, sort, spellSortValue);
}
