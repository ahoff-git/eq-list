"use client";
import { useMemo } from "react";
import type { GridSortModel } from "@mui/x-data-grid";
import { nextSort, type Sort } from "@/shared/sorting";

/**
 * useGridSort.ts — the `sortModel`/`onSortModelChange` wiring every controlled-sort `DataGrid` wants,
 * for a table whose sort is a persisted `Sort<K>` read by something outside the grid (`ItemTable`,
 * `SpellCatalogTable`, both of `LootPanel`'s tables, both of `FactionPanel`'s).
 *
 * **Exists because getting this wrong is silent until a table gains a real pager.** A `sortModel`
 * built as a fresh array literal on every render *looks* identical to a memoized one — right up until
 * the grid also pages: MUI resets `page` back to 0 whenever it sees a `sortModelChange` event, and it
 * publishes that event whenever the `sortModel` *reference* changes, even to an array describing the
 * exact same field and direction (confirmed by reading `@mui/x-data-grid`'s own
 * `useGridSorting`/`useGridPaginationModel` source, not guessed at). Every controlled-sort table in
 * this app hit that bug — first `FactionPanel`'s `FactionHitsGrid`, then the other five once
 * [ADR 0249](../../specs/decisions/0249-every-grid-gets-a-real-pager.md) gave each of them a footer
 * too. This hook makes the fix structural rather than a rule to remember on the next one.
 */
export function useGridSort<K extends string>(
  sort: Sort<K>,
  onSort: (next: Sort<K>) => void,
  /** Which way a column opens on its first click. A per-column lookup (most tables already had one)
   *  or a function, for the handful whose rule is "everything but this one column" rather than a
   *  fixed table. */
  startDesc: Record<K, boolean> | ((key: K) => boolean),
  /** Anything else a re-sort should do besides updating the sort itself — `FactionHitsGrid`'s own
   *  re-sort also resets its pagination back to page 0, since a re-sort changes what belongs on every
   *  page. */
  onChange?: () => void,
): { sortModel: GridSortModel; onSortModelChange: (model: GridSortModel) => void } {
  const sortModel = useMemo<GridSortModel>(
    () => [{ field: sort.key, sort: sort.desc ? "desc" : "asc" }],
    [sort.key, sort.desc],
  );
  return {
    sortModel,
    onSortModelChange: (model) => {
      const key = (model[0]?.field ?? sort.key) as K;
      const startsDesc = typeof startDesc === "function" ? startDesc(key) : startDesc[key];
      onSort(nextSort(sort, key, startsDesc));
      onChange?.();
    },
  };
}
