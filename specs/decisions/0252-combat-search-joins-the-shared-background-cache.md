# 0252: Combat search joins the shared background cache

## Status

Accepted

## Context

[ADR 0247](./0247-a-background-cache-any-sql-derived-value-can-share.md) generalized ADR 0246's
worker-backed cache and moved every full-table-scan-plus-JSON-parse read it found onto it:
`kill-log.ts`'s `observations()`, `combat-history.ts`'s `zones()`/`bests()`/`sessions()` (bundled
into one `computeCombatReports`), and `loot-log.ts`'s `prices()`. `combat-history.ts`'s `search()`
did the identical thing — `SELECT * FROM combat_fights`, `JSON.parse` every fight's full
`statsJson` (every combatant, spell, damage cell, per-second sample), recompute its label, filter,
sort — synchronously on Electron's shared main thread. It wasn't in the pass that led to 0247: that
ADR's "pass over the other stores" identified `zones()`/`bests()`/`sessions()` and `prices()`
specifically and didn't separately name `search()`, not because it was considered and set aside.

It matters here for a reason the other three didn't have: `DamageHistory.tsx` calls `search()` on
**every keystroke**, with no debounce (by design — a debounce would let a stale, in-flight answer
land after a newer one, which the component's own comment already rules out as worse). A full scan
of an uncapped table (ADR 0243) on every keystroke, on the one thread every window's IPC shares, is
exactly the shape 0247 fixed three times over.

## Decision

**`search()` now reads `reportsCache`'s own `searchIndex` instead of running its own scan.**
`combat-history-reports.ts`'s `computeCombatReports` already builds a `fights` array (parsed once)
to fold into `zones`/`bests`/`sessions`; it now also keeps that array, each fight's `label`
recomputed via `labelFor` (reusing the exact value already computed for `bests`' own key, not a
second call) rather than trusted from the stored column, sorted newest-first — the same freshness
and order `search()`'s old `labelled()`/`byNewest` gave it. `CombatReports` gains a `searchIndex:
StoredFight[]` field; `combat-history.ts`'s `search(term, limit)` becomes a plain
`.filter(fightMatches).slice(0, limit)` over `reportsCache.get().searchIndex`. No new cache, no new
worker, no IPC or renderer change — `search`'s signature and `FightSearch` return shape are
unchanged, and `rederive()`/`add()` already call `reportsCache.markChanged()` on every mutation, so
`search()` picks up the same "synchronous, always correct, refreshing in the background" contract
`background-cache.ts` already documents for its other three callers.

## Consequences

- A keystroke in the History search box no longer scans or JSON-parses the whole `combat_fights`
  table on the main thread — it's a synchronous in-memory filter over an already-parsed array,
  the same cost class `zones()`/`bests()`/`sessions()` already pay.
- **A fight added or re-derived a moment ago may not be searchable until the background recompute
  lands.** This is not a new risk: it's the exact contract `zones()`/`bests()`/`sessions()` have
  operated under since 0247 (`get()`'s "trusts its cache only while confirmed to reflect the latest
  `markChanged()`, recomputing right there otherwise"), now extended to `search()` too.
- `combat-history.ts`'s own `selectAll`/`labelled`/`byNewest` are untouched and still back
  `rederive()`, `fights(sessionId)`, `sources()`, and the admin panel's `list()` — this ADR narrows
  only `search()`.
