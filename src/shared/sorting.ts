/**
 * sorting.ts — what a sorted column is, and what a click on its header does.
 *
 * Small on purpose. Every sortable table wants the same three things: which column, which
 * direction, and "clicking the column I'm already sorted by should flip it rather than do
 * nothing". Having that in one place is what stops two tables in the same app from disagreeing
 * about whether the first click sorts up or down.
 *
 * Pure and DOM-free — the header component renders it, this decides it.
 *
 * The same reasoning covers `distinctSorted`: a filter's dropdown is a list of names in an order, and
 * the order a name belongs in is this module's business wherever the list is shown.
 */

/** Which column a table is sorted by, and which way. */
export interface Sort<K extends string> {
  key: K;
  /** Biggest / latest / Z-first. */
  desc: boolean;
}

/**
 * The sort a click on `key` produces: flip the direction when it's already the sorted column,
 * otherwise switch to it. `startDesc` is the direction a column opens in — descending for
 * numbers ("show me the most"), ascending for names ("start at A").
 */
export function nextSort<K extends string>(current: Sort<K>, key: K, startDesc = true): Sort<K> {
  return current.key === key ? { key, desc: !current.desc } : { key, desc: startDesc };
}

/**
 * The distinct values in the order they first appear — the shape "one row per mob" is built from.
 */
export function distinct<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

/**
 * The distinct values in the order a picker should offer them.
 *
 * Every filter bar with a "which mob / whose corpse" dropdown derives its options this way, and they
 * were each doing it by hand — three spellings of `[...new Set(…)].sort()`, two of them the bare
 * `sort()` that orders by code unit rather than by how a name reads. Ordered by `compareValues`, so
 * a picker and a sorted column can't disagree about where a name belongs.
 */
export function distinctSorted<T extends string | number>(values: Iterable<T>): T[] {
  return distinct(values).sort(compareValues);
}

/** Compare two cell values: numbers numerically, anything else as text. */
export function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Sort a copy of `rows` by the value `pick` reads off each one.
 *
 * The sort is **stable** (`Array.prototype.sort` is), and callers lean on that: rows the chosen
 * column can't tell apart keep the order they arrived in, which is how the loot feed's
 * same-second drops stay in the order they came off the corpse.
 */
export function sortRows<T, K extends string>(
  rows: readonly T[],
  sort: Sort<K>,
  pick: (row: T, key: K) => string | number,
): T[] {
  const direction = sort.desc ? -1 : 1;
  return [...rows].sort((a, b) => direction * compareValues(pick(a, sort.key), pick(b, sort.key)));
}
