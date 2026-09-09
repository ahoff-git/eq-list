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
import { createLogger } from "./logging";
import { parseSpellStats, type SpellStats } from "./spell-stats";
import { distinctSorted, sortRows, type Sort } from "./sorting";
import type { CachedSpell } from "./types";

const log = createLogger("spell-search");

/** One spell in the searchable catalogue: what the cache holds, plus what it means. */
export interface SpellRow {
  spell: CachedSpell;
  stats: SpellStats;
}

/** The searchable catalogue: cards read as numbers. Built once per catalogue, not per keystroke. */
export function spellRows(spells: readonly CachedSpell[]): SpellRow[] {
  return spells.map((spell) => ({ spell, stats: parseSpellStats(spell.card?.lines) }));
}

/** Everything one search is narrowed by. */
export interface SpellCriteria {
  /** Name contains every word of this, in any order — same rule as the Items tab's name box. */
  text: string;
  /** Ticked classes. An empty list is "don't narrow by class". Several ticked are an *or*. */
  classes: string[];
  /** Drop what the server hasn't opened yet — the same toggle the Items tab has. */
  hideOutOfEra: boolean;
}

export const NO_CRITERIA: SpellCriteria = { text: "", classes: [], hideOutOfEra: true };

/** How many conditions are currently cutting the list. */
export function activeCriteria(c: SpellCriteria): number {
  // The era flag is deliberately not counted — see `item-search.ts`'s `activeCriteria` for why.
  return (c.text.trim() ? 1 : 0) + (c.classes.length ? 1 : 0);
}

/** Every class any cached spell names, for the class picker. */
export function classOptions(rows: readonly SpellRow[]): string[] {
  return distinctSorted(rows.flatMap((row) => Object.keys(row.stats.levels)));
}

/** Does the name contain every word typed? Literal, not fuzzy — a filter only ever cuts. */
function matchesText(title: string, text: string): boolean {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const name = title.toLowerCase();
  return words.every((w) => name.includes(w));
}

/** Does this row survive every criterion? */
export function matchesSpell(row: SpellRow, c: SpellCriteria): boolean {
  if (c.hideOutOfEra && row.spell.outOfEra) return false;
  if (!matchesText(row.spell.title, c.text)) return false;
  if (c.classes.length && !c.classes.some((cls) => row.stats.levels[cls] !== undefined)) return false;
  return true;
}

/** Which column the results are ordered by. */
export type SpellSortKey = "name" | "level" | "mana" | "castSec" | "recastSec" | "range" | "damage" | "manaPerDamage";

/** The lowest level any class can cast it at, or undefined if the card named no class at all. */
export function minLevel(levels: Partial<Record<string, number>>): number | undefined {
  const values = Object.values(levels).filter((n): n is number => n !== undefined);
  return values.length ? Math.min(...values) : undefined;
}

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
 * A value the card never gave sorts to the bottom of that column's **own default direction** —
 * `level`/`mana`/`castSec`/`recastSec`/`range` default ascending (cheapest/lowest first), so unknown
 * is `+Infinity`; `damage` defaults descending (biggest first), so unknown is `-Infinity`;
 * `manaPerDamage` defaults ascending (most efficient first), so unknown is `+Infinity` too.
 */
export function spellSortValue(row: SpellRow, key: SpellSortKey): string | number {
  switch (key) {
    case "name":
      return row.spell.title.toLowerCase();
    case "level":
      return minLevel(row.stats.levels) ?? Number.POSITIVE_INFINITY;
    case "damage":
      return row.stats.damage ?? Number.NEGATIVE_INFINITY;
    case "manaPerDamage":
      return manaPerDamage(row.stats) ?? Number.POSITIVE_INFINITY;
    default:
      return row.stats[key] ?? Number.POSITIVE_INFINITY;
  }
}

/** The whole question, answered: cut the catalogue down, order it. */
export function searchSpells(rows: readonly SpellRow[], criteria: SpellCriteria, sort: Sort<SpellSortKey>): SpellRow[] {
  if (criteria.hideOutOfEra) {
    const outOfEra = rows.reduce((n, row) => n + (row.spell.outOfEra ? 1 : 0), 0);
    if (outOfEra) log.debug("era filter hiding", outOfEra, "of", rows.length, "cached spells");
  }
  const kept = rows.filter((row) => matchesSpell(row, criteria));
  // Ties break by name, the same way `searchItems` does — `sortRows` is stable.
  kept.sort((a, b) => a.spell.title.localeCompare(b.spell.title));
  return sortRows(kept, sort, spellSortValue);
}
