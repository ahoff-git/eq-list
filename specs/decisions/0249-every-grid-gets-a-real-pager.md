# 0249: Every grid gets a real pager

## Status

Accepted

## Context

[ADR 0230](./0230-every-table-gets-a-column-menu.md) moved every table onto `@mui/x-data-grid` and
hid the footer on six of the seven (`ItemTable`, `SpellCatalogTable`, `SpellTable`, `FactionPanel`'s
`StandingTable`, `LootPanel`'s `PriceTable`, `PeerScores`, `CampReport`'s two tables) — `autoHeight`
drew every row regardless, so a footer would have had nowhere to page through, and the "rows per
page" `Select` it would have shown was a real, separately-confirmed bug: `@mui/material`'s `Popover`
computed its position in this window's zoomed pixels and then wrote it back unzoomed, so the menu
landed further from its anchor the further the interface scale sat from 100%
([ADR 0041](./0041-interface-scale-is-a-css-zoom-per-window.md)). `FactionPanel`'s `HitTable` was the
one exception, kept to a **single, fixed** page size specifically so that `Select` never mounted at
all (confirmed against `TablePagination`'s own source: the control only renders when there is more
than one option to choose between).

That popover bug is gone. [ADR 0231](./0231-the-zoom-root-moves-inside-the-shell.md) moved the CSS
`zoom` off the document root and onto each window's own shell element, which is what let
[ADR 0232](./0232-a-ledger-that-outlives-its-cap-is-a-database.md)/
[ADR 0234](./0234-a-paged-grid-gets-a-fixed-height-and-a-real-filter.md) give `HitTable` a genuine
choice of page size (`[25, 50, 100]`) rather than the single fixed one ADR 0230 required. It has been
running that way since, with nothing reported broken. Hiding the footer everywhere else was
therefore a workaround for a bug that no longer exists — a rule kept out of caution rather than
because six tables still needed it.

Separately: turning a table's footer back on surfaced a **second, latent bug** that had nothing to
do with `autoHeight`. Every table whose sort is a persisted `Sort<K>` read by something outside the
grid (`ItemTable`, `SpellCatalogTable`, both of `LootPanel`'s tables, both of `FactionPanel`'s)
builds its `sortModel` as a fresh array literal on every render, unmemoized — harmless with the
footer hidden, since there was no `page` for anything to reset. `HitTable` hit this first, while
building its own real pager: MUI's pagination hook resets `page` to 0 whenever the grid publishes a
`sortModelChange` event, and the grid publishes exactly that event whenever the *reference* handed
to its controlled `sortModel` prop changes — even to an array describing the identical field and
direction. A page click re-renders the component, which recreates that literal, which the grid reads
as a sort change, which resets the page it was just asked to turn. Confirmed by reading
`@mui/x-data-grid`'s own `useGridSorting`/`useGridPaginationModel` source rather than guessed at.
Turning a footer on for any of the other four sort-controlled tables would have hit the same bug the
moment a player tried to turn a page.

## Decision

**`dataGridDefaults.ts`'s `GRID_DEFAULTS` drops `autoHeight` and `hideFooter: true` — every grid gets
a real footer now.** Two sizing variants replace the old single `GRID_SX`:

- **`GRID_SX`** — a fixed box (420px) for a table sharing its page with other content: `ItemTable`,
  `SpellCatalogTable`, `SpellTable`, `CampReport`'s two tables, `PeerScores`, `LootPanel`'s
  `PriceTable`. Tall enough for a handful of rows plus the footer, with its own internal scrollbar
  for the rest — the same "bounded box, own scrollbar" shape `ResizablePanel`'s `.panel-resize` gives
  a map overlay, just fixed rather than user-dragged.
- **`GRID_SX_FILL`** — `flex: 1; min-height: 0`, for a table that *is* the whole of its tab:
  `FactionPanel`'s `HitTable`/`StandingTable` and `LootPanel`'s `DropTable`/`PriceTable`. Both panels
  are a segmented switch between views that are each basically one table, the exact shape ADR 0248
  built the fill-height plumbing for — `.tab-fill`/`.tab-fill-body`/`.grid-fill` in `globals.css`
  generalize what used to be `FactionPanel`-only classes so `LootPanel` can lean on the same chain.

A shared `PAGE_SIZE_OPTIONS = [10, 25, 50, 100]` and `DEFAULT_PAGE_SIZE = 25` cover every table that
doesn't already have its own tailored list — `HitTable`'s `HITS_PAGE_SIZES` and `LootPanel`'s new
`DROP_PAGE_SIZES` (both `[25, 50, 100]`, defaulting to 50) stay bespoke, because an uncapped ledger
wants bigger pages than a few dozen zones or a bounded 300-row catalogue does.

**Every controlled `sortModel` is memoized** (`useMemo` keyed on the sort's own `key`/`desc`) rather
than rebuilt on every render: `ItemTable`, `SpellCatalogTable`, `LootPanel`'s `DropTable`/`PriceTable`
(`FactionPanel`'s two were already fixed, in the session that found the bug). `SpellTable`,
`PeerScores` and `CampReport` never controlled a `sortModel` in the first place — the grid already
owns its sort locally for those (ADR 0230's own split) — so they needed no such fix, only the new
pagination props.

## Consequences

- Every one of the ten grids in the app now shows a real footer with a page picker — the single
  thing this record set out to guarantee.
- `GRID_DEFAULTS`/`GRID_SX` keep their names but not their old meaning: a caller reading only the
  export name, not this record, would assume `autoHeight` still applies. `GRID_SX_FILL` is new.
- A table using the fixed `GRID_SX` box scrolls **internally** past its 420px, on top of `.panel`'s
  own page-level scroll if the table plus its surrounding content still runs long — two scrollbars
  can now coexist on one page where before there was only ever the outer one. Accepted rather than
  chased: the alternative (measuring exactly how tall each table's content should be to avoid it) is
  real work for a cosmetic nicety on a Community-tier control nobody has reported minding.
- Any future table reaches for `GRID_SX` by default and only reaches for `GRID_SX_FILL` when it
  is, itself, the whole of its tab — getting that judgment call wrong either strands a big table in
  a cramped fixed box or lets a small one's fill collapse toward nothing.
