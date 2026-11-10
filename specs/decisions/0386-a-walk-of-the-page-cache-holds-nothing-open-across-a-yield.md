# 0386: A walk of the page cache holds nothing open across a yield

## Status

Accepted

## Context

The wiki page cache lives in the shared `eqlist.db` ([ADR 0232](./0232-a-ledger-that-outlives-its-cap-is-a-database.md),
[ADR 0256](./0256-the-wiki-page-cache-moves-onto-sqlite.md)), on the one connection every ledger uses. `each()` walks
every cached page and yields to the event loop every 100 so main is never blocked for long — but it did so with a row
iterator still open on its statement. While better-sqlite3 has an open iterator the **whole connection** is busy, and
it refuses anything that starts a transaction: "This database connection is busy executing a query".

Two things hit it. A second walk starting in the gap was fixed earlier by queueing walks. But the faction recheck
(`recheckDialogueCauses`, which opens a transaction) runs at startup straight after the catalogue warm, and on a copy
of a real ledger (28,812 faction hits) it threw an unhandled rejection and skipped its work for that launch; a cache
write landing in the gap was dropped as well ("cache write failed", logged and swallowed). It showed on some launches
and not others, by timing.

## Decision

- **A walk reads the table in key-ordered chunks and finishes each chunk before it yields**: `WHERE title > ?
  ORDER BY title LIMIT 100`, read with `.all()`. The position is the last title seen, not a cursor, so nothing is open
  on the connection while the event loop runs.
- **Walks still go one at a time.** They can no longer collide, but two interleaved walks would each parse the whole
  table for the same answer at twice the cost.
- **A page put or replaced mid-walk is seen once or not at all**: ahead of the position it is read with its new
  version, behind it it is not revisited. A walk was never a snapshot.

## Consequences

- No store sharing the connection can be refused by a walk in progress, whatever it does and whenever it runs.
- Any future code that yields while iterating on the shared connection has the same hazard; the rule is to read a
  bounded chunk with `.all()` and carry the position as a value.
- `kill-log.ts`'s `.iterate()` is synchronous to its `break`, never spanning a yield, so it is not affected.
