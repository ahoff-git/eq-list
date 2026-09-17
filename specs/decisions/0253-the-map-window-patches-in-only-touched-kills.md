# 0253: The map window patches in only touched kills

## Status

Accepted

## Context

[ADR 0243](./0243-remove-the-remaining-storage-caps.md) removed `kill-log.ts`'s `MAX_KILLS` cap so
`kills(zone)` could answer a heatmap with a camp's **whole** recorded history, by design — a
heatmap's whole point is completeness for the camp it's drawing, and `kills(zone)` already pushes
its zone resolution server-side for exactly this reason. `main.ts`'s `killsChanged` broadcast
coalesces every kill/loot/coin event over a ~500ms window (`KILLS_NOTICE_MS`) specifically so a
burst of events costs one round trip, not one per event — a real, already-applied fix for a
previously-measured problem (a `/loc`-keyed refresh key that redrew the heatmap on every position
fix, not just every kill).

What's left uncosted is what that one round trip actually fetches: `useKills(zone)` (`hooks.ts`)
still replaces its whole result with a fresh `kills(zone)` call on every notice, and `kills(zone)`
still means "this camp's entire history." For a camp played for many hours across many sessions —
exactly the case ADR 0243 removed the cap to support — that's the *same* full-history payload,
re-fetched and re-transferred over IPC, on every coalesced tick of live combat, growing without
bound as the camp's lifetime kill count grows. Nothing has measured this as an acute problem today;
it is built ahead of a report, on the strength of the same growth argument ADR 0243 itself made
("a heatmap wants every kill this camp has ever produced") now cutting the other way — completeness
was worth removing a cap for, and the same completeness is worth not re-paying for on every tick.

## Decision

**`kills(zone)` itself is unchanged. What changed is what a live notice asks it to re-fetch.**

- `kill-log.ts` tracks the ids `record()`/`noteLoot()`'s `attachDrop`/`noteCoin()`'s `attachCoin`
  touch, in a small in-memory array drained by a new `drainTouched()` — purely additive; every
  existing method's signature, return value and test stays exactly as it was.
- A new `byIds(ids)` answers with full records for exactly those ids — a `SELECT ... WHERE id IN
  (...)` against `kill_records`'s own `id TEXT PRIMARY KEY`, as cheap a lookup as SQLite offers.
- `main.ts`'s coalesced `killsChanged` broadcast now carries `killLog.drainTouched()` instead of
  `undefined`. Every *other* existing `broadcast(CH.killsChanged, undefined)` call site — an admin
  edit, `kills.clear`, a log re-read — is untouched, and keeps sending `undefined`. That stays the
  "assume everything may have changed, refetch in full" signal those bulk, infrequent operations
  already relied on; only the high-frequency live-combat path gets the new, narrower one.
- `useKills` keeps an id-keyed map instead of a plain array. Given a *zone* and a notice that names
  ids, it fetches just those ids and folds them in — for each returned row, only if
  `samePlace(row.zone, zone)`, the identical raw-spelling fold `kills(zone)` itself resolves
  server-side (and the same check `usePeerKills`'s `zoneMatch` already runs for the heatmap's other
  half) — dropping a kill that happened at a different camp while this window was open. A notice
  with no ids, or no zone at all (`SpawnPanel`'s unscoped "recent camps", which only ever wants
  `DEFAULT_LIMIT`'s small bounded window and was never the expensive path), still triggers a full
  reload exactly as before.
- Materialized newest-first by the kill's own `at` timestamp, not insertion order, since a patched
  row's position in the map reflects when it arrived at this client, not when it happened.

## Consequences

- A live-combat notice at a heavily-farmed camp now transfers and re-parses however many kills/
  drops/coins actually landed in that ~500ms window — typically single digits — instead of the
  camp's entire lifetime history, and that cost no longer grows with how long the camp has been
  played.
- Correctness for every *bulk* mutation (admin edit, clear, log re-read/import, `setPlayer`'s own
  pet-kill cleanup) is unchanged: none of those touch `drainTouched()`, so they still signal a full
  reload the same way they always have.
- `useKills`'s return value is still a plain `KillRecord[]`, newest first, to every existing caller
  (`src/app/map/page.tsx`, `SpawnPanel.tsx`) — no consumer-facing shape change.
- `EqlApi.kills.onChanged`'s payload type became `(touchedIds?: string[]) => void`; its own doc
  comment previously said "live kills don't push this" — stale even before this ADR, since
  `killsChanged` has fired on every live kill/loot/coin since the ADR 0243-era coalescing was built.
  Corrected in the same edit.
