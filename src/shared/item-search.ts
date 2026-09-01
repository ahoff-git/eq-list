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

/**
 * A row's zones, ordered so one the **zone filter actually kept** comes first.
 *
 * The Zone column shows the first zone and a `+N` for the rest, and with a filter on that was
 * quietly dishonest: an item dropping in both Plane of Fear and Plane of Hate stays in the list when
 * you untick Plane of Fear — correctly, since Plane of Hate still answers "can I get this" — but the
 * column went on leading with Plane of Fear, so the row read as the very thing you had just excluded.
 * Leading with a kept zone makes the column answer *why this row is here*.
 *
 * Untouched when no zone is ticked (there is nothing to lead with) or when there is only one zone.
 */
export function zonesInFilterOrder(zones: readonly string[], chosen: readonly string[]): string[] {
  if (chosen.length === 0 || zones.length < 2) return [...zones];
  const kept = new Set(chosen);
  const inFilter = zones.filter((z) => kept.has(z));
  // None kept means the row matched on something other than its zone — a facet nobody ticked cuts
  // nothing — so there is no "why" to lead with and the natural order stands.
  return inFilter.length ? [...inFilter, ...zones.filter((z) => !kept.has(z))] : [...zones];
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
 * The two halves of the facet list, split once rather than per render.
 *
 * An effect facet asks what an item *does*; the rest ask what it is and where it came from. Two
 * different questions, so two rows of dropdowns on the panel — and four more in the first row would
 * have made ten.
 */
const EFFECT_KEYS = new Set<string>(EFFECT_KINDS.map((kind) => kind.key));
export const PLAIN_FACETS: readonly FacetMeta[] = FACETS.filter((f) => !EFFECT_KEYS.has(f.key));
export const EFFECT_FACETS: readonly FacetMeta[] = FACETS.filter((f) => EFFECT_KEYS.has(f.key));

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
  // **On by default.** The out-of-era items are the majority of the catalogue and none of them can be
  // got on this server, so a list that includes them is answering a question nobody asked. Untick it
  // to browse what the wiki knows about the game elsewhere.
  hideOutOfEra: true,
};

/** How many conditions are currently cutting the list — what a "Clear (3)" button counts. */
export function activeCriteria(c: ItemCriteria): number {
  const facets = FACETS.reduce((n, f) => n + (c.facets[f.key].length ? 1 : 0), 0);
  const levels = (c.levelMin !== undefined ? 1 : 0) + (c.levelMax !== undefined ? 1 : 0);
  // The era flag is deliberately **not** counted. It is the default view rather than a condition you
  // added, so counting it would leave "Clear (1)" showing with nothing set — and clearing puts it
  // back on, which is not what a count of 1 leads you to expect.
  return (c.text.trim() ? 1 : 0) + facets + Object.keys(c.mins).length + levels;
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
  return scorer(weights)(stats);
}

/**
 * The same sum, with the weight sheet read **once** instead of once per item.
 *
 * `itemValue` is the honest signature and the one tests ask about; this is the one a search over
 * eleven thousand rows wants, because `Object.entries` on the sheet per row is eleven thousand
 * throwaway arrays — and an *empty* sheet, which is the common case, was paying for all of them to
 * arrive at zero.
 */
export function scorer(weights: StatWeights): (stats: ItemStats) => number {
  // Zero and non-finite weights are dropped rather than skipped per row: they cannot change a total,
  // so the only thing carrying them forward costs is time.
  const scored = (Object.entries(weights) as [StatKey, number][]).filter(
    ([, weight]) => Number.isFinite(weight) && weight !== 0,
  );
  if (!scored.length) return () => 0;
  return (stats) => {
    let total = 0;
    for (const [key, weight] of scored) {
      const has = stats.stats[key];
      if (has !== undefined) total += has * weight;
    }
    // Two places, since a ratio weight makes fractions of a point real. Kept off the integer case by
    // rounding rather than by formatting, so the sort and the shown number agree.
    return Math.round(total * 100) / 100;
  };
}

/** How many stats the weight sheet actually scores — 0 means the Value column is saying nothing. */
export function weightedStats(weights: StatWeights): StatKey[] {
  return (Object.keys(weights) as StatKey[]).filter((k) => !!weights[k]);
}

/**
 * Zone cells that name no place.
 *
 * The wiki's drop tables are written by hand, and a handful of their Zone cells hold something that
 * is not a zone: a leaked header row (`Zone Name`), a section marker (`Confirmed Drop Zones`,
 * `Unconfirmed:`, `(ToV East mobs)`), or the wiki declining to say where (`Various Zones`,
 * `Other 50+ zones`, `Unknown`, `Pre-Revamp` — the last being Cazic Thule the god, who dropped
 * things before the zone was rebuilt).
 *
 * Measured on a filled catalogue: **8 such values across 139 items**, `Various Zones` alone
 * accounting for 106. None of them can answer "which place", so none is offered as a zone; an item
 * left with no zone at all falls to `(none)`, which is exactly what `(none)` is for, and the halves
 * of the Zone picker go on adding up.
 *
 * Two shape rules and a short list, in that order of preference: a trailing colon and a wholly
 * parenthesised cell are table furniture wherever they turn up, and a new one of those needs no
 * code change here.
 */
const NOT_A_PLACE =
  /^(zone names?|various zones?|unknown|unspecified|other \d+\+? zones?|pre-?revamp|post-?revamp|confirmed drop zones?|unconfirmed)$|:$|^\(.*\)$/i;

/** Does this drop row's zone cell name somewhere you could go? */
export function namesAPlace(zone: string): boolean {
  const trimmed = zone.trim();
  return !!trimmed && !NOT_A_PLACE.test(trimmed);
}

/**
 * The searchable catalogue: cards read as numbers, sources read as kinds and zones.
 *
 * Built once per catalogue rather than per keystroke — parsing eleven thousand cards on every letter
 * typed into the name box is the one thing here that would actually be slow. Built in **main**, which
 * already holds the pages, so a window never parses a card at all.
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
      // A cell that isn't a place is no answer to "which place" — see `namesAPlace`.
      if (!zone || !namesAPlace(zone)) continue;
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
 * derivation halves what crosses — measured on the real catalogue, 11.34 MB down to 5.71 MB — and,
 * since the rows arrive built, the window parses eleven thousand stat cards exactly never.
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
 * The other half of a facet, and on a filled catalogue it is a large half: 4,618 of 11,126 items name
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

/**
 * One facet's question, asked on its own.
 *
 * Apart from `matchesItem` because the pickers need it that way: "what would ticking this do" is
 * "everything except *this* facet, and then this value" (see `facetCounts`), which cannot be asked
 * of a function that only answers yes or no to the whole criteria object.
 */
export function matchesFacet(row: ItemRow, c: ItemCriteria, facet: FacetKey): boolean {
  const wanted = c.facets[facet];
  if (!wanted.length) return true;
  const has = facetValues(row, facet);
  // "(none)" is satisfied by having nothing, which is the one thing no real value can express —
  // and it ors with the rest, so `[BACK, (none)]` reads "worn on the back, or worn nowhere".
  if (wanted.includes(NO_FACET_VALUE) && !has.length) return true;
  return wanted.some((w) => has.includes(w));
}

/** Everything the criteria say that **no tick box can relax** — the name, the era, the level, the floors. */
function matchesOutsideFacets(row: ItemRow, c: ItemCriteria): boolean {
  if (c.hideOutOfEra && row.item.outOfEra) return false;
  if (!matchesText(row.item.title, c.text)) return false;

  if (c.levelMin !== undefined || c.levelMax !== undefined) {
    const level = row.level;
    /**
     * **A level bound cuts only what it is *known* to cut.**
     *
     * Deliberately the opposite of a stat floor, and the difference is real. "At least 5 INT" asked
     * of a card silent about intelligence has a definite answer — it has not got any. "Is this out of
     * my reach" asked of an item nothing could place has no answer at all, and **4,907 of 11,126
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

/** Does this row survive every criterion? See the module note on what "subtractive" means here. */
export function matchesItem(row: ItemRow, c: ItemCriteria): boolean {
  return matchesOutsideFacets(row, c) && FACETS.every((f) => matchesFacet(row, c, f.key));
}

/** How many rows each value of each facet speaks for. Absent from a map means none. */
export type FacetCounts = Record<FacetKey, Map<string, number>>;

/**
 * **What ticking a box would actually get you** — one number per value, per facet.
 *
 * A value's count is the rows that pass *every other criterion* and carry it. Zero therefore means
 * exactly "there is nothing here for you": no item in that zone survives your level cap, your stat
 * floors and whatever else you have asked for. That is the number the picker greys out and sorts on,
 * and it is the difference between a list of 154 zones and a list of the zones worth reading.
 *
 * Deliberately independent of what is already ticked **in the same facet**, because ticking within
 * one widens it — so "Kaladim · 0" stays honest whether or not Befallen is ticked beside it.
 *
 * One pass, not one per facet. A row failing **two or more** facets speaks for nothing, since no
 * single tick can reach it; a row failing exactly one is counted only under that facet; a row that
 * fails none is counted everywhere. Eleven thousand rows against ten facets is a pass per keystroke,
 * and this is the shape that keeps it at one pass rather than ten.
 */
export function facetCounts(rows: readonly ItemRow[], c: ItemCriteria): FacetCounts {
  const tally = Object.fromEntries(FACETS.map((f) => [f.key, new Map<string, number>()])) as FacetCounts;
  const bump = (into: Map<string, number>, key: string) => into.set(key, (into.get(key) ?? 0) + 1);

  for (const row of rows) {
    if (!matchesOutsideFacets(row, c)) continue;
    let blocking: FacetKey | null = null;
    let unreachable = false;
    for (const facet of FACETS) {
      if (matchesFacet(row, c, facet.key)) continue;
      if (blocking) {
        unreachable = true;
        break;
      }
      blocking = facet.key;
    }
    if (unreachable) continue;
    for (const facet of FACETS) {
      if (blocking && facet.key !== blocking) continue;
      const values = facetValues(row, facet.key);
      // Having nothing for this facet is itself an answer — the one `(none)` offers.
      if (!values.length) bump(tally[facet.key], NO_FACET_VALUE);
      else for (const value of values) bump(tally[facet.key], value);
    }
  }
  return tally;
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
  const score = scorer(weights);
  const kept = rows
    .filter((row) => matchesItem(row, criteria))
    .map((row) => ({ ...row, value: score(row.stats) }));
  // Ties break by name, so a column of equal values is still in a readable order — `sortRows` is
  // stable, so pre-sorting by name is all that takes. Sorted in place: `kept` is already this
  // function's own array, and copying 6,878 rows to sort them twice is a copy for nothing.
  kept.sort((a, b) => a.item.title.localeCompare(b.item.title));
  return sortRows(kept, sort, itemSortValue);
}

/** A stat's own column header — the card's spelling, so the table matches what you hover. */
export const statLabel = (key: StatKey): string => statMeta(key).label;
