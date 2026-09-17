# 0234: A paged grid gets a fixed height, and its filter reaches the whole ledger

## Status

Accepted

The filter-reaches-the-whole-ledger decision stands. Its fixed `height: 560` is superseded by
[0248](./0248-a-paged-grid-fills-the-window-instead-of-a-fixed-height.md), which fills the window
instead.

## Context

`HitTable` (`FactionPanel.tsx`) moved to true server pagination in [ADR 0232](./0232-a-ledger-that-outlives-its-cap-is-a-database.md),
but two things about it were still wrong in practice.

**Pagination looked broken.** `HitTable` kept spreading `dataGridDefaults.ts`'s shared `GRID_DEFAULTS`
— `autoHeight: true` — while separately turning its footer back on (`hideFooter={false}`).
`GRID_DEFAULTS`'s own doc comment says exactly why those two don't mix: `autoHeight` sizes the grid's
container to fit however many rows it was handed, so a real, multi-row-per-page footer ends up
wherever that page's *last* row happens to end. At the Hits grid's default page size (50, with 100
also offered), that is far enough below the fold that reaching the footer means scrolling an entire
page of rows out of the way first — which reads as "there is no next page," not as a footer that is
merely low. Every other table using `GRID_DEFAULTS` never hit this, because every one of them ships
`hideFooter: true` — there's no footer to mislay.

**Column filtering only reached the page already on screen.** [ADR 0230](./0230-every-table-gets-a-column-menu.md)
set that as the deliberate rule for all seven `DataGrid`-backed tables, and ADR 0232's own Consequences
section flagged it as a known gap for `HitTable` specifically: "a future ledger that wants 'search
reaches the whole table' … needs to extend the `hitsPage`-style query shape … rather than assume this
ADR already covers it." For six tables that render their whole (already-filtered, already-truncated)
catalogue at once, "narrows what's on screen" and "narrows the whole result set" are close enough not
to matter. For `HitTable`, they aren't: a filter that only sees the current 50-row page can't find
anything outside it, which is the exact problem [ADR 0211](./0211-a-loot-filter-searches-the-ledger-not-the-window.md)
already diagnosed for the Loot tab — except here the ledger has no cap at all (ADR 0232), so there is
no "widen the fetch" escape hatch left; the only real answer is to filter in SQL.

## Decision

**A second grid-defaults export, not an edit to the shared one.** `dataGridDefaults.ts` gains
`GRID_DEFAULTS_PAGED`/`GRID_SX_PAGED` — the same density and row-selection defaults as `GRID_DEFAULTS`,
minus `autoHeight`, plus a fixed `height: 560` in the `sx`. `GRID_DEFAULTS` itself is untouched: it
still serves six tables that were correctly designed around `autoHeight` + `hideFooter: true`, and nothing
about their behavior needed to change. `HitTable` is the only caller of the paged variant — a fixed
height gives the grid its own scrollable viewport, with the footer pinned directly beneath it
regardless of how many rows the current page holds.

**`hitsPage`'s query grows an optional `filter`, mirroring the grid's own `GridFilterModel` almost
exactly** (`FactionHitsFilter`/`FactionHitFilterItem` in `src/shared/types.ts`) — `HitTable` converts
`onFilterModelChange`'s model straight into this shape with no real translation, and sets
`filterMode="server"` alongside the pagination/sort modes it already had. `faction-log.ts`'s
`buildFilterSql` turns the filter into one parameterized `WHERE` clause, reused for both the page query
and its `COUNT(*)`, so `rowCount` stays accurate against the filtered set rather than the whole ledger.

Safety follows the same allow-list discipline `HIT_SORT_COLUMNS` already established for sorting:
`HIT_FILTER_COLUMNS` maps each of the four filterable fields (`at`, `faction`, `delta`, `cause`) to a
fixed column expression and a `"text" | "number"` kind — a filter item's `field` can never become
anything but one of these four hardcoded strings, and every *value* the player actually typed travels
as a bound `?` parameter, never concatenated into SQL text. `contains`/`startsWith`/`endsWith` escape
`%`/`_` so a literal percent sign in a search term can't act as a SQL wildcard by accident. An
incomplete filter item (no value yet, an empty `isAnyOf` list, an operator that doesn't apply to the
field's kind) is silently dropped rather than erroring — the grid hands these through routinely while
a player is mid-edit.

`cause` filters against `caused_by_source` directly (the same column `causeSource()` reads to produce
the cell's display value), not against the rendered "≈ Name (possibly …)" label — a player filtering
"contains: fizzle" is asking about the named mob/NPC, not the guess-caveat wrapper around it.

## Consequences

- `HitTable` is now the only table in the app whose column filter reaches further than what's drawn —
  a real, narrow exception to ADR 0230's rule, not a reversal of it. Any future ledger-backed table
  that also wants this needs its own `buildFilterSql`-shaped allow-list; nothing here generalizes the
  pattern into a shared helper, since `faction_hits` is still the only SQL-backed store with a paged
  grid in front of it.
- `GRID_DEFAULTS_PAGED`/`GRID_SX_PAGED` exist alongside `GRID_DEFAULTS`/`GRID_SX` rather than replacing
  them — a second small export pair is a smaller, safer change than parameterizing the shared one for a
  single caller.
- Multi-item filters (stacking two column filters at once) work via `logicOperator`, `and` or `or`,
  same as the grid's own UI offers — folded into one `WHERE` with the matching SQL boolean operator.
- `isAnyOf` on `delta` silently drops any non-numeric entry rather than erroring; MUI's own number
  column doesn't actually offer `isAnyOf` as one of its default operators, so this is defensive rather
  than reachable through the grid's stock UI today.
