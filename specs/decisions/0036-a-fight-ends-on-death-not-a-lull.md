# 0036: A fight ends on a death, not on a lull

## Status

Accepted

## Context

The damage meter ([ADR 0014](./0014-damage-meter-from-the-log.md)) split combat into *fights* with a
single rule: 10 seconds with no swing ended the current fight and the next swing started a fresh one.
That rule assumed a lull means combat is over. In this game it usually doesn't. Mobs chase until they
(or you) are dead — a gap in the log is far more often lag, kiting, a repositioning run, or a mana
pause than a fight that ended. So a real, still-ongoing fight kept getting chopped into pieces: the
live "This fight" totals reset mid-fight, and one kill got filed to history as several.

The 10-second gap was doing double duty: it also defined *active time* — the seconds DPS divides by,
which must exclude downtime so a lull can't deflate the rate. Those are different questions and only
one of them wanted changing.

## Decision

**Decouple active-time from fight-end, and end a fight on death rather than silence.**

- **Active time** keeps the tight rule: any gap over `ACTIVE_GAP_MS` (10s) is downtime, excluded from
  the seconds DPS divides by. Unchanged, so tolerating a lull never inflates the denominator.
- **A fight only ends promptly once it's *resolved*** — the most recent thing to happen was a death,
  a mob's or yours (`lastKillAt`/`lastDeathAt` at or after the last swing). Then `SETTLED_END_MS`
  (10s) of quiet closes it, so the next pull is its own fight.
- **While it's unresolved** — nothing dead yet, the enemy presumably still up and chasing — it takes
  `ENGAGED_END_MS` (60s) of *total* silence to end. A kite with long pauses, or a stretch where the
  log lagged, stays one fight.

"Resolved" is read straight off the log: the killing blow's damage line is immediately followed by
the "slain" line, so after the last mob dies `lastKillAt >= lastCombatAt`; while survivors are still
being hit, damage keeps `lastCombatAt` ahead and the fight stays open. No target list to maintain.

## Consequences

A laggy or kite-heavy fight now reads as one fight, and its live totals survive the pauses — the
behaviour the meter is for. Back-to-back pulls with a gap under a minute *and no kill between* will
merge into one fight; that only happens when the log shows an unbroken engagement, which is exactly
the case we want merged. The moment something dies, the boundary snaps back to tight.

DPS is untouched — active time still excludes every gap over 10s, so a tolerated lull lowers neither
the damage nor the rate, only where the fight boundary falls. The 60s figure is a heuristic, not a
setting; if real play wants it tunable it can move into Settings without changing the model.
