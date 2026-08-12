# 0066: A port is cast from where you stand

## Status

Accepted

## Context

[ADR 0062](./0062-a-travel-graph-of-zone-lines.md) built the travel graph out of boundary nodes and
in-zone walks, and gave the teleport networks a shape of their own: a druid reaches any ring from any
other, so rather than a clique, each network became a **hub** with a free edge to every ring in it.

Those edges went **both ways**. That encoded an assumption nobody stated: that to use a port you first
travel to a ring, the way you travel to a dock to board a boat. It is wrong. A druid or a wizard casts
the spell from wherever they are standing — the ring is where the spell *puts* you, and nothing about
casting it requires being at one.

The consequences of the mistake were not subtle:

- Every route through a port was priced at **the cost of walking to the nearest ring**, on top of the
  walk from where it dropped you. Two of the three numbers in the answer were invented work.
- A druid **in a zone with no ring at all** was told to hike out through the zone lines, because the
  network was unreachable from where they were. In a graph where most zones have no ring, that is most
  zones.
- A **lone** ring was treated as no network — "nowhere to go" — and got no hub, on the reasoning that
  you'd have to walk to it and then could only walk back. But one destination reachable from the whole
  world is a perfectly good edge.

The same is not true of a boat or a translocator gnome: those you have to go and board. The distinction
the graph was missing is **cast versus boarded**, and it turns out to be the same distinction that
decides which networks the labels can wire up on their own — a spell reaches every ring, while a vehicle
runs between two particular ends.

## Decision

**A cast conveyance's edges are one-way, out of the hub, and the hub is entered for free from wherever
the route starts.**

- `isCast` (`travel/types.ts`) names the two modes this is true of — `druid` and `wizard` — and replaces
  `build.ts`'s separate `AUTO_NETWORKS`. One list, because "it wires itself" and "it's one-way" are the
  same fact about a spell, and two lists would have to be kept in agreement.
- `buildTravelGraph` emits `hub → ring` only. Nothing in the stored graph points *into* a hub, which is
  what says a ring is a destination rather than a stop. A network is created for **one** member, not two.
- `findRoute` adds a free edge from the virtual start to each hub it can still use — learned from the
  edges that survived the toggle, so a network you can't use is never even found. Casting later can
  never help: every destination in the network was already free at step zero, so one edge from the start
  is the whole of it.
- `applyManual` follows the same rule for a hand-added `network` place, and keeps both directions for
  anything that isn't cast.

The permission model is unchanged: druid and wizard still default **off**, because a port needs a class
you may not have or a favour you may not be able to call in.

## Consequences

A route through a port now costs exactly what it should: nothing to leave, and the walk from the ring to
where you're going. The panel shows two legs where it used to show three, and the middle one — walk to
your own zone's ring — is gone, because it was never real.

Any zone can now reach any ring, which makes the graph **much better connected** when a port toggle is
on. That is correct, and it means the toggles matter more than they did: with druid on, "how do I get
there" is usually "get someone to port you, then walk", and the walking-only answer is the one to
compare it against. Zones that were isolated islands for a druid no longer are.

Stored graphs from before this change carry the old two-way edges. They still route — the extra edges
are simply never the cheapest way — but they lack the hubs a lone ring should have, so
`npm run travel:build` should be re-run rather than trusted.

What this does **not** model: zones that forbid teleportation, and the fact that each port spell goes to
one particular place rather than to any ring a caster likes. Both would make the network smaller than it
is here, in ways a `manual-links.ts` block can express when someone finds one that matters. Treating a
port as "free to anywhere in the network" is the same deliberate over-simplification as pricing a walk
in straight lines: wrong in a way that ranks routes correctly, and honest about being wrong.
