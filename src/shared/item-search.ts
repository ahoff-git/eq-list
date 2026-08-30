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
import { EFFECT_KINDS, parseItemStats, statMeta, type EffectKind, type ItemStats, type StatKey } from "./item-stats";
import { itemLevel, type ItemLevel, type LevelSources } from "./item-levels";

/** Nothing known about any mob or quest — the zone rung still answers, from the shipped tables. */
const NO_LEVEL_SOURCES: LevelSources = { mob: () => undefined, quest: () => undefined };
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
  /**
   * What level you need to be — derived, since the wiki states one only for a handful of items
   * ([item-levels](./item-levels.ts)). Computed here rather than during the cache walk because the
   * card is already parsed at this point, and parsing eleven thousand of them twice is 130ms of a
   * build that is trying to be quick.
   */
  level?: ItemLevel;
  /** The distinct ways it can be got, in the order its sources list them. */
  kinds: SourceKind[];
  /**
   * Effect names by how you reach them — the four `EffectKind` facets, computed once per row rather
   * than filtered out of `stats.effects` on every keystroke of every picker.
   */
  effectsBy: Partial<Record<EffectKind, string[]>>;
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
export type FacetKey = "slot" | "class" | "race" | "flag" | "source" | "zone" | EffectKind;

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
  // The effects, each its own facet rather than one "has an effect" list. A worn haste and a clicky
  // haste are not substitutes, and the *kind* is most of what somebody is shopping for
  // ([item-stats](./item-stats.ts)).
  ...EFFECT_KINDS.map((kind) => ({ key: kind.key, label: kind.label, any: `any ${kind.label.toLowerCase()}` })),
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
  /**
   * The level band you can actually use, as a pair of bounds on the item's derived level
   * ([item-levels](./item-levels.ts)).
   *
   * Its own criterion rather than a stat floor, because it is not on the card: it is worked out from
   * the mob, the quest or the zone, and a filter that hid that behind "INT ≥ 5" would be claiming a
   * precision the number does not have. An item nothing could place is **cut** by either bound —
   * same rule as a silent stat card, and for the same reason.
   */
  levelMin?: number;
  levelMax?: number;
}

/** No criteria at all: the whole catalogue. The shape a "Clear" button restores. */
export const NO_CRITERIA: ItemCriteria = {
  text: "",
  facets: { slot: [], class: [], race: [], source: [], zone: [], flag: [], worn: [], click: [], proc: [], focus: [] },
  mins: {},
  hideOutOfEra: false,
};

/** How many conditions are currently cutting the list — what a "Clear (3)" button counts. */
export function activeCriteria(c: ItemCriteria): number {
  const facets = FACETS.reduce((n, f) => n + (c.facets[f.key].length ? 1 : 0), 0);
  const levels = (c.levelMin !== undefined ? 1 : 0) + (c.levelMax !== undefined ? 1 : 0);
  return (c.text.trim() ? 1 : 0) + facets + Object.keys(c.mins).length + levels + (c.hideOutOfEra ? 1 : 0);
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
export function itemRows(items: readonly CachedItem[], levels?: LevelSources): ItemRow[] {
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
    for (const source of item.sources ?? []) {
      if (!kinds.includes(source.kind)) kinds.push(source.kind);
      const zone = source.detail?.trim();
      if (!zone) continue;
      const named = canonicalZone(zone);
      if (!zones.includes(named)) zones.push(named);
    }
    const stats = parseItemStats(item.card?.lines);
    const effectsBy: Partial<Record<EffectKind, string[]>> = {};
    for (const effect of stats.effects) (effectsBy[effect.kind] ??= []).push(effect.name);
    // Without lookups the zone rung still answers, since the zone tables ship with the app.
    const level = itemLevel(item.sources ?? [], levels ?? NO_LEVEL_SOURCES, stats.requiredLevel);
    return { item, stats, level, kinds, zones, effectsBy };
  });
}

/**
 * The rows as they cross to a window: everything the panel draws, and nothing it doesn't.
 *
 * `itemRows` needs the card (to parse stats) and the sources (to derive kinds and zones); the *panel*
 * needs neither, because both have already become fields on the row. Dropping them after the
 * derivation takes the catalogue from 6.9 MB to about 1.6 MB per transfer, and — since the rows
 * arrive built — the window parses eleven thousand stat cards exactly never.
 *
 * Main keeps the full pages; this is only what leaves it.
 */
export function forTransfer(rows: readonly ItemRow[]): ItemRow[] {
  return rows.map((row) => {
    // `fetchedAt` goes too: the panel never shows a row's age (the ↻ on an item's *page* does, off
    // the page itself), so it is eleven thousand timestamps nobody reads.
    const { card, sources, fetchedAt, ...rest } = row.item;
    void card;
    void sources;
    void fetchedAt;
    return { ...row, item: { ...rest, fetchedAt: "" } };
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

/**
 * The pseudo-value meaning **"this item has none of these at all"**.
 *
 * The other half of a facet, and on a filled catalogue it is a large half: 4,560 of 11,171 items name
 * no zone whatsoever. Without it those items are only ever reachable by *not* filtering, so "show me
 * the things the wiki lists no source for" — a real question, and the one that finds a quest reward —
 * cannot be asked at all.
 *
 * A NUL-prefixed sentinel rather than a readable `"(none)"`, because these lists are populated from
 * wiki text and a facet value that happened to equal the sentinel would silently become this instead.
 * NUL cannot appear in a title, a slot or a zone name, so the collision is impossible rather than
 * merely unlikely. The picker shows it as "(none)"; only the stored criteria ever see this.
 */
export const NO_FACET_VALUE = "\u0000none";

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
    // One facet per effect kind, each offering only the effects reached that way.
    default:
      return row.effectsBy[facet] ?? [];
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
 * How many rows have **nothing at all** for a facet — the number that makes "select all" honest.
 *
 * Ticking every zone is not the same as ticking none, and the difference is not small: 4,560 of the
 * 11,171 items in a filled catalogue name no zone whatsoever (quest rewards, crafted goods, anything
 * whose sources the wiki never listed). So a bare "select all" would quietly cut 41% of the
 * catalogue, which is the sort of thing that makes a filter look broken.
 *
 * With the count in hand the picker can say so, and what looked like a footgun becomes a filter
 * worth having on purpose: *only items that come from somewhere I could go*.
 */
export function facetlessCount(rows: readonly ItemRow[], facet: FacetKey): number {
  return rows.reduce((n, row) => n + (facetValues(row, facet).length ? 0 : 1), 0);
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
    // "(none)" is satisfied by having nothing, which is the one thing no real value can express —
    // and it ors with the rest, so `[BACK, (none)]` reads "worn on the back, or worn nowhere".
    if (wanted.includes(NO_FACET_VALUE) && !has.length) continue;
    if (!wanted.some((w) => has.includes(w))) return false;
  }

  if (c.levelMin !== undefined || c.levelMax !== undefined) {
    const level = row.level;
    /**
     * **A level bound cuts only what it is *known* to cut.**
     *
     * Deliberately the opposite of a stat floor, and the difference is real. "At least 5 INT" asked
     * of a card silent about intelligence has a definite answer — it has not got any. "Is this out of
     * my reach" asked of an item nothing could place has no answer at all, and **4,942 of 11,162
     * items** are in that position: cutting them would make the cap quietly hide 44% of the catalogue,
     * which is not what "hide what I cannot use yet" means. The panel says how many are unplaced
     * instead, so the silence is visible rather than mistaken for a filter working.
     */
    if (!level) return true;
    // The band overlaps rather than contains: an item off a mob that spans 21–23 is a level-22
    // character's item, and asking for exactly-within would cut it.
    if (c.levelMax !== undefined && level.min > c.levelMax) return false;
    if (c.levelMin !== undefined && level.max < c.levelMin) return false;
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
export type ItemSortKey = "name" | "value" | "slot" | "source" | "zone" | "level" | StatKey;

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
    // Unplaceable sorts last under "lowest first", which is the useful way round: the rows you can
    // act on lead, and the ones nothing knows about sit at the bottom rather than the top.
    case "level":
      return row.level?.min ?? Number.POSITIVE_INFINITY;
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
