# A route is drawn as the measurement it is

## Status
Accepted

## Context
[ADR 0113](./0113-the-graph-is-drawn-on-the-map-it-was-read-from.md) put the graph's **nodes** on the
map they were read from and deliberately left one question open: may the *chosen route* be drawn?

The reason for leaving it was [retired ADR 0049](./README.md) and the map's own non-responsibilities:
a line between two points on a map is a claim about the ground between them, and this geometry cannot
support one — an `L` record is a wall in a dungeon and a contour line outdoors.

But a route's legs are not a claim about the ground. Each is `dist3d` between two nodes in one zone's
frame: **a straight line is exactly what was measured**, and the number in the route list is its
length. Drawing it adds no claim the list doesn't already make; it only puts the claim where it can be
read against the map.

## Decision
**The route is drawn, and drawn as the measurement rather than as a way through.**

- Every leg of the current route that falls on the zone on screen is drawn, quietly, in light grey.
  The trip should be visible without hunting for it.
- **Hovering a step in the list picks its leg out** in the accent colour, with both ends lit, and the
  row highlights so the line has something on screen explaining why it appeared.
- **Straight and dashed, in both states.** Straight because a straight line is what `dist3d` measured;
  dashed because a solid line reads as a corridor. Neither follows the geometry, and neither should.
- Between the **nearest pair** of positions, since that is the pair `zoneDistance` priced when a zone
  offers several crossings of one border.
- A leg with an end that isn't on this map — a hub, your own position, a border nobody placed here —
  **draws nothing**. That is the honest answer for a leg that isn't here, and it keeps the drawing
  exactly as complete as the data.
- The **destination cell opens that zone's map**, like a breadcrumb: a route reads as a tour, and the
  place a row sends you to is the thing you want to look at.

## Consequences
**A crossing you have to be at reads as two rows, not one.** A boundary node *is* the crossing, so
arriving at Butcherblock's translocator meant both walking to it and taking it, and the row read
`4.1k Translocate to The Ocean of Tears` — pricing the ride at the length of the walk. The ride is
free; what costs is getting there. A walk into a border that names a conveyance now splits into *run
4.1k to the translocator* and *translocate to the Ocean of Tears*, with the walk row carrying the
distance and the drawn line and the crossing row carrying the ✕. A zone line doesn't split (walking to
it and stepping over it are one act), a port doesn't (it is cast from where you stand), and a crossing
you are already standing on doesn't (there is no walk).

The list and the map now say the same thing in two ways, and the second one is checkable: a leg whose
line crosses a mountain is a leg whose distance is wrong, and that was invisible in a column of
numbers.

What is still not drawn is anything the graph does not measure. There is no path *through* a zone, no
curve suggesting a road, and nothing joining two maps. The straight dashed line is the whole claim: two
places, and how far apart they are as the crow flies.

The prohibition it descends from stands where it was aimed. [Retired ADR 0049](./README.md) was about
routing over geometry — deriving a path from `L` records and presenting it as walkable. Nothing here
derives anything: the ends are two nodes the graph already holds, and the line between them is a
figure the route list was already showing.

Rejected:

- **Hover-only** (where this started). The route is the thing you opened the panel for; making it
  appear only under the pointer means you have to already know where to point.
- **A solid line.** It reads as a corridor, which is the one reading that must not be available.
- **Following the geometry** to make it look plausible. That is precisely
  [retired ADR 0049](./README.md), and a convincing wrong path is worse than an obviously schematic one.
- **Drawing across several maps at once.** Still open — two drawings have no shared coordinate frame,
  so laying them out is a placement problem with no correct answer, only a legible one.
