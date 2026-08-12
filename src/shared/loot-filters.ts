/**
 * loot-filters.ts — which drops the Loot tab is showing, and in what order.
 *
 * The ledger reaches back through every previous run, so by the second evening the tab is a few
 * hundred rows of mostly trash. Filters are what make it answerable ("what did *that* mob give
 * me", "what have I actually kept") and a sort is what makes a column worth having.
 *
 * Same shape as [`kill-filters.ts`](./kill-filters.ts) — one filter object, one function, so the
 * counts in the header and the rows underneath can't describe different sets. Pure and DOM-free.
 */
import type { ItemPrice, LootEvent, LootFate } from "./types";
import { normalizeItemName } from "./grouping";
import { distinctSorted, sortRows, type Sort } from "./sorting";

/** Every fate, in the order the tab lists them — also the option list for the filter. */
export const LOOT_FATES: LootFate[] = ["kept", "sold", "stored", "combined"];

export interface LootFilters {
  /** Which fate to show, or "all". */
  fate: LootFate | "all";
  /** Substring match on the item's name. */
  item: string;
  /** Exact match on the corpse it came off ("" = any). */
  source: string;
  /** Only drops that are on the shopping list. */
  wantedOnly: boolean;
}

export const DEFAULT_LOOT_FILTERS: LootFilters = { fate: "all", item: "", source: "", wantedOnly: false };

/** Whether any filter is actually narrowing anything — the header says "N of M" only if so. */
export function isFiltered(filters: LootFilters): boolean {
  return (
    filters.fate !== "all" || !!filters.item.trim() || !!filters.source || filters.wantedOnly
  );
}

/**
 * Apply the filters. `wanted` holds the shopping list's names already folded by
 * `normalizeItemName`, which is the same fold the store matches loot with — so "on my list"
 * means here exactly what it means when a drop lights the list up.
 */
export function filterLoot(
  drops: readonly LootEvent[],
  filters: LootFilters,
  wanted: ReadonlySet<string> = new Set(),
): LootEvent[] {
  const item = filters.item.trim().toLowerCase();
  return drops.filter((d) => {
    if (filters.fate !== "all" && d.fate !== filters.fate) return false;
    if (item && !d.item.toLowerCase().includes(item)) return false;
    if (filters.source && d.source !== filters.source) return false;
    if (filters.wantedOnly && !wanted.has(normalizeItemName(d.item))) return false;
    return true;
  });
}

/** The corpses present, so the filter offers real choices rather than a free-text box. */
export function lootSources(drops: readonly LootEvent[]): string[] {
  return distinctSorted(drops.map((d) => d.source).filter(Boolean));
}

/** How many of each fate, counting stacks — the tallies beside the header. */
export function tallyFates(drops: readonly LootEvent[]): Record<LootFate, number> {
  const counts: Record<LootFate, number> = { kept: 0, sold: 0, stored: 0, combined: 0 };
  for (const d of drops) counts[d.fate] += d.qty;
  return counts;
}

export type LootSortKey = "at" | "item" | "source" | "qty" | "fate";

/** Newest first — the order the feed arrives in, and the only one that reads as a log. */
export const DEFAULT_LOOT_SORT: Sort<LootSortKey> = { key: "at", desc: true };

/**
 * `at` is the log's own timestamp string (`2026-07-17T18:41:14`), which sorts chronologically as
 * text — no parsing, and an odd clock can't become a `NaN` that shuffles a row to the end.
 */
const lootValue = (d: LootEvent, key: LootSortKey): string | number => {
  switch (key) {
    case "at":
      return d.at;
    case "qty":
      return d.qty;
    case "item":
      return d.item.toLowerCase();
    case "source":
      return d.source.toLowerCase();
    case "fate":
      return d.fate;
  }
};

/**
 * Sort the feed. The default is a no-op in practice: the rows arrive newest-first already, and
 * because the sort is stable, drops sharing a log second stay in the order they were looted
 * rather than being shuffled by a clock that only counts whole seconds (see `loot-feed.ts`).
 */
export function sortLoot(drops: readonly LootEvent[], sort: Sort<LootSortKey>): LootEvent[] {
  return sortRows(drops, sort, lootValue);
}

export type PriceSortKey = "item" | "unitCopper" | "qty" | "copper" | "lastAt";

/** The biggest earners first — what the table is for is "what is my trash worth". */
export const DEFAULT_PRICE_SORT: Sort<PriceSortKey> = { key: "copper", desc: true };

const priceValue = (p: ItemPrice, key: PriceSortKey): string | number =>
  key === "item" ? p.item.toLowerCase() : p[key];

export function sortPrices(prices: readonly ItemPrice[], sort: Sort<PriceSortKey>): ItemPrice[] {
  return sortRows(prices, sort, priceValue);
}
