# 0380: Alarms the clock passed while the machine slept are history, not news

## Status

Accepted

## Context

A game-time alarm fires when the Norrath clock *crosses* its minute between two sweeps (`crossedMinute`),
which makes sense when sweeps are a second apart. The tracker's own rule is that it never alerts about the
past: an alarm restored at launch does not speak about the game day that went by while the app was shut
([ADR 0092](./0092-a-named-s-respawn-is-learned-from-your-own-kills.md)'s rule, applied to the clock).

A sleeping machine broke it. Timers stand still during sleep and the clock does not, so the first sweep after
waking finds the game clock hours further on and "crosses" whatever the jump happens to land past. With the
tracker's own injectable clock: after a three-hour sleep an 8 PM alarm fired but a 3 AM one did not, though the
clock passed both; after a night's sleep the noon and 6 PM alarms fired. A banner on waking that says "It's
8:00 PM in Norrath" is news about nothing, and which alarms spoke was an accident of arithmetic.

## Decision

- **A sweep that arrives more than 30 seconds after the previous one is a gap, not a tick.** The clock is
  resynchronised to where it now stands and nothing fires for what it crossed on the way. Thirty seconds is ten
  game minutes: a stall that short (a busy main process) still delivers an alarm a moment late, a sleep never
  does.
- **The previous sweep's time is kept even while there is no reading**, so an hour of sweeps before the first
  `/time` does not make the first sweep after it look like the end of a long gap.

## Consequences

- The same measurements, run again: every post-sleep case is quiet, and an alarm set after waking fires as
  usual at its own moment.
- An alarm crossed inside a stall longer than thirty seconds is lost rather than late. That is the sleep case;
  nothing else stops the sweep that long.
- Spawn timers already handle this by their own states (a timer more than 30 minutes overdue goes stale and is
  silent). A goal that ran out while the machine slept still gets its expiry banner on waking; whether that is
  news is a different question and is not decided here.
