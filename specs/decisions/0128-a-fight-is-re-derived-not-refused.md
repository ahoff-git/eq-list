# 0128: A fight is re-derived, not refused

## Status
Accepted

## Context
This is the gate [ADR 0127](./0127-an-unknown-name-is-held-not-dropped.md) named, and it was already
owed twice over before that.

`data-provenance.ts` has always declared the `combat-history` concern with `remedy: "re-eat"` —
"Read your logs again. The app can do this itself (Settings → digest a log)." So when
[ADR 0095](./0095-your-own-dot-tick-is-yours.md) made your own DoT ticks readable and every stored
fight went low, the app flagged the store stale and told you what to do about it. **And doing it
changed nothing**, because `CombatHistory.add` refused every fight it already had a key for. A
declared remedy that is a no-op is worse than no remedy: it looks like the data has been checked.

The refusal came from applying [ADR 0033](./0033-eating-a-log-is-idempotent.md) to fights *by
analogy*, and the analogy is where it went wrong. 0033 is about **kills and drops**, and it is right
about them: a kill is a **count**, a drop rate is a numerator over a denominator, and reading one
line twice corrupts both — so the second reading must be dropped on sight. A fight is not a count.
It is a **derived summary** of lines that are still sitting in the file, and the whole reason
[ADR 0021](./0021-stored-fights-keep-their-source.md) put its source on it was so a better parser
could redo it. Same keying, opposite correct behaviour.

One thing ADR 0021 got wrong, worth recording because it misdirects: it nominated **`logIds`** as the
way back to the source, and `logIds` cannot do the job. The watcher's line counter restarts every
run, so a stored range means nothing to a later one — `StoredFight.logFile`'s own doc says as much.
The durable handle is the **file plus the log's own timestamps**, which is what this uses. `logIds`
stays useful for pointing a person at a line within one run, and is now at least correct after
[ADR 0126](./0126-a-fight-is-filed-when-it-ends.md).

## Decision
**Eating a log re-derives the fights it already holds from that file, instead of skipping them as
duplicates.** The key stays the fight's identity; what changes is that the figures under it are
replaced rather than left alone.

Two things that had to be settled with it:

- **A stored fight whose source is gone is kept and says so** (`StoredFight.unsourced`), never dropped.
- **Idempotent means *converges*, not *ignores*.** Reading the same file twice refreshes the same
  fights to the same figures; it does not decline to look.

## Consequences
- **`CombatHistory.rederive(logFile, derived, covers)`.** `covers` is the span the file accounts for
  in epoch ms, first parsed event to last. Inside it the replay is **authoritative**: a stored fight
  from that log is replaced by whatever the new pass produced there. That has to include boundaries,
  because a rule which makes a new line *readable* moves them — ADR 0095's DoT ticks were previously
  not events at all, so they did not mark the window they landed in. Matching on the exact key alone
  would leave a phantom behind every merge.
- **The importer hands over the whole file at once**, rather than filing fight by fight. Which stored
  fight a derived one answers to is only knowable over the set, for the same reason.
- **The filing survives; only the figures are re-derived.** A refreshed fight keeps its id, its
  sitting and the zone it was filed under. Otherwise correcting a number would reshuffle the History
  tab as a side effect — and re-deriving would re-file a whole evening under `file:` sittings, where
  the live path had `run:` ones, splitting one evening's list in two. A fight the replay finds that
  nothing was stored for inherits the sitting of its nearest stored neighbour in the same log, unless
  the log's own login line settles it (`loginSession` is shared with the live path, so anything behind
  a login agrees by construction).
- **Times are compared in epoch ms, not as strings.** `FightStats.startedAt` is a UTC ISO with a `Z`;
  a log line's `at` is a naive local stamp. They sort against each other meaninglessly, and this is
  the second place in this work where those two shapes met.
- **Counts are measured after the cap** (`RederiveOutcome.trimmed`). The history keeps 1,000 fights,
  and the measured log holds 1,435 — so without this every re-reading claimed to file 435 fights
  that were dropped again in the same breath.
- **A fight the file can no longer cover is flagged, not deleted** — the log was rotated or truncated
  under it. It happened, and its figures are simply frozen; the History tab shows a ⚑ saying so, and
  the flag clears the moment the source is read again. Coverage from first-to-last *parsed event* is
  safe rather than tight: a fight needs damage, and damage is an event, so the span strictly contains
  every fight the file could produce.
- **Measured, end to end, on the real 315,601-line log**: pass one files 1,000 fights (433 trimmed);
  pass two, with every pet's identity known — ADR 0127's case — reports **1,000 refreshed, 0 added**
  and puts **3,906 damage** into fights that had already been filed, with the 22 sittings untouched; a
  third pass with the same input reports exactly what the second did and changes no figure. That is
  the convergence the word "idempotent" should have meant here all along.
- **Not automatic — for one release.** It ran from the button that already existed, on the grounds
  that reading a 26 MB log is the startup budget problem [todo.md](../todo.md) names. Measured, that
  pass is **1.4 seconds**, which is not a launch-path cost so much as a thing to keep off the launch
  path — so [ADR 0129](./0129-a-release-can-ask-for-a-re-read.md) took the trigger over: a release
  bumps the revision, and the next start does the re-reading after the window has painted.
- **A lowered figure leaves an old record standing.** The import path calls `scores.absorb` afterwards
  and `beats()` only takes a strictly greater value, by design — so re-deriving *raises* a personal
  best that was too low (the ADR 0095 case, which is the one that matters) and cannot pull one back
  down. Honest, and stated here rather than discovered later: rebuilding the board instead would have
  to reconcile records set from live play, which no stored fight can vouch for.
