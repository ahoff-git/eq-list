# 0021: Stored fights keep a pointer back to their source lines

## Status
Accepted

## Context
A stored fight keeps *conclusions* — 597 damage, 74.8 damage per second of casting, these
rows. It does not keep the lines those came from.

That has already bitten twice in the space of one session. The damage-per-second-of-casting
formula was wrong on its first pass (it inflated any spell whose casts were mostly untimed),
and per-invocation splitting turned out to be necessary
([ADR 0020](./0020-split-by-stance-and-invocation.md)). Both changed how a fight *should*
read — and every fight already on disk kept the old answer, permanently, because its inputs
were gone.

Events carry a `logId` now ([ADR 0019](./0019-parse-once-and-one-tracker.md)), so a fight
can cheaply record which lines it was built from. But `logId` counts lines *within one run
of the app* — after a restart, or a log rotation, the number means nothing on its own.

## Decision
Stamp each stored fight with enough to find its source lines again, and build nothing else
yet:

- `FightStats.logIds` — the `{ from, to }` line span the window was built from. Useful
  within the run that produced it.
- `StoredFight.logFile` — the log file it was read from, which is what makes the reference
  durable across restarts.
- The fight's `startedAt`/`endedAt` are already **the log's own timestamps**, so file +
  timestamp range is the robust locator; the line span is the fast path when the run is
  still the same one.

**No replay is implemented.** This is deliberately just the pointer: a few bytes per fight,
recorded now because it can only be added going forward — a fight filed today without it can
never gain it. Re-deriving stored fights is worth building when a formula change actually
makes it worth it, and by then the data will be there.

Rejected alternatives:
- **Storing the raw lines with each fight.** Complete, and turns a 70KB history file into a
  multi-megabyte one that duplicates a file already on disk.
- **`logId` alone.** Free, and meaningless after a restart — which is exactly when you'd
  want it.
- **Nothing at all** (treat stored fights as immutable snapshots of what the app said). A
  defensible position, but the cost of keeping the option open is close to zero.

## Consequences
- A future "recompute history" pass has what it needs: which file, which timestamp range,
  and (within a run) which lines.
- Fights already on disk have no pointer. Any replay feature has to treat that as normal and
  leave them as snapshots.
- The reference is only as stable as the log file. If it's deleted, rotated away or renamed,
  the fight stays a snapshot — which is the honest failure mode, and why the conclusions are
  still stored rather than derived on demand.
