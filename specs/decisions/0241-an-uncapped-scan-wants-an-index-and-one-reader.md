# 0241: An uncapped scan wants an index, and one reader

## Status

Accepted

## Context

A performance pass across every tab, specifically looking for places the SQLite migration
([ADR 0232](./0232-a-ledger-that-outlives-its-cap-is-a-database.md)) changed what's actually cheap.
`kill-log.ts` (`MAX_KILLS = 5000`) and `combat-history.ts` (`MAX_FIGHTS = 1000`) both deliberately kept
their caps through the migration — "a pure storage-engine swap," per their own module docs — so every
tab that reads only from those two (Hunt, Timers, Goals, Achievements, Damage, Session, Peers) costs
exactly what it did before. `faction-log.ts` and `loot-log.ts` are the two stores that actually changed
capability: uncapped, and newly query-able. Two real gaps turned up, both downstream of that change:

**1. `loot-log.ts`'s `search()`/`vocabulary()` (ADR 0240) had no index to use.** `loot_records` carried
indexes on `at` and `item` (from its original migration) but none on `source` or `zone` — exactly the
two columns the new `search()` filters on and `vocabulary()` runs `SELECT DISTINCT` over. Both are
high-cardinality (one value per corpse or camp, not per fate), so a query the LootPanel now runs on
every filter-engage was doing a full table scan of a table with no cap left to bound its growth.

**2. The Search tab reads the same uncapped aggregate twice, in lock-step.** `SearchPanel.tsx` calls
`useKnownItems()` (`src/lib/hooks.ts`) for its own "what you've held" results, and renders
`ObservedItemView` — the page shown for an item title neither the wiki nor Lucy recognizes, which this
build's own custom drops hit often (ADR 0103/ADR 0025) — as a child whenever no wiki page loaded.
`ObservedItemView` called `useKnownItems()` a second time, independently. `useKnownItems()`'s own doc
comment already explains its refresh trigger: it follows `kills.onChanged`, "the coalesced one" that
fires on every kill (not just a bulk import). So for as long as an observed-item page stayed open, two
live hook instances each called `loot.items()` — `loot-log.ts`'s `SELECT ... GROUP BY item` over the
whole (uncapped) `loot_records` table — and `mobs.all()`, in step, on every single kill. Harmless at a
few hundred drops; not free at the tens of thousands a long-lived character's ledger now has no cap to
stop growing past.

## Decision

- **New migration, `loot_records_source_zone_idx` (version 5 — the next free slot after
  `combat-history.ts`'s version 4; every store's migrations share one `user_version` sequence,
  `sqlite-store.ts`).** Adds `CREATE INDEX loot_records_source_idx ON loot_records(source)` and
  `CREATE INDEX loot_records_zone_idx ON loot_records(zone)`, additive alongside the existing `at`/
  `item` indexes from `loot-log.ts`'s original migration — untouched, per the "never edit an applied
  migration" rule.
- **`ObservedItemView` no longer calls `useKnownItems()` itself.** It takes `known: readonly
  KnownItem[]` as a prop; `SearchPanel` passes down the one instance it already reads for its own
  results. One `loot.items()`/`mobs.all()` pair per open Search tab, not two.
- `faction-log.ts`'s `faction_hits` already carried indexes on `faction` and `at` from its own original
  migration (checked, not touched) — hits are sparser than drops (one per faction-affecting line, not
  per corpse), and its filterable `delta`/`cause` columns are typically compared with `LOWER()`/range
  operators a plain index wouldn't serve anyway, so no new index was added there. `kill-log.ts`'s and
  `combat-history.ts`'s full-scan patterns were left exactly as they are — capped, deliberate, and
  already reasoned about in their own comments as costing no more than the arrays they replaced.

## Consequences

- `search()`/`vocabulary()`'s `source`/`zone` scans are now indexed, not a full table scan — the actual
  performance floor the ledger's uncapped growth would otherwise have quietly lowered over a character's
  lifetime, the same way ADR 0240 fixed the fetch-cap side of the same feature.
- The Search tab's "what you've held" computation is read once and shared, not run twice in step on
  every kill for as long as an observed-item page is open.
- No other tab needed a change: everything else either doesn't touch `faction-log.ts`/`loot-log.ts` at
  all, or already reads them the way ADR 0234/0240 already established (`hitsPage`, `search`,
  `vocabulary`, the cheap single-row probe queries).
