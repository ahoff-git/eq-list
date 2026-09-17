# 0250: Loot Drops reaches the whole ledger unconditionally, paginated client-side

## Status

Accepted

## Context

`LootPanel`'s Drops view used to split on whether a filter was engaged:
[ADR 0211](./0211-a-loot-filter-searches-the-ledger-not-the-window.md) fetched a small recent window
(`useLootFeed`, 200 rows) in the common, nothing-filtered case, and reached the whole ledger through a
real query (`loot.search`) only once a filter turned on — [ADR 0240](./0240-a-loot-search-outgrew-its-own-fetch-cap.md)
kept that split when the ledger's own cap disappeared, just replacing a wider fetch with a real SQL
query for the filtered half. Either way, what actually reached the grid was capped a second time at
`MAX_ROWS = 300`, with a "showing the first 300 of N" note standing in for a real pager.

[ADR 0249](./0249-every-grid-gets-a-real-pager.md) gives every grid in the app a working footer, Drops
included. A page picker and a hard 300-row ceiling don't coexist usefully — a picker whose last page
is always page 6 of an artificial 300 isn't pagination, it's the same cap with extra clicks. The
`recent`-window/`search` split existed to keep the common case cheap; once the row limit it was
protecting is gone, the split itself stops pulling its weight; either path now needs "everything
that matches," including "nothing narrows it."

`loot.search`'s own filter (`fate`/`item`/`source`/`zone`) already resolves to no `WHERE` clause at
all when nothing is set, which is exactly "the whole ledger" — the unfiltered case doesn't need a
different code path, it needs the same one called with an empty filter object instead of `null`.
`wantedOnly` (on the shopping list) stays a client-side fold over whatever `search` returns, same as
before: the shopping list lives in a different store `loot-log.ts` has never known about, and
building a SQL bridge for one checkbox isn't earned by anything asked for here.

## Decision

`DropTable` now always reads from `useLootSearch`, never from the capped `useLootFeed` window — the
"recent" fetch shrinks to a one-row probe (`PROBE_FETCH`) kept only for the empty-ledger check and
the prices-refetch key, the same shape `FactionPanel`'s `HITS_PROBE_QUERY` uses. `MAX_ROWS` and its
"showing the first 300 of N" message are gone; the grid's own footer (`GRID_SX_FILL`, `DROP_PAGE_SIZES
= [25, 50, 100]`, default 50) pages through however many rows `filterLoot`/`sortLoot` hand it.

**This is client-side pagination over an already-fetched array, not a `hitsPage`-style paged IPC
query** — a real, considered choice against the more scalable alternative. `FactionPanel`'s
`HitTable` fetches one page at a time over IPC specifically because the ledger it reads has no cap
and no upper bound worth guessing at (ADR 0232/0234). Loot's ledger is in the same uncapped position,
so the same argument for a server-paged query applies in principle — but `loot.search` already
resolves in one query with an index behind every filterable column (ADR 0241), nothing has shown that
fetching the whole matching set costs enough to be worth a second bespoke paged-query shape, and
`wantedOnly`'s shopping-list join has no clean SQL translation without either a registered SQL
function or duplicating `normalizeItemName`'s grade-stripping logic in SQL. Building that now would be
solving a cost nobody has measured, for a filter this store was explicitly built to leave to its
caller (`loot-log.ts`'s own `search` doc comment already says so). If a very long-lived character's
full ledger ever proves slow enough to fetch whole, a `dropsPage` mirroring `hitsPage` is the natural
next step — the same deferral ADR 0240 already made once, just moved one door further down the hall.

## Consequences

- Drops now shows every matching row, paged, instead of the first 300 with a dead end past it —
  the actual gap this closes.
- The Loot tab's "nothing filtered" case is no longer free: opening it now always issues a
  `loot.search({})` (a full, indexed-by-nothing scan ordered by `at DESC, rowid DESC`) instead of a
  small `recent(200)` fetch. Accepted rather than measured — the same "no evidence yet this matters"
  position ADR 0240/0241 already took for the filtered case, now extended to the unfiltered one too.
- `wantedOnly` still filters client-side, after the whole ledger is already in hand — correct
  regardless of how many rows that is, since the count and the page math are both taken from the
  same, already-filtered `matches` array rather than a page fetched before that filter ran.
- A future `dropsPage` (offset/limit/sort/filter over IPC, mirroring `hitsPage`) remains the fallback
  if the whole-ledger fetch is ever shown to cost real time on a long-lived character's install — not
  built here because nothing has shown it's needed yet.
