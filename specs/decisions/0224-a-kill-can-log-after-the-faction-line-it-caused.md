# 0224: A kill can log after the faction line it caused

## Status

Accepted

## Context

ADR 0219 built the kill-proximity guess as **backward-looking only**: a faction line is blamed on the
most recent kill noted *before* it, within `CORRELATION_WINDOW_SEC`. That ADR's own "Consequences"
section asked for exactly this follow-up: "the first real log that shows an actual kill-to-faction-hit
gap should replace it, tighten it, or falsify the whole proximity assumption."

The user reported that too many Hits-tab rows showed no likely cause at all. Rather than guess at a
fix, this was checked against the same player's real, live data — `faction-log.json` and
`kill-log.json` from `%APPDATA%/eq-list`, cross-referenced against the actual 52 MB `eqlog_*.txt` —
the same "diagnose against live userdata" discipline this project already uses for bug reports.

The finding: of 1079 raise/lower hits the ledger had no cause for, **896 (83%) had one of the player's
own kills landing at the same logged second or up to a few seconds after the hit** — not before. The
window itself being too tight explained only 10; a genuine absence of any nearby kill (presumably a
turn-in the dialogue signal should be catching, a separate question) explained 173. Reading the raw
log around several of the 896 confirmed why, and it is not an occasional quirk:

```
[21:16:25] Your faction standing with Frogloks of Guk has been adjusted by -5.
[21:16:25] You gain party experience! (0.666%)
[21:16:25] You receive 7 gold, 8 silver and 1 copper from the corpse.
[21:16:25] You hit a froglok priest for 32 points of magic damage by Lightning Bolt.
[21:16:25] A froglok priest's body spasms as the lightning bolt arcs through them.
[21:16:25] You have slain a froglok priest!
```

This server reliably logs a kill's faction/XP/coin consequences **before** its own "You have slain X!"
confirmation and even before the finishing blow's own damage line. `faction-cause.ts` only ever
checked backward, so for a fast kill cadence (the common case — grinding a repeatable faction
target) it missed the clear majority of real kills for no better reason than which text this server
happens to flush to the log first.

A second, unrelated finding from the same survey: floor/ceiling hits ("could not possibly get any
worse/better") account for 2138 of 3174 uncaused hits, arriving in bursts of the *same five factions*
every five seconds for long stretches — a periodic status effect or proximity aura re-stating a
standing, not a reaction to a discrete action. No timing model should expect to explain these, and
this ADR does not attempt to; it is recorded here so the next person investigating cause coverage
doesn't re-derive it.

## Decision

- **`faction-cause.ts`'s kill check is now symmetric.** `guess()` compares `Math.abs(at - lastKill.at)`
  against `CORRELATION_WINDOW_SEC` instead of requiring the kill to be strictly before the hit.
  `FactionCause`'s `gapSec` (kill variant) reports how far apart the two lines are, not which one came
  first — the log's own order here is an artifact of this server's output flushing, not a fact worth
  asserting to the reader. The dialogue signal is **unchanged** (still backward-only): nothing in this
  survey showed the same reversal for a turn-in's dialogue, where the NPC's line necessarily precedes
  the transaction it describes.
- **Both callers now hold a faction event for `CORRELATION_WINDOW_SEC` before resolving it**, so a
  kill that logs a moment later has actually been noted by the time the guess is made:
  - `main.ts`: `watcher.onFaction` pushes the raw event into a `pendingFaction` map and schedules its
    resolution `CORRELATION_WINDOW_SEC` later via `setTimeout`, rather than resolving on the spot. A
    live hit now appears on the Hits tab up to 3 seconds later than it used to — an accepted,
    deliberate tradeoff for closing an 83%-of-uncaused-hits gap. `before-quit` flushes every pending
    entry immediately (`flushPendingFaction`) so a hit in the last few seconds before quitting is
    still recorded rather than silently lost — the read position had already advanced past its line.
  - `log-import.ts`: since a whole file is already in hand, no real waiting happens — a `pendingFaction`
    queue (oldest first) is flushed as later lines are read, once a pending hit's window has fully
    closed relative to the line currently being processed, and whatever remains is flushed
    unconditionally at end of file.
- **The Hits tab's tooltip no longer says a kill landed "earlier."** Now direction-neutral ("logged
  N seconds apart... which one actually came first isn't assumed"), since it sometimes didn't. The
  dialogue tooltip is unchanged — "earlier" is still accurate there.

## Consequences

- Coverage of kill-caused hits should rise substantially on a fast-kill-cadence grind — the exact
  scenario (repeatable faction farming) this app's own Race Unlocks feature ([ADR 0222](./0222-a-race-unlock-guide-is-generated-static-data.md))
  points players toward. Not measured after the fact against a fresh log; worth re-running the same
  `faction-log.json`/`kill-log.json` cross-reference once there's a real post-fix evening to check it
  against.
- A live faction hit is no longer instantaneous on the Hits tab — up to a 3-second delay, traded for
  a large accuracy gain. If that delay ever reads as sluggish rather than merely "a beat," the
  buffer-vs-patch-later tradeoff this ADR chose (buffer, not "emit now and amend afterward") is the
  first thing to revisit — the alternative avoids the delay entirely but needs `faction-log.ts`'s
  store and the IPC/feed-merge layer to support amending an already-broadcast entry, which was judged
  too large a surface to add on top of everything else in flight in this area the same day.
- Floor/ceiling hits remain uncaused by design, not by omission — see the Context section. Whether
  they deserve their own explanation (a periodic aura? a `/faction`-equivalent command?) is a
  separate, unopened question this ADR does not answer.
- `CORRELATION_WINDOW_SEC`'s *width* (3 seconds) is still an unverified starting guess, same as ADR
  0219 left it — only its *direction* was falsified and fixed here.
