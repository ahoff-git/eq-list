# 0260: A paged grid's filter allow-list can widen past its sort one

## Status

Accepted

## Context

The user's report was blunt: "I see no reason why the filter option should be disabled on any column
in a MUI grid" — pointing at Source (`causeKind`) in the Hits tab's ledger, whose column-menu offers no
Filter item at all.

[ADR 0234](./0234-a-paged-grid-gets-a-fixed-height-and-a-real-filter.md) made `hitsPage`'s filter reach
the whole ledger through a fixed allow-list (`HIT_FILTER_COLUMNS`) keyed by the same
`FactionHitSortField` union the sort side uses, on the reasoning that a filter's `field` must never
become anything but one of a handful of hardcoded SQL expressions. [ADR 0251](./0251-a-grids-unshown-columns-are-still-reachable.md)
later gave `causeKind` and `raw` ordinary `GridColDef`s and, seeing they weren't in that union, marked
both `sortable: false` *and* `filterable: false` — reasoning that "a menu item that silently does
nothing is worse than one that isn't offered."

That reasoning was sound at the time but rested on an unchecked premise: that neither field is backed
by anything `hitsPage` could actually filter on. Both are. `raw` is a plain `TEXT NOT NULL` column
(the original log line) already sitting in `faction_hits`, unfiltered only because nobody had added it
to the allow-list. `causeKind` is closer: the grid's `causeKindLabel` (`faction-sort.ts`) renders
`caused_by_kind`'s `"kill"`/`"dialogue"` as `"Kill"`/`"Quest"`, and `HIT_SORT_COLUMNS`'s own
`faction: "LOWER(faction)"` entry already establishes that an allow-listed "column" can be a fixed SQL
expression, not just a bare column name — so a `CASE` reproducing that same label is exactly as safe as
any other entry there, with no new class of query the allow-list wasn't already built to hold.

Sorting is a separate question this didn't have to reopen. `causeKind` has no single column to order
by that would mean anything (it's a derived two-value label), and nothing about the user's complaint
asked for it — only the filter menu was flagged as missing.

## Decision

**Split "sortable" from "filterable" as allow-lists, instead of one union serving both.**
`src/shared/types.ts` gains `FactionHitFilterField = FactionHitSortField | "causeKind" | "raw"`, and
`FactionHitFilterItem.field` widens to it; `FactionHitSortField` itself, and `hitsPage`'s `sortField`,
are untouched.

`electron/faction-log.ts`'s `HIT_FILTER_COLUMNS` (now `Record<FactionHitFilterField, ...>`) gains:

- `raw: { column: "raw", kind: "text" }` — filters the stored log line directly, the same
  `contains`/`equals`/… operators every other text field already gets.
- `causeKind: { column: "(CASE caused_by_kind WHEN 'kill' THEN 'Kill' WHEN 'dialogue' THEN 'Quest'
  ELSE NULL END)", kind: "text" }` — filters against the *rendered* label, not the raw stored kind,
  matching `cause`'s own precedent of choosing whichever side of a guess the reader actually sees
  (there: the named mob/NPC over the wrapper text; here: the label over the internal enum). Every
  value the player types still travels as a bound `?` parameter — only this fixed expression is ever
  concatenated into the SQL text, same discipline as every other entry.

`FactionPanel.tsx`'s `hitColumns` drops `filterable: false` from both `causeKind` and `raw`
(`sortable: false` stays), and `HIT_FILTER_FIELDS` — the client-side gate before a filter item is even
handed to `toHitsFilter` — grows to match.

## Consequences

- Source and Raw line both gain a working Filter item in the main Hits tab's column menu, reaching the
  whole ledger server-side like every other filterable column there (ADR 0234).
- The Standings drill-down's scoped `FactionHitsGrid` gets the same two columns filterable for free —
  it never used `hitsPage`'s server filter at all (its own scope filter and a column filter aren't
  composable yet), so removing `filterable: false` there just restores MUI's ordinary client-side
  filtering over the page already fetched, same as every other column on that grid.
- Sorting is unchanged: `causeKind` and `raw` remain `sortable: false`, for the reason ADR 0251 already
  gave (neither is a `FactionHitSortField` `hitsPage` knows how to order by) — this decision only
  found the filter half of that reasoning didn't hold.
- The allow-list's shape is now proven to generalize past the four fields it launched with: an
  unsortable, non-enum text column (`raw`) and a derived label with no column of its own (`causeKind`)
  both fit the same `{ column, kind }` contract ADR 0234 wrote for plain columns. A future filterable
  field on this grid should extend `HIT_FILTER_COLUMNS` the same way rather than assume it needs a new
  mechanism.
