# 0194: The follow window fades instead of cutting off

## Status

Accepted

## Context

[ADR 0183](./0183-a-height-window-can-follow-you.md) re-centers a height *window* on `loc.z` as
you move, and [ADR 0185](./0185-the-follow-window-widens-for-a-slope.md) widened that window so a
slope's far edge stopped falling outside it. Both keep the same shape underneath: a `ZBand`,
`segmentInBands`/`inBands` says yes or no, and geometry either draws or doesn't. Widening the band
delays the cutoff; it doesn't remove it, and a hard edge dressed up as a wider one is still a hard
edge — a zone with two real, separate levels a full storey apart still shows one of them vanishing
outright the moment you cross whatever line the band happened to land on.

What playing the map back actually wants is different in kind, not just in degree: **the level
you're standing on should be fully visible, the ramp connecting it to the next one should be
visible too, and climbing that ramp should crossfade the two** — the one behind you fading out as
the one ahead fades in, not a point where the first one blinks off and the second blinks on.

The obvious way to get there — cluster the zone into "levels" and cross-fade between whichever two
a ramp's segments belong to — is the same move [ADR 0040](./0040-floors-come-from-the-mapmaker.md)
already rejected: Greater Faydark's terrain and Kelethin's platforms cluster just as convincingly as
a real dungeon's floors do, for a zone that has no floors at all. Any mechanism here still has to
work without ever deciding how many levels a zone has.

## Decision

**Visibility becomes continuous, scored against one point (`loc.z`) rather than membership in a
band.** `followOpacity(z, at, core)` (`eqmap.ts`) returns 1 for a height within `core` of `at`, 0
beyond `2 × core`, and a straight ramp between — reusing `heightFollowRange` as `core` rather than
adding a second knob, so "your own level" and "how far a crossfade runs" are the same number the
panel already exposes. This replaces ADR 0185's `followHeightWindow` outright: widening a hard band
was working around the same problem this solves more directly, so the widening code is removed
rather than kept alongside it.

Like ADR 0185, this is not floor detection: `followOpacity` never sees the zone, only one height
against one reference point, so it can't cluster anything and can't be fooled by terrain that would
break a clustering pass. `useFloors` hands back a `followCenter: { z, core } | undefined` in place
of the follow-derived `ZBand`; `bands` itself is now `undefined` while following, since there is no
longer a hard cutoff to hand back. Labelled floors and the hand-dragged window are untouched —
a labelled floor's checkbox is a discrete choice and a dragged handle is an exact one, and fading
either would blur a choice the player just explicitly made.

`MapPanel` draws faded instead of filtered wherever `followCenter` is set: segment lines and POI
labels take a per-item opacity from `followOpacity` in place of `segmentInBands`/`inBands`. The
zone's lines are still batched for one `stroke()` per colour ([ADR 0010](./0010-ported-map-core.md)'s
performance reason for `mapPaths` hasn't gone away — a zone can carry twenty thousand segments), so
a truly continuous per-segment alpha is off the table: canvas alpha is a stroke-level property, and
one stroke per segment is the cost this batching exists to avoid. Opacity is quantised into
`FOLLOW_ALPHA_STEPS` (12) buckets instead, batched by (colour, bucket) — coarse enough to keep the
draw-call count bounded, fine enough that a fade a player walks across in real time reads as smooth.

## Consequences

Standing on a level now draws it whole regardless of small height noise across its floor, a ramp to
the next level draws throughout its length, and walking that ramp visibly crossfades the two rather
than switching between them at an edge — which is what was actually asked for, not merely "don't
clip a slope." `heightFollowRange` now does two jobs with one number (the opaque core and the fade's
length); a zone whose real storeys are much shorter or much longer than that guess will fade over a
noticeably wrong distance, same caveat ADR 0183 already carried for the number alone. Bucketing
trades a literally smooth gradient for a stepped one — invisible at 12 steps to someone walking a
ramp, more visible to someone who sat and watched a single value tick past a bucket boundary.
