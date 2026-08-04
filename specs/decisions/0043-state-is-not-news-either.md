# 0043: Where you are is state, not news — recover it, replay nothing

## Status

Accepted

## Context

[ADR 0030](./0030-history-is-not-news.md) settled that a log line which already happened is history:
the watcher pins every log already on disk at its current length and follows only what gets written
afterwards. That fixed 120 phantom kills, re-counted experience and hours-late cast alerts.

It also meant starting the app mid-session left it not knowing **where the player was**. A fresh
start — launch the app, then log in — learns the zone from the "You have entered …" line and the
position from the next `/loc`. Start it while already playing and the app has neither: the map has no
zone to draw, kills can't be placed against a position fix, and every panel scoped to "here" is
empty. Nothing changes until the player happens to zone, which in a long camp can be hours. Two
identical installs, two different states, decided by launch order.

The events in a log and the state a log describes are not the same thing. A kill line means
*something happened* — replaying it makes a claim about now that is false. A zone line means
*this is where you are* — and that claim is still true.

## Decision

**Recover the two lines that carry state; replay nothing else.** `catchUpState`
(`src/shared/log-catchup.ts`) reads a log's tail and returns at most a zone and a position. Kills,
loot, experience, casts and level-ups are not recoverable state and are not emitted, so ADR 0030
holds unchanged for everything that fires an alert or records a number.

**A zone line clears any position read before it.** A `/loc` from the zone you left would be plotted
on the map of the zone you're in — a confidently wrong dot, which is worse than no dot. A position
with no zone line before it is kept: no zoning happened within the tail, so it fixes where you
already are.

**Recovered lines keep their own timestamps.** A position that is six hours old must arrive six hours
old, because a kill placed against a fix is scored on how stale that fix is, and `matchCast`'s
freshness guard depends on timestamps meaning what they say.

**Catch-up runs exactly where a log is about to be skipped**, and the caller says so rather than the
watcher inferring it: on `start`, and when following a log that already existed (switching to a
character who was logged in before the app was). A log that genuinely appeared is read from the top
anyway, so it gets no catch-up and reports its zone once.

**The tail grows until a zone line turns up** — 64KB, 512KB, then 4MB — because a long camp pushes
the zoning arbitrarily far behind the recent combat, and finding it is the entire point.

## Consequences

Main already held `currentZone`/`currentLoc` and served them over `zone:get`/`loc:get`, and the
renderer already asked on mount, so recovery needed no new plumbing: a window opened later sees the
recovered state like any other. The one ordering requirement is that `startWatcher()` runs after the
`onZone`/`onLoc` subscriptions — catch-up emits synchronously — which `electron/main.ts` does.

Against a real 4.9MB log this recovers `Blackburrow 2 (Adaptive)` and the last `/loc`, with **zero**
other events emitted.

Two positions are now indistinguishable to everything downstream: one typed a second ago and one
recovered from hours back. Both carry honest timestamps, so a consumer that cares can tell — but
consumers that don't will draw an old dot as though it were current. That is the trade this makes
deliberately: a stale-but-labelled position beats no position, since the player's own map shows them
roughly where they are anyway.

Worth naming the seam: `catchUpState` is the *only* place that decides what counts as state. Adding
a third such line (a `/who`-style level line, say) is an edit to one pure tested function, and
anything added there starts being replayed at every startup — which is the check to apply.
