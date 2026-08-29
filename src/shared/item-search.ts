/**
 * item-search.ts — asking the item cache a question, instead of asking it for a name.
 *
 * [known-items](./known-items.ts) and the wiki's fuzzy index both answer "where is the page for the
 * thing I already know I want". This answers the other question, the one a player actually spends
 * their evening on: **"what is the best thing I could be wearing on my fingers?"** — which is not a
 * name lookup at all. It is a filter over everything we hold, sorted by a yardstick the player
 * supplies.
 *
 * Three ideas, and they are separate on purpose:
 *
 * **Criteria are subtractive.** Every criterion can only ever remove rows. Nothing here widens a
 * result set, ranks by relevance, or helpfully includes near-misses — you start with the whole
 * catalogue and cut it down, and the row count is a number you can trust to only fall as you add
 * conditions. Within one facet, several ticked values are an *or* ("fingers or neck"), because
 * ticking a second box in a list you had already narrowed to must not remove the first; across
 * facets it is an *and*. That is the only asymmetry, and it is the one every faceted search has.
 *
 * **Value is the player's, not ours.** A cleric and a wizard do not agree on what a +10 WIS ring is
 * worth, and no ranking this app invented could be right for both. So `itemValue` is a dot product
 * with weights the *user* sets — `{ int: 2, wis: 1 }` says an intelligence point is worth two of
 * anything wisdom, and ten wisdom then ties with five intelligence exactly as you'd expect. An
 * unweighted stat contributes nothing, so a blank weight sheet gives every item a value of 0 and
 * the column is honest about saying nothing yet.
 *
 * **The corpus is what we already have.** Every item page this app has fetched is on disk
 * ([wiki-data](../../specs/wiki-data/README.md), [lucy-data](../../specs/lucy-data/README.md)), and
 * that is the whole search space. Nothing here fetches, crawls or warms anything: the catalogue
 * grows as you browse, and the panel says how big it is rather than pretending to be complete.
 *
 * Pure and DOM-free — the panel renders these decisions, this module makes them. The argument for
 * all three is [ADR 0152](../../specs/decisions/0152-an-item-search-is-a-filter-with-your-own-yardstick.md).
 */
import { parseItemStats, statMeta, type ItemStats, type StatKey } from "./item-stats";
import { itemBaseName } from "./names";
import { normalizeItemName } from "./grouping";
import { normalizeZone } from "./sources";
import { distinctSorted, sortRows, type Sort } from "./sorting";
import type { CachedItem, SourceKind } from "./types";

/** One item in the searchable catalogue: what the cache holds, plus what it means. */
export interface ItemRow {
  /** The cached page this row was built from — the title, the card, the sources, where it came from. */
  item: CachedItem;
  /** Its card, read as numbers. `NO_ITEM_STATS` for an item whose source gave no card. */
  stats: ItemStats;
  /** The distinct ways it can be got, in the order its sources list them. */
  kinds: SourceKind[];
  /**
   * The distinct zones any source places it in, under **one spelling each**: the wiki writes both
   * "The Feerrott" and "Feerrott" on different pages, and a zone filter that offered both would hide
   * half the zone's items behind whichever one you didn't pick.
   */
  zones: string[];
}

/** An `ItemRow` scored against a weight sheet. */
export interface ValuedItem extends ItemRow {
  value: number;
}

/** What the user can narrow by, beyond the stat floors. Each is a list of values on the item. */
export type FacetKey = "slot" | "class" | "race" | "flag" | "source" | "zone";

export interface FacetMeta {
  key: FacetKey;
  /** The dropdown's own heading. */
  label: string;
  /** What "no filter" reads as, in this facet's vocabulary. */
  any: string;
}

export const FACETS: readonly FacetMeta[] = [
  { key: "slot", label: "Slot", any: "any slot" },
  { key: "class", label: "Class", any: "any class" },
  { key: "race", label: "Race", any: "any race" },
  { key: "source", label: "Source", any: "any source" },
  { key: "zone", label: "Zone", any: "any zone" },
  { key: "flag", label: "Flag", any: "any flag" },
];

/**
 * Everything one search is narrowed by.
 *
 * Held as one object rather than as six pieces of component state, because "how many criteria are
 * active" and "clear them all" are questions about the set, and a set spread across six `useState`s
 * can't answer either.
 */
export interface ItemCriteria {
  /** Name contains every word of this, in any order. Not fuzzy — see `matchesText`. */
  text: string;
  /** Ticked values per facet. An empty list is "don't narrow by this". */
  facets: Record<FacetKey, string[]>;
  /** Stat floors: the item must carry at least this much. A stat the card never mentions fails. */
  mins: Partial<Record<StatKey, number>>;
  /** Drop what the server hasn't opened yet — the same toggle the Search tab has. */
  hideOutOfEra: boolean;
}

/** No criteria at all: the whole catalogue. The shape a "Clear" button restores. */
export const NO_CRITERIA: ItemCriteria = {
  text: "",
  facets: { slot: [], class: [], race: [], source: [], zone: [], flag: [] },
  mins: {},
  hideOutOfEra: false,
};

/** How many conditions are currently cutting the list — what a "Clear (3)" button counts. */
export function activeCriteria(c: ItemCriteria): number {
  const facets = FACETS.reduce((n, f) => n + (c.facets[f.key].length ? 1 : 0), 0);
  return (c.text.trim() ? 1 : 0) + facets + Object.keys(c.mins).length + (c.hideOutOfEra ? 1 : 0);
}

/** Weights per stat: how many value points one point of that stat is worth. */
export type StatWeights = Partial<Record<StatKey, number>>;

/**
 * What an item is worth **to this player**: every weighted stat's points times its weight.
 *
 * Stats the card never mentioned contribute nothing, which is the honest reading of a silent card —
 * see [item-stats](./item-stats.ts). Weights may be negative, and want to be for delay and weight,
 * where less is better.
 */
export function itemValue(stats: ItemStats, weights: StatWeights): number {
  let total = 0;
  for (const [key, weight] of Object.entries(weights) as [StatKey, number][]) {
    const has = stats.stats[key];
    if (has !== undefined && Number.isFinite(weight)) total += has * weight;
  }
  // Two places, since a ratio weight makes fractions of a point real. Kept off the integer case by
  // rounding rather than by formatting, so the sort and the shown number agree.
  return Math.round(total * 100) / 100;
}

/** How many stats the weight sheet actually scores — 0 means the Value column is saying nothing. */
export function weightedStats(weights: StatWeights): StatKey[] {
  return (Object.keys(weights) as StatKey[]).filter((k) => !!weights[k]);
}

/**
 * The searchable catalogue: cards read as numbers, sources read as kinds and zones.
 *
 * Built once per catalogue rather than per keystroke — parsing three hundred cards on every letter
 * typed into the name box is the one thing here that would actually be slow.
 */
export function itemRows(items: readonly CachedItem[]): ItemRow[] {
  // One spelling per zone across the *whole* catalogue, first seen winning — the same rule
  // `groupDropsByZone` uses on a single page, applied across every page so the filter and the
  // column agree with each other.
  const zoneNames = new Map<string, string>();
  const canonicalZone = (zone: string): string => {
    const key = normalizeZone(zone);
    if (!key) return zone;
    const known = zoneNames.get(key);
    if (known) return known;
    zoneNames.set(key, zone);
    return zone;
  };

  return items.map((item) => {
    const kinds: SourceKind[] = [];
    const zones: string[] = [];
    for (const source of item.sources) {
      if (!kinds.includes(source.kind)) kinds.push(source.kind);
      const zone = source.detail?.trim();
      if (!zone) continue;
      const named = canonicalZone(zone);
      if (!zones.includes(named)) zones.push(named);
    }
    return { item, stats: parseItemStats(item.card?.lines), kinds, zones };
  });
}

/**
 * Merge the item caches into one catalogue, **the wiki's copy winning**.
 *
 * Both sources describe items and both use `ItemCard`, so they merge without special-casing — but
 * they are not equal. eqlwiki describes an ancestor of this build; Lucy describes a different game
 * twenty-five years on ([ADR 0124](../../specs/decisions/0124-lucy-is-a-second-opinion.md)). Where
 * both hold a name, the nearer record is the one to search. Names are folded, so a `+2` in one cache
 * doesn't smuggle in a second row for an item the other has plain
 * ([ADR 0057](../../specs/decisions/0057-a-grade-is-not-an-identity.md)).
 */
export function itemCatalog(wiki: readonly CachedItem[], lucy: readonly CachedItem[] = []): CachedItem[] {
  const byName = new Map<string, CachedItem>();
  for (const item of [...lucy, ...wiki]) {
    const key = normalizeItemName(item.title);
    if (key) byName.set(key, item);
  }
  return [...byName.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/** The values a row offers a facet — what a tick in that dropdown is compared against. */
export function facetValues(row: ItemRow, facet: FacetKey): readonly string[] {
  switch (facet) {
    case "slot":
      return row.stats.slots;
    case "class":
      return row.stats.classes;
    case "race":
      return row.stats.races;
    case "flag":
      return row.stats.flags;
    case "source":
      return row.kinds;
    case "zone":
      return row.zones;
  }
}

/**
 * What a facet's dropdown can offer, given the rows in hand.
 *
 * Derived from the catalogue rather than listed, so a picker can never offer a value that would
 * return nothing — and so a slot or a flag the wiki starts writing tomorrow appears on its own.
 */
export function facetOptions(rows: readonly ItemRow[], facet: FacetKey): string[] {
  return distinctSorted(rows.flatMap((row) => facetValues(row, facet) as string[]));
}

/**
 * Does the name contain every word typed?
 *
 * A **filter, not a lookup**: deliberately literal where the Search tab is fuzzy. Fuzz is right when
 * you are hunting one page and might have spelled it wrong; here it would let a criterion *add*
 * rows you didn't ask for, which is the one thing a subtractive filter must never do. Word order is
 * free, so "sword rusty" finds the rusty short sword, and the grade is folded off both sides so
 * `dirk` still matches a `Dragoon Dirk +2` sitting in the cache under its full name.
 */
function matchesText(title: string, text: string): boolean {
  const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const name = itemBaseName(title).toLowerCase();
  return words.every((w) => name.includes(w));
}

/** Does this row survive every criterion? See the module note on what "subtractive" means here. */
export function matchesItem(row: ItemRow, c: ItemCriteria): boolean {
  if (c.hideOutOfEra && row.item.outOfEra) return false;
  if (!matchesText(row.item.title, c.text)) return false;

  for (const facet of FACETS) {
    const wanted = c.facets[facet.key];
    if (!wanted.length) continue;
    const has = facetValues(row, facet.key);
    if (!wanted.some((w) => has.includes(w))) return false;
  }

  for (const [key, min] of Object.entries(c.mins) as [StatKey, number][]) {
    const has = row.stats.stats[key];
    // A card that never mentioned the stat fails the floor. It has to: "at least 5 INT" asked of an
    // item whose card is silent about intelligence has no yes to give, and treating silence as a
    // zero that *might* still pass is how a filter starts including things it was told to cut.
    if (has === undefined || has < min) return false;
  }

  return true;
}

/** Which column the results are ordered by. A stat key sorts by that stat. */
export type ItemSortKey = "name" | "value" | "slot" | "source" | "zone" | StatKey;

/**
 * What a row is worth in the sorted column.
 *
 * A stat the card never gave sorts as `-Infinity`, so "most AC first" leads with the items that
 * actually have AC rather than with the three hundred that never claimed any.
 */
export function itemSortValue(row: ValuedItem, key: ItemSortKey): string | number {
  switch (key) {
    case "name":
      return row.item.title.toLowerCase();
    case "value":
      return row.value;
    case "slot":
      return row.stats.slots.join(" ");
    case "source":
      return row.kinds.join(" ");
    case "zone":
      return row.zones.join(" ");
    default:
      return row.stats.stats[key] ?? Number.NEGATIVE_INFINITY;
  }
}

/**
 * The whole question, answered: cut the catalogue down, score what's left, order it.
 *
 * One call rather than three at the call site, because the order matters and is not obvious —
 * scoring before filtering would value three hundred items to show twelve.
 */
export function searchItems(
  rows: readonly ItemRow[],
  criteria: ItemCriteria,
  weights: StatWeights,
  sort: Sort<ItemSortKey>,
): ValuedItem[] {
  const kept = rows
    .filter((row) => matchesItem(row, criteria))
    .map((row) => ({ ...row, value: itemValue(row.stats, weights) }));
  // Ties break by name, so a column of equal values is still in a readable order — `sortRows` is
  // stable, so pre-sorting by name is all that takes.
  const named = [...kept].sort((a, b) => a.item.title.localeCompare(b.item.title));
  return sortRows(named, sort, itemSortValue);
}

/** A stat's own column header — the card's spelling, so the table matches what you hover. */
export const statLabel = (key: StatKey): string => statMeta(key).label;
