# 0186: The game clock runs forward from the last `/time` reading, at a fixed ratio

## Status

Superseded by 0187

The 20:1 pace, the day/night split, state-not-news recovery, and firing an alarm on a crossing
rather than a level all stand. Only the anchor-point choice below — starting the extrapolation at
the reported hour's *start* — turned out to be the wrong side of a tradeoff; see 0187.

## Context

A player wants to see the current time of day in Norrath, and to set an alarm against it — "tell me
at 8 PM game time." The only thing the log ever says about it is `/time`'s own response, verified
against a real line from a live client:

```
[Thu Sep 03 18:57:41 2026] Game Time: Monday, October 23, 3175 - 6 PM
[Thu Sep 03 18:57:41 2026] Earth Time: Thursday, September 03, 2026 18:57:41
```

That's an **hour, once** — no minute, and nothing resembling a stream. A useful clock has to move
between those readings on its own, which means picking something to extrapolate with: EverQuest's
day/night cycle runs at a fixed pace relative to real time (20 game-minutes per real minute, so a
24-hour game day is 72 real minutes), and follows a fixed 6 AM–6 PM day/night split. Both figures are
widely and consistently documented (`wiki.project1999.com/Time`, `eqlwiki.com/Time`) but neither is
*measured* by this app — there's no way to derive either from a single `/time` line, or to detect a
server that runs a different pace.

## Decision

**The ratio and the day/night split are constants (`src/shared/game-clock.ts`), not something read
off the log.** A `/time` line sets an anchor — the hour it stated, and the real moment it said so —
and the displayed clock is that anchor carried forward at the fixed pace (`advanceGameMinutes`),
recomputed fresh each time it's asked rather than storing a moving number. The same pure function
drives both the tracker's alarm sweep and a renderer's own 1Hz tick, so a window doesn't need to ask
main for the time every second just to move a clock face (mirroring `useSpawns`' "fetch on change,
tick locally" split for its countdowns).

Three more calls follow the app's existing rules for exactly this shape of problem, rather than
inventing new ones for a game clock:

- **A `/time` line is state, not news** (ADR 0043) — recovered from a log's tail at startup the same
  way the current zone and `/loc` are (`log-catchup.ts`), so the clock survives a restart without
  making the player retype `/time`. It carries across a zone change untouched, unlike a position.
- **An alarm fires on a crossing, not a level** (`crossedMinute`) — the sweep runs once a second
  (finer than a game-minute, which is 3 real seconds), and a level check would re-fire an 8 PM alarm
  every tick from 8:00 to 8:01.
- **An alarm never fires about a game day already passed while the app was shut** — the same "never
  alert about the past" rule `spawn-tracker.ts` applies to an overdue timer found at startup. The
  first sweep after a restart only records where the clock now stands; it doesn't compare against
  nothing and call every alarm between "unknown" and "now" a crossing.

An alarm is a standalone list (`GameTimeAlarm`, its own tracker and its own section in the Alerts
tab) rather than a new trigger shape on `CastWatch`: it matches nothing in the log, so it has no
spell, no conditions and no delay — a time and a message. It pops through the same `raise` path as
every other alert, wearing the alert defaults, with no per-alarm style picker (the same call ADR 0092
makes for a spawn timer's pop).

## Consequences

The clock is only as accurate as the constants it's built on: a server running a different day-length
or day/night split (a custom ruleset, a GM-adjusted world) would read wrong. Checked against a real
evening's log from a live client after the fact (several `/time` pairs spread minutes to hours apart,
cross-referencing the stated hours against the real elapsed time between them): the 20:1 pace holds up
to within the precision a truncated-hour reading allows. `noteReading` also logs, at debug level, what
the running clock had *guessed* right before each fresh `/time` line arrives against what that line
actually says (`offByGameMinutes`) — the standing way to catch a pace or split that's actually wrong
on a given server, without waiting on someone to notice the display feels off.

`/time` truncates to the hour rather than rounding, and the anchor takes that at face value — "6 PM"
sets the clock to 18:00 exactly, not to 18:00–18:59's midpoint. That's a **deliberate, known bias**:
right after a reading the clock runs up to 59 minutes behind the true game time, tapering only when
`/time` is run again, rather than centered on zero average error. The alternative — anchoring at the
hour's midpoint — trades that for a different kind of "off": the display would jump ahead of what the
log just said the moment the reading landed, which reads as the app second-guessing the player's own
`/time`. Matching what `/time` just reported, and drifting low until the next one, was judged the more
legible failure mode of the two — worth revisiting if the debug comparison shows the lag is large
enough to bother people in practice.

The clock also only ever answers "what time is it", not "what day, month or year" — `parseGameTime`
reads past the calendar half of the line on purpose. A player who wants the in-game date gets nothing
from this feature; time of day was the whole ask.
