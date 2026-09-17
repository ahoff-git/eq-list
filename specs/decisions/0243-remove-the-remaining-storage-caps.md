# 0243: Remove the remaining storage caps

## Status

Accepted

## Context

[ADR 0232](./0232-a-ledger-that-outlives-its-cap-is-a-database.md) migrated all four ledgers off
capped JSON arrays onto SQLite, but only removed the cap itself for two of them —
`faction-log.ts`/`loot-log.ts` kept every hit and drop forever, while `kill-log.ts`'s `MAX_KILLS`
(5,000) and `combat-history.ts`'s `MAX_FIGHTS` (1,000) stayed exactly as they were. That was a
deliberate, scoped choice at the time: the cap wasn't an artifact of an array needing to fit in
memory, it wàs read as a *feature* — "many evenings" of raw, plottable heatmap detail, or "a few
weeks" of digestible fight history — with the derived knowledge (drop rates, roam areas) already
kept forever regardless via `mob_observations_frozen`.

Revisited with a plainer question: now that every ledger's *query* has to earn its own cost (ADR
0234/0240/0241 all did exactly this for `faction-log.ts`/`loot-log.ts`), does `kill-log.ts`/
`combat-history.ts`'s cap still buy anything a bounded query wouldn't buy more honestly? It doesn't.
The cap was silently discarding data a player might reasonably want back — a heatmap's whole point is
completeness for the camp being drawn, and `combat-history.ts`'s own module doc already named its
cap's cost outright: "`zones()`/`bests()` still only reflect currently-held fights — the same accepted
gap" ADR 0232 left open, rather than fixed. Keeping detail forever and bounding what a *query* fetches
is strictly more capable and no more expensive at the sizes these tables actually reach — the same
lesson ADR 0232 already drew for the other two, just not carried all the way through the first time.

## Decision

**`MAX_KILLS` and `MAX_FIGHTS` are gone.** `kill_records` and `combat_fights` now keep every kill and
every fight forever, the same as `faction_hits`/`loot_records`. Concretely:

- `kill-log.ts`: the insert-time eviction block in `record()` is gone, along with `oldest(n)` (the
  function that chose which records to evict — nothing left to call it). `clear("records")`'s own
  `retire()` call is untouched — it's what still folds held detail into `mob_observations_frozen`
  before forgetting it, on a *user's* request rather than an automatic one.
- `combat-history.ts`: `enforceCap()` and `selectOldest` are gone, along with both call sites (`add()`,
  `rederive()`). This incidentally resolves the "zones()/bests() only reflect held fights" gap ADR 0232
  had explicitly left open — with nothing evicted, a full scan **is** the whole history.
- **Every query that used to lean on "the table is small" now earns its bound explicitly**, the same
  pattern `loot-log.ts`'s `search()`/`vocabulary()` already established (ADR 0240/0241):
  - `kill-log.ts`'s `kills(zone?)`: given a zone, resolves it to every raw logged spelling that folds
    to the same place (`SELECT DISTINCT zone`, filtered through `samePlace` — the existing fuzzy match,
    unchanged) and pushes the result into a `zone IN (...)` clause — the whole history for that one
    camp, same as before, just server-side. With no zone, `DEFAULT_LIMIT` (200) recent kills instead:
    the one unscoped caller (`SpawnPanel`'s "recent camps") only ever wanted a recent window, not the
    ledger's whole lifetime.
  - `kill-log.ts`'s `recentCandidates()` (what `noteLoot`/`noteCoin` scan for a corpse to credit) now
    reads its statement with `.iterate()` instead of `.all()` — SQLite pulls one row at a time, so the
    existing early `break` (once a row falls outside `LOOT_WINDOW_MS`) actually stops the underlying
    scan instead of first materializing the whole table into JS objects regardless.
  - `combat-history.ts`'s `fights(sessionId)` now runs `WHERE sessionId = ?` instead of fetching and
    JSON-parsing every fight ever recorded to find one sitting's worth.
  - `combat-history.ts`'s `zones()`/`bests()`/`sessions()`/`search()`/`sources()` are **not** changed
    to push down further — each fight's relevant numbers live inside its `statsJson` blob, not scalar
    columns a `WHERE`/`GROUP BY` could reach, and `search()`'s label is deliberately recomputed from the
    full stats on every read rather than trusted from a stored column (`labelFor`'s own doc). Denormalizing
    the aggregated fields into real columns is real schema work, not a mechanical add-on here — left as
    an accepted full scan, the same class as `kill-log.ts`'s own `observations()`.
- **New indexes for the new access patterns**: `kill_records_zone_idx` (migration 6) and
  `combat_fights_sessionId_idx` (migration 7) — additive, following the same "index in the same
  migration that adds the query" rule `loot_records_source_zone_idx` (ADR 0241) set.
- **`sqlite-store.ts` now says, in its own module doc, to keep doing this**: check for (or add) an
  index whenever a new `WHERE`/`ORDER BY`/`GROUP BY` lands on one of these tables, since none of them
  caps what it keeps any more — a durable reminder for whoever adds the next query, not a one-time todo
  item, since a codebase's queries keep changing and this file can't check itself.

**Two small shared helpers came out of touching both files for the same reason.** `kill-log.ts` and
`combat-history.ts` each carried their own copy of the same two things:
`DEFAULT_LIMIT = 200`, matching `faction-log.ts`'s and `loot-log.ts`'s own local copy of the identical
constant, is now one export from `sqlite-store.ts`. And the null-boolean admin-patch re-coercion
(`adminFieldType` reads a field's type from its *current* value, so a boolean column still holding SQL
`NULL` needs its typed `"true"`/`"false"` string patch corrected back to a real boolean before binding)
was duplicated near-verbatim in both stores' `applyPatch` — now `coerceBooleanAdminPatch`/`triNull`,
exported once from `admin.ts`.

## Consequences

- A heatmap, a fight search, or a "which camp is best" question now answers from the player's whole
  history rather than silently going quiet past the old bound — the exact gap `combat-history.ts`'s own
  module doc already flagged as accepted-but-not-fixed.
- `RederiveOutcome.trimmed` (surfaced in `LogSettings.tsx` as "N fights in the log are older than the
  history keeps") will now read 0 in the overwhelming majority of cases — the only way it's still
  nonzero is the pre-existing same-log-second key collision case `insertFight`'s `OR IGNORE` handles,
  unrelated to a cap. Left in place rather than plumbed out of the type/IPC/UI layers: it's still
  correct, just rarely nonzero now, and removing a field is a bigger, separate change than this ADR's
  scope.
- `kill-log.ts`'s `observations()` and `combat-history.ts`'s `zones()`/`bests()`/`sessions()`/`search()`
  remain full-table scans, same as before this ADR — now scanning a table with no cap on its growth
  instead of one bounded at 5,000/1,000 rows. Not measured to matter yet; the natural next step if it
  ever does is denormalizing the handful of scalar fields these actually aggregate
  (`kills`/`durationSec`/`xpPct`/`copper`/`soldCopper`/`yourDealt` for combat-history; nothing more for
  kill-log, whose `observeMobs`/`clusterAreas` genuinely need per-record geometry no aggregate column
  could replace) into real columns and rewriting the fold as a SQL `GROUP BY`, the same shape
  `faction-log.ts`'s `standings()` already took.
- Kill-log and combat-history tests that specifically exercised cap-eviction (`oldest()`'s selection
  rule, `enforceCap()`'s trim-the-oldest-by-clock behavior, self-eviction avoidance, garbled-timestamp
  handling) were rewritten or removed: the mechanism they tested no longer exists. The properties worth
  keeping — a kill's dedup key survives its record leaving, a leaving record's knowledge survives as an
  observation, kills/drops are conserved in bulk — are now exercised through `clear("records")`, the one
  remaining way a kill record leaves `kill_records` without leaving the knowledge it taught.
