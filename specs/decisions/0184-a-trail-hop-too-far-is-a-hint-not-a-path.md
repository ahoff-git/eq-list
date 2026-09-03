# 0184: A trail hop too far to be walked is drawn as a hint, not a path

## Status

Accepted

## Context

The map draws your own `/loc` trail as a solid line between each pair of logged positions
([ADR 0010](./0010-ported-map-core.md)). That's an honest picture of where you walked only when
every hop *was* a walk — a gate, an evac, or a same-zone port drops you somewhere else entirely,
and the trail draws a straight solid line across the intervening geometry as if you'd crossed it
on foot. The travel graph already drew this same distinction for its own lines: a route's legs are
dashed on purpose, because "straight and solid" reads as a way through the geometry, and a leg is
only ever a measurement between two points (see `drawGraph` in `MapPanel.tsx`). The trail wanted
the same honesty for the one case it can actually flag.

The hard part is that `/loc` is typed by hand, at whatever pace the player chooses — there's no
reliable way to tell "a long hop because you didn't type `/loc` for ten minutes while walking
across Karana" from "a long hop because you got evac'd." Elapsed time between the two lines
doesn't resolve it either: a real walk between sparse check-ins can take just as long as a
teleport is instant, so a slow implied speed doesn't prove a hop was walked, only that it wasn't
timed closely enough to tell.

## Decision

**Distance stands in for "probably not a walk."** In `MapPanel`'s `drawTrail`, a hop farther than
`FAR_TRAIL_FRACTION` (0.2) of the zone's own diagonal — the same world extent `vectorProjection`
already computes for fitting the map — is drawn faint, gray, and dashed (`MAP_COLORS.trailFar`)
instead of the regular solid steelblue. Scaled to the zone rather than a flat number of units,
because a 300-unit hop is unremarkable in a sprawling outdoor zone and enormous in a small dungeon
room — the same reasoning `heightStep` and `VIEW_PAD` already apply to the map's height and
padding.

This is stated as a guess, not a measurement, because it is one: there's no log of which hops
really were teleports to validate the fraction against, unlike ADR 0040's histograms of real map
files. `0.2` is chosen to catch an obvious jump without flagging every merely-long walk, and is a
single named constant specifically so it can be retuned without hunting through the draw loop.

## Consequences

A `/loc` trail crossing most of the zone in one hop now reads at a glance as "something moved you
there, not your feet," without claiming to know *what* did — no attempt is made to distinguish a
gate from an evac from a wizard's same-zone port, since the map has no way to tell them apart from
distance alone. The tradeoff is a real one: a player who genuinely walks a long, sparsely-logged
route across a big zone will occasionally see their own walk drawn as a hint. That's the same
failure mode ADR 0040 accepted for floors — a feature this narrow is honest about what it doesn't
know, rather than inventing a more confident-looking answer it can't back up.
