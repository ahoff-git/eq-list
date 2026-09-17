# 0254: Loot Drops pages server-side for the common case

## Status

Accepted — supersedes [0250](./0250-loot-drops-reaches-the-whole-ledger-unconditionally.md) for
the case described below.

## Context

ADR 0250 made `DropTable` always read `loot.search` — the whole matching set, even with nothing
filtered — and page through it client-side, a deliberate, considered choice against building a
`hitsPage`-style paged IPC query: "nothing has shown that fetching the whole matching set costs
enough to be worth a second bespoke paged-query shape... a `dropsPage` remains the fallback if it's
ever shown to cost real time." That evidence bar hasn't been cleared by a report. This work chose to
build it anyway, proactively, on the same reasoning already applied to two other performance fixes
in this pass ([ADR 0253](./0253-the-map-window-patches-in-only-touched-kills.md)): `loot_records` is
uncapped by design (ADR 0232/0243) specifically so a long-lived character's ledger grows without
bound, and "fetch the whole thing" is a cost that grows with exactly that, whether or not it has
been measured yet.

## Decision

**`DropTable` reads from `loot.dropsPage` (mirroring `faction-log.ts`'s `hitsPage` exactly:
offset/limit/sort/filter pushed into one SQL query, `COUNT(*)` for the total) whenever
`filters.wantedOnly` is off and the sort isn't by `zone`.** That covers the ordinary case — opening
the tab, filtering by fate/item/source/zone, sorting by time/item/source/qty/fate — end to end.

**Two things ADR 0250 already named as not worth a SQL bridge stay exactly as they were, on
purpose, not as a gap left open by oversight:**
- `wantedOnly` (the shopping-list cross-reference) still reads the whole matching set via
  `loot.search` and filters client-side. It has no clean SQL translation without either a
  registered SQL function or duplicating `normalizeItemName`'s grade-stripping logic in SQL —
  still not earned by this change either.
- Sorting by **zone** still reads the whole matching set and sorts client-side. Grouping by *place*
  needs `placeName`/`placeKey`'s raw-spelling fold (`Blackburrow`, `Blackburrow 3`, `The Blackburrow
  1 (Awakened)` are one group) — a JS-side fold, not a SQL-native one, and `faction-log.ts`'s own
  `hitsPage` never had to solve this (it has no `zone` sort field at all).

`LootPanel.tsx` picks the path per render: `dropsQuery` is `null` (skipping `loot.dropsPage`
entirely) whenever `wantedOnly` is on or the sort key is `zone`, in which case `loot.search` runs
instead (skipped itself, via the same `filter: null` short-circuit `useLootSearch` already
supported, whenever the server-paged path is active) — so only one of the two ever actually queries
the ledger on a given render, never both. Toggling `wantedOnly` or re-sorting by zone switches
`DropTable` between MUI's server (`paginationMode="server"`, controlled `paginationModel`/
`rowCount`) and client (uncontrolled, `initialState`-seeded) pagination modes live.

The header's total count and per-fate tallies — always "every match, not just a page's worth" —
now come from `dropsPage`'s own `total`/`tallies` fields (`SUM(qty) ... GROUP BY fate`, `fate`
already indexed per ADR 0247) when server-paged, instead of folding `tallyFates` over an array the
caller no longer fetches whole.

## Consequences

- Opening the Loot tab, and every fate/item/source/zone filter or time/item/source/qty/fate
  re-sort, now costs one bounded SQL page plus two small aggregate queries (`COUNT`, `SUM...GROUP
  BY`) — not a fetch of the ledger's entire matching set — regardless of how long the character has
  played.
- `wantedOnly` and a zone sort are unchanged in cost and behavior from before this ADR: still a
  whole-matching-set fetch, paginated client-side. This is an explicit, named scope limit, not
  something this ADR claims to have fixed.
- A re-filter or re-sort resets the grid's page back to 0 — otherwise the view could strand itself
  on a page number that described something else entirely under the old query, the same reasoning
  `useGridSort`'s own doc already gives for `HitTable`'s identical reset on re-sort.
- `LootLog.search`'s behavior, signature and the whole-ledger-fetch code path itself are unchanged —
  `dropsPage` is additive, built by factoring `search`'s existing filter-building logic into a
  shared `buildDropWhere` both now call.
