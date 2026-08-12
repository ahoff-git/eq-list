# 0069: A succor is a port inside one zone

## Status
Accepted

## Context
The travel graph prices a trip as **walking**, and the walking it can't avoid is the walk from where
you are to the zone's way out ([ADR 0062](./0062-a-travel-graph-of-zone-lines.md)). In a big outdoor
zone that leg dominates everything else on the route.

EverQuest has an answer to it that the graph had no way to express. An **evacuation** — the Succor and
Evacuate spell lines — teleports you from wherever you're standing to one fixed safe point in the zone
you're already in. On this server `/pick`, which moves you between instances of a zone, drops you at
the same spot. Either way you end up somewhere you didn't walk to, and if that spot is nearer the zone
line than you are, you have just skipped the most expensive leg of the trip.

The maps already say where it is: `poiKind`'s zone-line vocabulary has named `succor`/`succour` since
[ADR 0048](./0048-a-map-label-is-read-by-its-words.md)'s corpus tally, and the label filter offers
"Succor points" as part of its zone-lines row. The harvest was **dropping** those labels, and correctly
so under the rule it had: a zone line that names no destination can't be joined to anything, and
inventing a far side for it would be a guess.

That rule mis-reads this one marker. A succor point names no destination because it *has* none — it
isn't a border with a missing half, it's a complete fact about one zone.

Three things then had to be decided: what kind of thing it is in the graph, whether it is a network,
and whether a route may assume you can use it.

## Decision
**A succor point is a `place` node in one zone, with a free one-way edge into it from every other node
in that zone, and it is `TravelMode`'s fourth toggle.**

- **It is `place`, not `boundary`.** A boundary is a node in two zones and is what makes zoning free;
  a succor changes no zone at all. The node holds the map's own coordinates and wears `via: "succor"`,
  which is the one case where a place can say how you arrived at it — you evacuated, there is no other
  way to be dropped there. A dock deliberately does not mark itself the same way, because that would
  claim a ride nobody has paired up yet.
- **In is free, out is a walk.** The same one-wayness a druid ring has, for the same reason: it's cast
  from where you stand, so it's somewhere you arrive and never somewhere you walk to in order to leave
  ([ADR 0066](./0066-a-port-is-cast-from-where-you-stand.md)). Leaving it is an ordinary walk, which
  the zone's own walks already price. `zoneSuccors` states the free edges; the router adds one more
  from the virtual start, because "where you stand" is usually the middle of a zone, where no node is.
- **It wires no hub.** `CAST_MODES` earns a hub, and a succor network has exactly one destination —
  this zone's own. Collapsing it through `net:succor` would say every safe point in the world reaches
  every other. So it is excluded from `isCast`, and hand-authored `pair` / `network` entries exclude it
  by type (`TravelJoin`): there is nothing to pair it with.
- **The toggle defaults off**, by the druid-and-wizard argument rather than the gnome one. It needs an
  evacuation spell, a friend with one, or a second pick to jump into, and none of the three can be read
  off a map. A translocator gnome is public and visible; this isn't.
- **Only the words that mean this and nothing else** are read: `succor`, `succour`, `evac`,
  `evacuate`. `Safe Spot` and `Safe Point` are refused — in the packs those mark somewhere pleasant to
  camp far more often than they mark a succor point, and a wrong safe point is a free ride to the wrong
  end of the zone.

## Consequences
- A route through a large zone can be several thousand world units cheaper with the toggle on, and the
  panel shows the leg as `within <zone> → Succor`, not `across` it — because nothing was crossed.
- `TravelCrossing` widened from "how you get across" to "how you got here, if not on foot", which is
  what it was already answering for every consumer of it.
- The build report gains a `succor` row: the zones whose maps say where an evacuation drops you. It
  reads as a network row without being one, and is the quickest measure of how much this pack knows.
- **A succor point can only be read, never hand-authored.** A zone whose pack never drew the marker
  simply doesn't offer the ride. `TravelPlace` carries no coordinates, so a manual entry could state
  that a safe point exists but not where — and an unplaced one is priced at `UNKNOWN_CROSSING`, which
  is a guess that can *beat* a measured walk. Left out on purpose; it wants a coordinate first.
- A zone's own edges (walks and succors) no longer count as "a way in or out" when the build looks for
  isolated zones — only an edge that leaves the zone does. Without that, a zone holding nothing but a
  dock and a succor point would have dropped off the list of holes to work through, and the report's
  whole job is to say where the graph is thin.
- The saving is only as good as the mapmaker's coordinate, like every other distance here — and, like
  every other distance here, it's a straight line.
