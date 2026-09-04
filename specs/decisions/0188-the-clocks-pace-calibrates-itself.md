# 0188: The clock's pace calibrates itself, live, from consecutive readings

## Status

Accepted

## Context

[0187](./0187-the-clock-anchors-on-the-hours-midpoint.md) fixed a real, evidenced lag by anchoring
each `/time` reading at the reported hour's midpoint instead of its start. It left the *pace* — 20
game-minutes per real-minute — as a hardcoded constant, checked against one player's log and found
close (20.02:1 over the most reliable sample available). That's still only ever one server's evidence
for a figure every other install inherits verbatim. A fan server can run its own pace, and nothing
before this would ever find out: the debug comparison added alongside 0187 (`offByGameMinutes`) could
*show* a guess drifting from what `/time` reported, but did nothing with what it saw.

The ask this answers is direct: use that same overshoot/undershoot, live, to make the next guess
better — rather than a number a person has to read out of a debug log and a constant someone has to
hand-edit in response.

## Decision

**The tracker persists a learned pace (`rate`, game-minutes per real-ms) alongside the anchor, and
nudges it toward what each fresh pair of `/time` readings implies.** `game-clock.ts` gains:

- `impliedRate(priorRate, prevHour, nextHour, elapsedRealMs)` — the pace that pair of readings
  implies on its own, given the pace already trusted going in. `/time` only ever states the *hour*,
  never the date, so a gap wide enough to have rolled a game day over can't be told apart from a
  shorter one by the hour alone; `priorRate` resolves that by picking whichever whole number of
  game-days, stacked on the bare hour-of-day difference, lands closest to what the prior pace already
  predicted for the elapsed real time. Refuses to answer (`null`) for a gap under 5 real seconds (pure
  truncation noise — the hour's own ±59-minute uncertainty swamps anything shorter) or over a real
  hour (more likely two different sittings than one coherent stretch to learn from), and never reads
  an apparently-backwards clock as a rate.
- `learnRate(priorRate, prevHour, nextHour, elapsedRealMs)` — blends `impliedRate`'s answer into the
  prior, weighted by how much real time separated the two readings (a few seconds barely moves it; the
  longest trusted gap can pull it halfway there) and clamped to a quarter–4× the documented default so
  no single reading, however strange, can send the pace somewhere absurd.

`game-clock-tracker.ts` calls `learnRate` every time `noteReading` has a prior anchor to compare
against, stores the result, and uses it (not the hardcoded default) everywhere it extrapolates —
the sweep, `view()`, and the next comparison. `GameClockView.rate` carries the learned pace to the
renderer, so the status bar's own 1-Hz tick (`useGameClock`) advances the clock at the same pace the
tracker just calibrated, rather than a stale default that would visibly disagree with it.

The debug log gains the other half of what it was already saying: alongside `offByGameMinutes`, a
`learnedRatePerMinute` field whenever a reading actually moved it, `{ from, to }` in the familiar
per-real-minute units.

## Consequences

A fresh install still starts at the documented 20:1 guess — there is nothing to learn from before a
second `/time` reading exists — and converges toward whatever this particular server actually runs
over a session or two of ordinary play, no server-specific configuration required. The weighting means
a run of short, noisy readings (someone spamming `/time`) barely moves anything, while a handful of
readings spread a few minutes apart pull it toward the truth reasonably quickly; the bound means a
freak sample, or a corrupted stored value, can't run away to something the clock could never sanely
be.

The tradeoff is the same one 0186 already accepted for the pace itself: this is evidence-driven
correction, not a promise of exactness. Two readings close enough together to be misread — a very
fast server crossed with an unlucky short gap — could still nudge the pace briefly wrong; the debug
comparison is what would catch that in the log if it ever visibly matters, the same way it caught the
midpoint bug this whole chain of fixes started from.
