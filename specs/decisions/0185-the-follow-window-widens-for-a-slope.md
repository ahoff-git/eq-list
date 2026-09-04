# 0185: The follow window widens for a slope, not just a flat guess

## Status

Accepted

## Context

[ADR 0183](./0183-a-height-window-can-follow-you.md) re-centers the hand-set height window on
`loc.z ± heightFollowRange`, a flat guess at "one storey" (default 30 raw `/loc` z units), on the
grounds that there's no zone-wide figure to derive a better one from — `zRange` is the whole span,
not a floor's share of it.

In practice, that flat guess clips real terrain. A gradual slope — a ramp, a hillside path, the
incline into a cave mouth — changes height continuously as you walk it, and a fixed ± window
centred on your current `z` simply doesn't reach the ground a few steps ahead or behind: the far
edge of the very slope you're standing on falls outside the band and disappears, mid-incline, for
no reason a player can see. Widening `heightFollowRange` itself doesn't fix this without cost —
turned up enough to cover the steepest slope in a zone, it stops isolating anything on flatter
ground nearby.

The obvious next step — cluster the zone's heights and call the clusters "levels" — is exactly what
[ADR 0040](./0040-floors-come-from-the-mapmaker.md) already rejected: Greater Faydark's terrain and
Kelethin's platforms make a convincingly multi-modal histogram for a zone that isn't multi-storey
at all. Anything that infers *structure* — a level, a floor, a count of storeys — from height
clustering repeats that mistake.

## Decision

The follow window no longer widens by a global guess about the zone; it widens by what's
physically **near the player**. `followHeightWindow` (`eqmap.ts`) takes the follow window's usual
± half-width as a floor, then scans the map's segments for endpoints within a short radius of
`loc` (a fraction of the zone's own diagonal — the same reasoning `FAR_TRAIL_FRACTION`
([ADR 0184](./0184-a-trail-hop-too-far-is-a-hint-not-a-path.md)) uses for the opposite question)
and stretches `minZ`/`maxZ` out to cover whatever heights those nearby endpoints sit at.

This is deliberately not floor detection: it never clusters the whole map, counts levels, or names
one. It asks a strictly local, geometric question — "what heights sit within a short walk of this
point" — which stays true for terrain that would break clustering, because it never looks past the
player's own neighbourhood to notice the rest of the zone is multi-modal. `useFloors`'s follow
effect now keys on the player's `x`/`y` as well as `z` (previously `z` alone), since a slope's
nearby geometry changes as you move sideways along it, not only as your own height changes.

## Consequences

Walking a ramp or a sloped hillside with follow on keeps its far edge drawn instead of fading out
mid-incline, without inventing any concept of a "level" the map didn't state. The tradeoff named in
ADR 0183 — "a flat, adjustable guess... because there's no zone-wide figure to derive it from" — no
longer fully holds: there is now a local figure, and the flat guess is a floor under it rather than
the whole answer. The radius fraction is, like `FAR_TRAIL_FRACTION`, a guess rather than a
measurement: too tight and a shallow slope's far edge still falls outside it; too loose and the
window starts widening for geometry that has nothing to do with where the player is standing.
