# 0356: The spawn board learns from the whole kill history

## Status

Accepted

## Context

The spawn board proves a mob is a named from any kill of it, and learns a respawn from the gaps
between kills ([ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md)). It reads those
from the kill log, and it used to read all of them: the log held at most 5,000 records, in memory.

[ADR 0243](./0243-remove-the-remaining-storage-caps.md) took the cap off and moved the log to SQLite,
and gave an unscoped `kills()` a `DEFAULT_LIMIT` window of 200, because "the one unscoped caller" was
the Spawn panel's list of recent camps. The tracker was a second unscoped caller
(`kills: () => killLog.kills()`), so it went from reading up to 5,000 kills to reading 200. A camp
dropped off the board once you had killed about 200 things since, however well it had been learned.

Replaying one install's real kill log (11,232 kills) through the tracker showed how much that cost:
**17 camps** on the board with the window, **145** with the whole history.

Reading everything per call is not the answer either. A full `SELECT *` mapped to records took about
100 ms at that size (the query is 17 ms; most of the rest is parsing each row's drops), and the board
reads on every kill, a replayed evening is thousands of kills
([ADR 0138](./0138-a-replayed-log-narrows-what-a-kill-proves.md)), and a cache keyed on
`killLog.version()` would not help: that counter moves on every loot and coin line, and on every kill
during a replay.

## Decision

**`KillLog.evidence()` returns every kill ever recorded, newest first, as lean records, and the spawn
tracker reads it instead of `kills()`.**

- Lean means the eleven columns that say who died, who killed it, where and when (`EVIDENCE_COLUMNS` in
  `kill-observations.ts`), read through the same `rowToRecord` as every other read. No position, drops
  or coin.
- It is held in memory. The first ask loads it from the table; `record()` appends by reading the stored
  row back, so the mirror holds exactly what a rebuild would; loot and coin lines change no evidence
  column and leave it alone. Anything that edits or removes a row (an admin edit or removal, `clear()`,
  `setPlayer()` dropping your own deaths) drops the mirror to be rebuilt on the next ask.
- Each call returns a fresh array, so a caller that sorts or trims it cannot corrupt the next read.
- `kills()` is unchanged: the recent window is right for a display.

## Consequences

- The board is whole again: 17 → 145 camps on the install that found it. `provenNamed` sees the whole
  history too, so a named is recognised from a kill of any age.
- Asking costs a copy of an array (about 0.02 ms at 11k kills). The first load is about 13 ms. A
  `noteKill` averages 1.3 ms and a `view()` 3 ms, so catching up on a long log is no slower than it was
  under the cap.
- The mirror grows with the log: about 450 bytes a kill, 5 MB at 11k. A hundred thousand kills would
  hold about 45 MB. If that ever matters, the place to narrow is the record shape the mirror holds.
- A new writer of `kill_records` has to call `forgetEvidence()` (or append), or the board will read a
  stale mirror. Today there are four, all in `kill-log.ts`; the startup repairs in `migrations.ts` run
  before the mirror can be loaded.
- Other readers that need the history rather than a display window should ask `evidence()` too, rather
  than reading `kills()` and inheriting a cap nobody chose for them.
