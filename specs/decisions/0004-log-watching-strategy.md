# 0004: Poll-and-tail log watching with a pure parser

## Status
Accepted

## Context
We must detect loot events in near-real-time from an EQ log that the game appends
to constantly and rotates per session. Filesystem `fs.watch` events are unreliable
across platforms and editors, and the reference EQBuddy uses offset-based tailing.
We also want the loot grammar to be verifiable without touching disk.

## Decision
Separate the concern in two:
- A **pure parser** (`src/shared/log-parser.ts`) that maps one line to a `LootEvent`
  or `null` — no I/O, fully unit-tested.
- A **watcher** (`electron/log-watcher.ts`) that polls every 500ms, reads only the
  bytes appended since the last offset, and is truncation-safe (resets when the
  file shrinks). In auto mode it follows the most-recently-written `eqlog_*.txt`.

Loot-to-list matching lives in the store, not the watcher, so the watcher stays a
dumb event source.

## Consequences
- Robust across sessions/rotations and cheap on large logs (incremental reads).
- The parser is a frozen black box: pin behavior once, change only deliberately.
- 500ms polling means up to ~half a second of latency — imperceptible for loot.
- Only loot lines are parsed today; other event types can be added to the parser
  without touching the watcher.
- Area spec: [log-watching](../log-watching/README.md).
