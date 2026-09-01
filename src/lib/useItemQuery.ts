"use client";
import { useMemo } from "react";
import { STATS, type StatKey } from "@/shared/item-stats";
import type { Sort } from "@/shared/sorting";
import {
  FACETS,
  facetCounts,
  facetOptions,
  searchItems,
  weightedStats,
  type FacetCounts,
  type ItemCriteria,
  type ItemRow,
  type ItemSortKey,
  type StatWeights,
  type ValuedItem,
} from "@/shared/item-search";

/** Everything the Items tab draws that is *computed* rather than typed. */
export interface ItemQuery {
  /** The catalogue the menus and the results are both drawn from — see `corpus` below. */
  corpus: readonly ItemRow[];
  /** Every value each picker may offer, by facet. */
  options: Record<string, string[]>;
  /** What ticking each of those values would be worth, by facet. */
  counts: FacetCounts;
  /** The results, filtered, scored and ordered. */
  found: ValuedItem[];
  /** The stat columns the table shows — the ones you asked about. */
  columns: StatKey[];
  /** The stats the weight sheet actually scores. Empty means the Value column is saying nothing. */
  scored: StatKey[];
  /** How many rows a level bound is silent about, because nothing places them. */
  unplaced: number;
}

/**
 * The Items tab's whole computation, in one place and away from its layout.
 *
 * Six derived values over a catalogue of eleven thousand rows, each of which has to be memoized on
 * exactly the right thing — and the panel that draws them re-renders whenever anything at all moves,
 * including opening a dropdown. Keeping them here rather than among the JSX is what makes it possible
 * to see, in one screen, which of them a keystroke actually re-runs.
 *
 * Measured per change on a filled catalogue: `searchItems` 2.5–4ms, `facetCounts` 7ms, the rest
 * negligible. Nothing here is close to a frame; the point of the memos is that none of them runs on a
 * render that changed neither the rows nor the query.
 */
export function useItemQuery(
  rows: readonly ItemRow[],
  criteria: ItemCriteria,
  weights: StatWeights,
  sort: Sort<ItemSortKey>,
): ItemQuery {
  /**
   * The catalogue the panel is actually working over.
   *
   * **The era toggle is not a criterion like the others.** Every other one narrows a query, and the
   * pickers deliberately keep offering what it cut so you can reason about it (see `counts`). This one
   * says *which game you are playing* — the out-of-era items cannot be got on this server at all — so
   * its values leave the pickers entirely rather than sitting in them dimmed at zero. Measured: it
   * retires 5 whole zones and takes the Click picker from 491 options to 296.
   *
   * Applied here rather than inside `searchItems`, which already honours the flag; this is about what
   * the *menus* are built from.
   */
  const corpus = useMemo(
    () => (criteria.hideOutOfEra ? rows.filter((row) => !row.item.outOfEra) : rows),
    [rows, criteria.hideOutOfEra],
  );

  const options = useMemo(
    () => Object.fromEntries(FACETS.map((f) => [f.key, facetOptions(corpus, f.key)])) as Record<string, string[]>,
    [corpus],
  );

  /**
   * What each value in each picker is worth **under the rest of the criteria** — the numbers beside
   * the options, and the reason the dead ones dim and sink
   * ([ADR 0167](../../specs/decisions/0167-a-picker-says-what-a-tick-is-worth.md)).
   */
  const counts = useMemo(() => facetCounts(corpus, criteria), [corpus, criteria]);

  const found = useMemo(() => searchItems(corpus, criteria, weights, sort), [corpus, criteria, weights, sort]);

  const scored = useMemo(() => weightedStats(weights), [weights]);

  /**
   * The stats worth a column: the ones you're weighting by, plus the ones you've set a floor on.
   * In `STATS` order rather than the order they were added, so the table reads like a card.
   */
  const columns = useMemo(() => {
    const wanted = new Set<StatKey>([...scored, ...(Object.keys(criteria.mins) as StatKey[])]);
    return STATS.filter((s) => wanted.has(s.key)).map((s) => s.key);
  }, [scored, criteria.mins]);

  /**
   * Shown beside the level slider, so a cap that keeps thousands of unplaced items is honest about it
   * rather than looking like a filter that failed — see `matchesItem` on why a bound cuts only what it
   * is *known* to cut.
   */
  const unplaced = useMemo(() => corpus.reduce((n, row) => n + (row.level ? 0 : 1), 0), [corpus]);

  return { corpus, options, counts, found, columns, scored, unplaced };
}
