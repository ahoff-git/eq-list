# 0060: A position belongs to the zone it was taken in

## Status

Accepted

## Context

EQ only reports a position when you type `/loc`, so every position the app holds is old and every
reader of one has to decide how long it stays true. Three readers grew up separately and only two
of them knew the answer:

- **The kill log** tags each fix with the zone it was taken in and refuses one from another zone,
  because zoning is a teleport ([ADR 0059](./0059-a-zone-s-variants-are-one-zone.md) extends that
  to the difficulty variants of one zone — you still arrive at the zone-in point).
- **The trail** is wiped on a zone change, for the same reason spelled out in `usePlayerTrail`: a
  `LocEvent` carries no zone, so keeping the points would draw the last zone's path over this map.
- **The "You" dot** did neither. `main.ts` holds `currentLoc` and never clears it, so after zoning
  the dot stays at the previous zone's coordinates, drawn on the new zone's map, with nothing on
  screen to say so. It's the most visible position the app draws and the only one that lied.

The kill log's guard also had a hole. Its filter read
`f.zone === null || zone === null || f.zone === zone` — a fix whose zone is *unknown* matched every
zone. Unknown is not a wildcard, and there's a live path that produces one: catch-up scans a log's
tail for the current zone and last `/loc`, and when it finds a position but no zone line it emits
the position alone (`log-watcher.ts`), so the fix is recorded with `zone: null`.

In a real 2,000-kill log that put **357 placed kills at coordinates from a different zone**. Nine
Kerra Isle kills carry `(-420.24, 1757.66)` — a Steamfont camp's exact position, three minutes
after zoning out of it, on a fix already 47 minutes old. Blackburrow and New Sebilis Expedition
share a position the same way. Only two bad fixes were needed.

## Decision

**A fix places a kill only when its zone matches the kill's, unknown included.** The filter is
`f.zone === zone`. Two unknowns still match — that's the same state rather than a guess across a
known boundary — but an unknown fix can no longer claim a named zone.

**Your position is cleared when you zone.** `main.ts` drops `currentLoc` and broadcasts `null` on a
zone change, so the map shows no dot and says "type `/loc` to plot your position" until you do.
The IPC contract already allowed `null`; nothing but the map's own emptiness had to change.

That includes stepping between two difficulties of one zone. The map is the same file
([ADR 0059](./0059-a-zone-s-variants-are-one-zone.md)) and the *place* is the same, but you were
moved to the zone-in point to get there, so the position is as wrong as any other zoning's.

Rejected alternatives:

- **Keeping the dot and fading it.** The information isn't stale, it's false: you are provably not
  there, because you were teleported. Fading says "roughly here".
- **Carrying a zone on `LocEvent` and filtering per reader.** More faithful, and it spreads the
  same decision over three call sites again. The zone tracker already knows; one clear at the
  source is the smaller change and can't drift.
- **Treating a zone-less fix as usable until a zone is known.** That is exactly the rule that
  produced the 357 kills.

## Consequences

- The dot disappears on zoning until the next `/loc`, which is a real loss of a convenience and the
  honest picture. The existing nag ("type `/loc` to plot your position") already covers the state.
- Kills recorded straight after a zone-in have no position rather than a wrong one, which is what
  the confidence tiers were built to say ([ADR 0023](./0023-kill-heatmap.md)).
- **Records already stored keep their bad positions.** They can't be recomputed — the fixes behind
  them are gone — but all but four of the 357 carry confidence 0, so they draw as the faintest
  tier. "Forget recorded data" clears them for anyone who would rather start clean
  ([ADR 0056](./0056-a-dropped-record-keeps-what-it-taught.md) keeps what they taught).
- The `/loc` nag on the todo gets a second reason to exist: zoning now guarantees a gap in the map
  until you type one.
