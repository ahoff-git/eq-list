# 0187: The clock anchors on the reported hour's midpoint, not its start

## Status

Accepted

## Context

[0186](./0186-the-game-clock-runs-forward-from-the-last-time-reading.md) anchored the running clock
at the *start* of whatever hour `/time` reported — "6 PM" set the clock to 18:00 exactly — reasoning
that matching what `/time` just said felt more trustworthy than a clock that silently jumped ahead of
the player's own reading. That was a guess, not a measurement, and a fuller evening's log (sixteen
`/time` calls, several read back after the player noticed the clock felt off) settles it the other
way.

Two things the fuller log shows:

1. **The 20:1 pace holds almost exactly.** The most reliable check available in it — two readings 17
   game-days apart by date, where the truncated-hour uncertainty (±1 hour) is a rounding error
   against the 410-hour total — gives **20.02 game-minutes per real-minute**. The pace in
   `game-clock.ts` was never the problem.
2. **The start-of-hour anchor's worst case is real, not theoretical.** Four `/time` calls typed in
   quick succession show the hour rolling from 8 AM to 9 AM in **15 real seconds** — nowhere near the
   ~180 seconds one game-hour takes at the confirmed pace. That's not the pace breaking; it means the
   8 AM reading was taken with the true game time already at roughly 8:56–8:59, and the old anchor
   started the clock at 8:00 regardless of that — a lag of about 57 minutes, squarely inside the range
   0186 already knew was *possible* ("up to 59 minutes") but had never been caught actually
   happening until `game-clock-tracker.ts`'s debug comparison (`offByGameMinutes`, added after the
   first report that the clock felt off) wrote it down.

A lag that large, appearing right after the reading a player just took, is exactly what "the clock
feels off" was describing.

## Decision

**Anchor the running clock at the reported hour's midpoint, not its start.** `currentGameMinutes`
now starts extrapolating from `anchor.hour * 60 + 30` instead of `anchor.hour * 60`. `/time` narrows
the true moment to a 60-minute window and nothing narrows it further, so the midpoint is the estimate
that minimizes expected error: it turns a *guaranteed* lag of up to 59 minutes into an error of at
most 30 minutes **in either direction**, with an average error of zero instead of a standing −30.

The cost 0186 weighed against this — the displayed clock now visibly disagrees with the hour a player
just read in their own log, the instant after typing `/time` — is real but smaller (at most half an
hour, symmetric) than the failure it replaces (up to a full hour, always in the same direction, and
most visible at the exact moment a player is looking closest).

Nothing else about 0186 moves — see its `## Status` for what still stands.

## Consequences

The status bar's reading no longer exactly matches the hour just typed into `/time` — "6 PM" now
starts the display at "6:30 PM" rather than "6:00 PM". Anyone comparing the two side by side should
expect that half-hour jump and read it as the app's best estimate of the true moment, not a repeat of
the literal log line. The debug comparison (`offByGameMinutes`) is unchanged and still the way to
tell whether a guess is wrong for a given server: a small swing either side of zero is this estimate
working as intended, where a large or one-sided run of numbers is worth a second look.
