# 0247: A background cache any SQL-derived value can share

## Status

Accepted

## Context

[ADR 0246](./0246-kill-observations-recompute-on-a-worker-thread.md) built a specific fix for one
value — `kill-log.ts`'s `observations()` — that had every property this problem class shares: a full
scan of a table with no cap on its size (ADR 0232/0243), genuinely expensive JS-side folding, and a
trigger frequent enough (every kill) that recomputing it inline was a recurring, growing tax on the
thread every window's IPC shares. That fix worked, but it was written entirely inside `kill-log.ts` —
the cache, the worker lifecycle, the debounce, the version bookkeeping — with nothing else in the
codebase able to reuse any of it.

A pass over the other stores found the same shape twice more, both real:

- **`combat-history.ts`'s `zones()`/`bests()`/`sessions()`** — three separate full scans of
  `combat_fights` (uncapped since ADR 0243), each `JSON.parse`-ing every fight's whole breakdown
  (every combatant, spell, damage cell, per-second sample), triggered on every fight-end while the
  Damage or Session tab is open.
- **`loot-log.ts`'s `prices()`** — a full sequential scan of `loot_records` (no index existed on
  `fate`, the column it filters by), triggered on **every loot line**, sale or not, since
  `LootPanel.tsx` keys its price read on the newest drop's identity rather than on sales specifically.

Two ruled out for not actually fitting: `contributions.ts`/`peer-kills.ts`'s pooled data is capped per
contributor, not unbounded; `faction-log.ts`'s `standings()` and `loot-log.ts`'s `items()` are already
genuine SQL `GROUP BY` queries, not JS-side folds, so there's no main-thread cost here to move.

## Decision

**Generalize ADR 0246's mechanism into `background-cache.ts`'s `createBackgroundCache<T>`, and move
every genuine match onto it — including the original.**

- `computeSync`, `dbFile`, `modulePath`/`exportName`, and optional `refreshDebounceMs`/
  `workerTimeoutMs` in; a `{ get(), markChanged(), onRefreshed(cb) }` handle out. `get()` keeps the
  exact contract ADR 0246 established: synchronous, always correct, trusting its cache only while
  confirmed to reflect the latest `markChanged()`, recomputing right there otherwise. Every caller —
  `kill-log.ts`, `combat-history.ts`, `loot-log.ts` — keeps its own public methods exactly as they
  were; nothing outside these three files' internals changed shape.
- **One shared worker script, `background-cache-worker.ts`, not one per store.** ADR 0246's original
  `kill-observations-worker.ts` was hand-written for exactly one computation; this version is generic
  by construction — it's handed `dbFile`/`modulePath`/`exportName` as `workerData` and loads the named
  export by `require`, so any future background cache reuses this same compiled file rather than
  growing its own. `kill-observations-worker.ts` is deleted; `kill-log.ts` now points the shared
  factory at `kill-observations.js`'s `computeObservations` the same way the other two point it at
  their own modules.
- **Each store's expensive computation still lives in its own small, side-effect-free module** —
  `kill-observations.ts`, `combat-history-reports.ts`, `loot-prices.ts` — exactly ADR 0246's pattern,
  since a worker loaded by module path can't pull in `createKillLog`/`createCombatHistory`/
  `createLootLog` and everything each closes over.
- **`combat-history-reports.ts` bundles all three reports into one `computeCombatReports`,** not three
  separate caches: `zones()`/`bests()`/`sessions()` all fold the same fetched-and-parsed rows, so
  computing them together means the table is scanned and JSON-parsed once per refresh instead of
  three times. Each public method just plucks its own field off the one shared cache.
- **`loot-log.ts` also gained the index it was missing** (`loot_records_fate_idx`, migration 8):
  `prices()`'s `WHERE fate = 'sold'` had no index to use, unlike `source`/`zone` (ADR 0241). Low
  cardinality (four fates), but a real win regardless — a sale is typically a small slice of
  everything looted, so an index lets SQLite go straight to it instead of scanning every row.
- **`coalesce()`** (the leading-throttle helper `main.ts` already had, for collapsing a burst of kill
  lines into one `killsChanged` broadcast) is now shared from `electron/coalesce.ts` — `kill-log.ts`
  needed the identical shape for a different burst, in ADR 0246, and a second hand-written copy would
  have been exactly the kind of duplication this project avoids elsewhere.
- **`main.ts`/the renderer each needed their own "a background refresh landed" notice**, since none
  already existed for combat history or loot prices the way `killsChanged` already did for kills:
  `history.onCombatReportsChanged`/`lootLog.onPricesChanged` each broadcast a new dedicated channel
  (`CH.combatHistoryChanged`/`CH.lootPricesChanged`), and `useCombatReportsRefresh`/a private
  `usePricesRefresh` fold a re-read tick into `CampReport.tsx`/`DamagePanel.tsx`/`DamageHistory.tsx`
  and `useItemPrices` respectively — the same shape `kill-log.ts`'s reuse of the existing
  `killsChanged` channel already established, just with new plumbing where nothing was there to reuse.

## Consequences

- Three background-cached values now exist, all on one factory: `kill-log.ts`'s `observations()`
  (ADR 0246), `combat-history.ts`'s `zones()`/`bests()`/`sessions()`, and `loot-log.ts`'s `prices()`.
  A fourth candidate need only write its own small compute module and call `createBackgroundCache` —
  no new worker file, no new debounce/timeout/discard logic to get right.
- Verified the same way as ADR 0246: a live smoke test against a real file-backed database for each
  of the two new applications, confirming the worker actually spawns, computes, and hands a result
  back — not just typechecked. Full suite (2693 tests) green, including one new per-store test that
  exercises the real worker (every one of these stores' tests uses a real file, never `:memory:`,
  for exactly this reason).
- `combat-history.ts`'s own `labelFor` and row-mapping (`FightRow`/`rowToFight`) now live in
  `combat-history-reports.ts` and are imported back — the same "the small new module is the leaf,
  the large existing one depends on it" direction ADR 0246 established for `kill-log.ts`/
  `kill-observations.ts`, chosen specifically to avoid a circular import between the store and its
  own worker-loadable compute module.
- `loot-log.ts`'s `clear("records")` now calls `pricesCache.get()` rather than a freestanding
  `computePrices()` — provably equivalent (`get()`'s own contract guarantees "the correct current
  value" either way), and it means there is exactly one place that knows how to compute a price.
