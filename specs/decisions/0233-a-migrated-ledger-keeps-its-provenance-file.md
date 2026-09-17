# 0233: A migrated ledger keeps its provenance file

## Status

Accepted

## Context

[ADR 0232](./0232-a-ledger-that-outlives-its-cap-is-a-database.md) says each ledger's legacy JSON
file is "renamed to `.bak`" once its data is folded into SQLite. That turned out to be wrong for
`faction-log.json`, `loot-log.json`, `kill-log.json` and `combat-history.json` specifically —
renaming (or deleting) any of the four breaks a real, already-shipped feature that has nothing to do
with how the ledger stores its own rows.

`src/shared/data-provenance.ts`'s `DATA_CONCERNS` registers all four of these ledgers as concerns
whose staleness is checked by reading their JSON file's `provenance` field **directly off disk**
(`electron/data-health.ts`'s `readStamp`), independent of the store's own code. That stamp is what
`log-reread.ts`'s unattended re-read ([ADR 0129](./0129-a-release-can-ask-for-a-re-read.md)) and the
Settings panel's data-health report both key off. Once a ledger's file is renamed away, `readStamp`
finds nothing, `dataState` reports `"absent"` — "nothing has been recorded yet, not a problem" — and
the concern silently stops being checked, forever. For a store with `unattended: true` (all four),
that's not a cosmetic wrong status row: it means a genuinely stale kill/loot/faction/fight history,
migrated from a build whose parsing rules have since moved on, would never get the automatic re-read
ADR 0129 promises. This was already shipped for `faction-log.ts`, `loot-log.ts` and `kill-log.ts`
before it was caught, while writing `combat-history.ts`'s own migration — fixed here for all four at
once rather than leaving three of them broken.

## Decision

**The legacy JSON file is never renamed or deleted. It goes on existing, forever, as a
provenance-only stub** — the ledger's own rows move to SQLite exactly as ADR 0232 describes, but the
file keeps its original name and keeps being written to, now carrying nothing but
`{"provenance": {...}}`. Each store's own `createSaver`/`writeJson` (from `json-store.ts`) is kept for
exactly this — a stub write is a handful of bytes, not the full array `json-store.ts` used to hold, so
the debounce that used to coalesce a burst of fights or hits into one write now coalesces a burst of
stamp updates instead. `flush()` still forces it out at the same moments (quitting, right after a
re-read finishes) for the same reason: the stamp has to be on disk before anything reads it again.

**Migration carries the legacy stamp forward verbatim, rather than stamping at the current
revision.** Moving storage engines doesn't re-derive anything through today's parsing rules — a file
that was stale before migrating (an older build's figures) is exactly as stale immediately after, and
saying otherwise would swallow a re-read that was still owed. A legacy file with no `provenance` at
all (older than stamping itself) gets a fresh stamp at the current revision, the same as a first-ever
write from any of these stores always has.

**The migration-has-already-run guard changed from "does the file exist" to "does the file still
carry its data array."** A stub has no `fights`/`kills`/`loot`/`hits` array at all, so a second
construction reading a stub takes the early return and touches nothing — same idempotency ADR 0232
already wanted, just keyed off the array's presence instead of the file's.

**`migrations.ts`'s own `schema` field (`kill-log.json` specifically) is not specially preserved.**
`fillMissingKillZones` treats a stub (no `kills` array) as nothing left to repair, and re-stamps its
own field independently on the next launch if it finds it missing — harmless, since neither this
store nor that one depends on the other's field surviving the other's write.

## Consequences

- `faction-log.ts`, `loot-log.ts`, `kill-log.ts` and `combat-history.ts` all keep their original
  `<name>.json` file forever, now a few dozen bytes each instead of however large the ledger had
  grown — a real, if minor, footprint change worth knowing about if `userData` is ever audited by
  hand.
- ADR 0232's own text ("renamed to `.bak`") is now inaccurate for all four stores it describes; this
  record is the correction, per the "supersede, don't edit an Accepted decision" rule — 0232 is not
  edited, and a reader following its `.bak` claim should be pointed here instead.
- Any *future* ledger migrated onto this shared SQLite foundation needs to check whether it is also a
  registered `DataConcern` before assuming a legacy file can simply be renamed away — this is now the
  pattern to follow, not a one-off fix.
- `electron/tests/faction-log.test.ts`, `loot-log.test.ts`, `kill-log.test.ts` and
  `combat-history.test.ts` each pin the stub behavior directly (the file survives, carries the legacy
  stamp verbatim, and a second construction doesn't re-migrate from it).
