# 0240: A loot search outgrew its own fetch cap

## Status

Accepted

Its own Consequences section flagged real pagination over the search results as the natural
follow-up "if it does [matter]" — [0250](./0250-loot-drops-reaches-the-whole-ledger-unconditionally.md)
is that follow-up: `search`/`vocabulary` themselves are unchanged, only `LootPanel`'s "small window
unless filtered" split around them is gone.

## Context

[ADR 0211](./0211-a-loot-filter-searches-the-ledger-not-the-window.md) fixed the loot tab's item
search by widening what `LootPanel.tsx` fetches from `DEFAULT_FETCH = 200` to
`SEARCH_FETCH = 20_000` the moment any filter engaged — deliberately calibrated to
`loot-log.ts`'s then-cap, `MAX_LOOT = 20_000` (`electron/loot-log.ts`), so "widen the fetch" and
"fetch the whole ledger" meant the same thing.

[ADR 0232](./0232-a-ledger-that-outlives-its-cap-is-a-database.md) migrated `loot-log.ts` off that
capped array onto SQLite and removed `MAX_LOOT` entirely — the ledger now keeps every drop forever.
Nobody revisited `SEARCH_FETCH`. The constant is still 20,000, but it no longer bounds anything real:
it's just a number `LootPanel.tsx` asks `loot.recent()` for. A character with more than 20,000 drops
on record — plausible over a long-lived character now that nothing evicts old rows — reintroduces
the exact bug ADR 0211 fixed, just past a higher threshold: the item search box silently answers "not
found" for something that demonstrably dropped, because it fell outside the fetch window.

ADR 0211 also left an explicit open item in its own Consequences: the zone/source dropdown options
(`lootZones`/`lootSources`) were derived from whatever had already been fetched, so an old camp's
name couldn't be *picked* from the dropdown until some other filter had happened to widen the fetch
first. That was deferred as "a narrower follow-up if it turns out to matter" — it matters now for the
same underlying reason: there is no longer a ledger-wide cap to fetch "everything" up to, so
"whatever's fetched" and "everything the ledger has" are no longer the same set at any fetch size.

## Decision

Replace "widen the fetch" with a real query, now that the store backing it can answer one:

- **`loot-log.ts` gains `search(filter: LootSearchFilter): LootRecord[]`** — a parameterized SQL
  query over the whole `loot_records` table, matching `fate` (exact), `item` (case-insensitive
  substring, via the `likeEscape` helper `faction-log.ts` already used for its own `LIKE` filtering —
  now exported from `sqlite-store.ts` so both stores share one escaping rule instead of two copies),
  `source` (exact), and `zone`. `zone` is a **place** (`placeName`'s own vocabulary, same as
  `LootFilters.zone`), not a raw logged spelling, so it's resolved inside the store: `SELECT DISTINCT
  zone` once, folded through `placeKey` in JS to the raw spellings that match, then bound into an
  `IN (...)` clause. `placeKey`/`placeName`'s gazetteer lookup has no SQL equivalent, so this keeps the
  fold where it already lives rather than trying to port it.
- **`loot-log.ts` gains `vocabulary(): LootVocabulary`** — every distinct `source` and raw `zone` the
  ledger has ever recorded, via two more `SELECT DISTINCT` queries. This is what resolves ADR 0211's
  open item: the filter bar's own picker options now reach the whole ledger unconditionally, not just
  whatever a fetch happened to hold.
- **`LootPanel.tsx` branches on `isFiltered(filters)`**: unfiltered, it still reads
  `useLootFeed(DEFAULT_FETCH)` — the "the common case costs nothing" half of ADR 0211's split is
  unchanged. The moment a filter engages, it calls the new `useLootSearch(filter)` hook instead of
  widening `useLootFeed`'s own limit; `SEARCH_FETCH` is deleted along with the code path that used it.
  `useLootSearch` takes `filter: LootSearchFilter | null`, where `null` means "don't search at all" —
  resolving to an empty result without ever calling `loot.search` over IPC, so the unfiltered case
  doesn't pay for a query it doesn't need.
- **The zone/source pickers now read `useLootVocabulary()`**, folded through two small pure helpers
  in `loot-filters.ts` (`foldSources`/`foldZones`) that apply the same fold `lootSources`/`lootZones`
  already apply to a fetched `LootRecord[]`, just over the vocabulary's raw strings instead.
- **`wantedOnly` stays a client-side-only concern.** It depends on the shopping list, which
  `loot-log.ts` has never known about and gains no reason to now — `LootPanel.tsx` still runs the
  already-narrowed search results (or the unfiltered feed) back through the existing `filterLoot`,
  which is idempotent on the filters the search already applied and is the only place `wantedOnly` is
  actually checked.

## Consequences

- The item, fate, source and zone filters now find a match anywhere in the ledger regardless of how
  large it's grown — the cap-miscalibration gap this ADR exists to close.
- Zone and source picker options are complete from the moment the panel opens, not contingent on some
  other filter having widened a fetch first — ADR 0211's deferred item, resolved.
- Engaging any filter (including "on my list" alone, with nothing else narrowing) still costs one
  unbounded query over IPC — the same cost ADR 0211 already accepted for "a filter reaches the whole
  ledger," just no longer artificially capped at 20,000. A ledger with hundreds of thousands of drops
  pays for a real table scan on every filter-engage; no evidence yet that this matters in practice, and
  adding pagination to the search results themselves (mirroring `hitsPage`,
  [ADR 0234](./0234-a-paged-grid-gets-a-fixed-height-and-a-real-filter.md)) is the natural follow-up if
  it does.
- `likeEscape` is now shared (`sqlite-store.ts`) rather than duplicated — `faction-log.ts`'s copy was
  removed in favor of the import, so there is exactly one rule for what a literal `%`/`_` in a search
  box means.
