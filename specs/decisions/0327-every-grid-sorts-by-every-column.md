# 0327: Every grid sorts by every column

## Status

Accepted

## Context

[ADR 0230](./0230-every-table-gets-a-column-menu.md) moved the app's seven tables onto `DataGrid` so
their headers sort and filter. Since then, tables added as plain `<table>`s couldn't sort at all:
best in slot's Wear and Hunt, the exports' dump views, a peer's inventory, a tradeskill guide, a
spell's per-invocation breakdown. In the searched catalogues (Items, Spells, Loot, Faction), 29
columns were marked `sortable: false`, because sorting happens upstream before truncation and those
columns had no sort key.

## Decision

**Every grid sorts by every column.**

- A table is a `DataGrid`, styled from `dataGridDefaults.ts`. A link in a cell is rendered by
  `renderCell` and sorted by a `valueGetter`.
- A searched catalogue's column gets a sort key in its shared sort module, so it still sorts the
  whole catalogue before the cut.
- Only an actions column of buttons is exempt; it spreads `ACTION_COL`.
- A table with a natural order (worn slots, a guide's steps) opens in that order and still re-sorts
  by any column.
- `grids-are-sortable.test.ts` fails on a plain `<table>`, `disableColumnSorting`, or `sortable: false`
  on a data column, unless the exception is in its `ALLOWED` table with a reason.

## Consequences

- Any column in the app can be sorted.
- A new table written by hand fails the suite until it's a grid.
- Adding a column to a searched catalogue means adding its sort key as well.
