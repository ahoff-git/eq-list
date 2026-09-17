# 0230: Every table gets a column menu — MUI X Data Grid replaces the hand-rolled tables

## Status

Accepted

Its `hideFooter`-by-default rule (six of seven tables get no pager, `HitTable` gets one fixed page
size) is superseded by [0249](./0249-every-grid-gets-a-real-pager.md), once the popover-position bug
that rule existed to avoid was fixed at its root. Everything else here — the library adoption, the
column-menu/filter split, the Community-tier boundary — stands.

## Context

Every table in the app could be sorted — `sorting.ts`'s `nextSort`/`sortRows` and `SortHeader.tsx`
saw to that, and [ADR 0058](./0058-a-ledger-needs-filters-and-a-column-to-sort-by.md) is the record
of building that shared rule rather than a second copy per table. Filtering was the gap: only three
of seven tables had any (`ItemSearchPanel`'s criteria bar, `SpellSearchPanel`'s text/class facets,
`LootFilterBar`'s fate/item/corpse/zone/"on my list"), and none of the three let you narrow by an
arbitrary column the way the sort already let you sort by one — `SpellTable`, `FactionPanel`'s two
tables, `PeerScores` and `CampReport`'s two tables had no filtering of any kind.

Closing that gap by hand would mean building, for every column of every table, a filter control
shaped to what the column actually holds — a text-contains box for a name, a number range for a
level, a picker for a fixed set of fates, a date range for a timestamp — each with its own popover,
its own keyboard handling, its own place to live in a header that was never laid out to hold one.
`sorting.ts`/`SortHeader` solved the *sort* half of this once, in one place, because writing it
twice was the thing worth stopping. The filter half is the same shape at several times the size:
roughly fifty columns across seven tables, each wanting a type-appropriate operator set instead of
one shared comparison function. That is exactly the point past which a hand-rolled solution stops
being the cheaper one — not because any single filter is hard, but because there are so many of
them, and a library that ships this, tested against far more use than this repo will ever give it,
is a better trade than fifty bespoke popovers.

ADR 0058 rejected "a generic table component" for the Loot tab's two views on the grounds that they
share a sort *rule*, not a table *shape* — the drops view is text-led with a highlight rule, the
prices view is numeric, and forcing one markup to fit both would have papered over a real
difference. That reasoning is about hand-written markup, and it still holds: nothing here proposes
one shared `<Table>` component with the different views' logic hidden inside it. What changed is
the scale of the *column-affordance* question — every table wanting the same header menu (sort,
then a type-appropriate filter) is a library's whole job, not a shape two views happen to share.

Two features of the current tables don't come for free on the library's MIT-licensed Community
tier:

- **Multi-column sort** (holding shift to add a second sort key) is Pro-gated. Nothing here uses
  it — every table sorts by one column at a time today — so it isn't missed.
- **Inline master-detail rows** — `SpellTable`'s per-spell breakdown and `FactionPanel`'s
  `StandingTable` opening a second `<tr>` under the clicked one for its cause breakdown — use
  `getDetailPanelContent`, which is Pro-only. Pro is a paid commercial license; adopting it wasn't
  asked for and isn't taken on here (see Decision).

[ADR 0211](./0211-a-loot-filter-searches-the-ledger-not-the-window.md) already drew the line this
decision leans on: a filter that only reaches *what's currently drawn* is a different, weaker claim
than one that reaches the whole ledger, and the tab has to say which one it's making. The grid's own
per-column filter is squarely the first kind.

## Decision

**Adopt `@mui/x-data-grid` (Community) plus `@mui/material` and `@emotion/*`** — the app's first
UI-library dependency, and used for nothing but tables. A single `ThemeProvider` in `layout.tsx`
carries a dark palette read off `globals.css`'s existing custom properties (`--bg`, `--bg-raised`,
`--border`, `--accent`, …), so a grid doesn't look like a different application dropped into this
one. Column definitions are declared as `GridColDef[]` — the same "columns as data, read once at
the top of the file" idiom `ItemTable`'s `CORE_COLUMNS` and `SpellCatalogTable`'s `COLUMNS` already
used, now typed to the library's shape instead of a bespoke one.

**All seven tables move onto `DataGrid`**: `ItemTable`, `SpellCatalogTable`, `SpellTable`,
`FactionPanel`'s `HitTable`/`StandingTable`, `LootPanel`'s `DropTable`/`PriceTable`, `PeerScores`,
and `CampReport`'s two tables. `SortHeader.tsx` is retired — the grid's own column menu replaces the
click-to-sort header and the arrow that showed which way. `nextSort` is *not* retired: every table
whose sort is controlled (see below) calls it from `onSortModelChange` instead of a button's
`onClick`, so a column's first click still opens in the same direction it always did (ascending for
a name, descending for a number) and a second click still flips it, rather than falling into the
grid's own default three-state cycle (asc → desc → unsorted). `Sort<K>`, `compareValues`,
`distinctSorted` and `sortRows` stay in `sorting.ts` too: they're still what `useItemQuery`,
`useSpellQuery`, `sortLoot`, `sortFactionHits`/`sortFactionStandings` do to the *catalogue*, upstream
of anything the grid ever sees.

**Where a table's sort state is read by something other than the table, the grid's `sortModel`
stays controlled.** `ItemSearchPanel` and `SpellSearchPanel` feed `sort` into `useItemQuery`/
`useSpellQuery` *before* truncating to `MAX_ROWS`, and `LootPanel` truncates its own `matches` the
same way — "top 300 by the column you asked for" only holds if the sort happens before the cut, not
after. `onSortModelChange` writes back to the same persisted `Sort<K>` state those hooks already
read, so a header click still re-sorts the full catalogue and re-truncates, exactly as it does
today; the grid then sorts the 300 rows it was handed, which — being already in that order — is a
no-op that keeps its header arrow honest. Tables nothing else reads sort state from (`SpellTable`,
`FactionPanel`, `PeerScores`, `CampReport`) let the grid own its sort model locally.

**Per-column filtering narrows what's already on screen — it does not reach further than that**,
matching the distinction ADR 0211 drew. For the three searched catalogues (Items, Spells, Loot), the
grid receives the criteria panel's already-filtered, already-truncated rows; its own filter menu
narrows *that*, the same as any spreadsheet column filter would, and is not a second ledger search —
`ItemSearchPanel`'s weighted criteria, `LootFilterBar`'s fate/corpse/zone/"on my list", and
`useSpellQuery`'s catalogue search still run first and still reach the whole cached catalogue. Two
different questions sharing a screen rather than a mechanism, the same split ADR 0058 already drew
between a filter and a sort.

**The two inline detail rows move below the grid instead of staying Pro-gated inside it.**
`SpellTable`'s per-spell breakdown and `StandingTable`'s per-faction cause breakdown now render in a
panel under the table, keyed off the grid's own single-row selection (`rowSelectionModel`) rather
than a second `<tr>` spliced in after the clicked row. Community tier throughout; no
`@mui/x-data-grid-pro` license taken on.

**`PeerScores` gains sorting and filtering it never had a request for.** It's a pivot — fixed score
categories for rows, one column per connected peer — not a ledger, and nothing asked for it to be
rankable. It's included anyway: a peer's column is a column of real numbers like any other, and
being the one table in the app you can't sort by is a worse, more surprising exception than gaining
an affordance nobody asked for.

**The footer's "rows per page" control is off by default, and on only where a table actually
pages.** `DataGrid` ships a pagination footer, and its "rows per page" control is `@mui/material`'s
own `Select` — a `Popover` that computes its position from `getBoundingClientRect()` (already in
this window's zoomed, "visual" pixels, per [ADR 0041](./0041-interface-scale-is-a-css-zoom-per-window.md))
and writes it back as a raw `style.top`/`left` on an element portaled to `document.body` — which
sits *inside* the same zoomed `documentElement` the anchor does, so the ambient `zoom` scales that
already-scaled number a second time. Confirmed by reading `@mui/material/Popover`'s own source
rather than guessed at; the menu lands further from its anchor the further the window's scale sits
from 100%. `@mui/x-data-grid`'s own column menu is a separate component (`GridMenu`, built on
`@mui/material`'s `Popper` rather than `Popover`) and wasn't reported broken.

`dataGridDefaults.ts`'s `GRID_DEFAULTS` sets `hideFooter: true`, since none of the seven tables were
designed to page — every one uses `autoHeight` and shows every row, the same as the hand-rolled
tables before them. `FactionPanel`'s `HitTable` is the one exception: its feed no longer caps at 200
(`HITS_FETCH_LIMIT`), so a real "next page" earns its keep there, and it turns the footer back on
with `pageSizeOptions` carrying a **single, fixed value** — confirmed against `TablePagination`'s
own source, the "rows per page" label and `Select` render only when `rowsPerPageOptions.length > 1`,
so a single option never mounts the broken control at all. A table that wants real pagination *and*
a choice of page size would need the underlying bug fixed rather than sidestepped — nothing here
needed that yet.

## Consequences

- Every table gets a type-appropriate filter menu — numbers get a numeric operator set, dates a date
  one — which is the actual gap this closes, and sorting gains the same type-awareness (a level
  sorts numerically because the column says it's a number, not because `compareValues` guessed from
  the value it happened to see).
- The renderer takes on its first UI-library dependency and, with it, a boundary worth stating
  plainly: **Community tier only.** No multi-column sort, no built-in master-detail, no row
  grouping or tree data, without a paid `x-data-grid-pro` upgrade — a decision for whoever wants one
  of those later, not implied by this one.
- The bundle gains real weight (`@mui/material`, `@mui/x-data-grid`, `@emotion/react`,
  `@emotion/styled`) in a renderer that was dependency-free besides Next and React. Paid once, since
  `output: "export"` ships one static bundle regardless — worth watching if the overlay's window-open
  time ever becomes a complaint, but not measured as a regression here.
- `SortHeader.tsx` is deleted, its last caller converted; `sorting.ts`'s exports all stay, including
  `nextSort`, now driving a grid's controlled sort model instead of a button's `onClick`.
- A `SpellTable`/`StandingTable` breakdown now sits below the table instead of inline beneath the
  clicked row — a real, visible change, traded for staying off a paid license.
- `ItemTable`'s dynamic stat columns, `LootPanel`'s fate-coloured rows, the shopping-list highlight,
  era styling, and every `ItemLink`/chip/tooltip cell carry over as `renderCell` functions on their
  column definitions — the data and the rules that colour it are unchanged; only the table markup
  rendering them changed hands.
- Six of the seven tables lose the footer entirely (no page count, no page size) rather than exposing
  a control that would misposition; `FactionPanel`'s Hits ledger keeps a real one, fixed at one page
  size. Any future table that wants pagination inherits the same choice: fix the underlying `Popover`
  bug, or fix the page size.
