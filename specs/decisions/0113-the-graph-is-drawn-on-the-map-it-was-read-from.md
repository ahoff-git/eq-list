# The graph is drawn on the map it was read from

## Status
Accepted

## Context
[ADR 0062](./0062-a-travel-graph-of-zone-lines.md) built the travel graph out of the mapmakers' own
exit labels, and answered the question it was built for: *how do I get there?* It has never been able
to answer the other one, which is the one that decides whether the first answer is worth anything —
*should I believe this?*

Everything a route tells you is a list of place names and distances. Nothing in it says that Misty
Thicket's border with RunnyEye Citadel has **no coordinates on either map**, so the 2,000 units it
quotes for that leg is `UNKNOWN_CROSSING` wearing a `?`. Nothing says that Greater Faydark's only
druid ring is one the map calls abandoned
([ADR 0114](./0114-a-conveyance-the-map-calls-dead-is-not-one.md) found that by hand). Nothing says
whether a border the graph puts in a zone is anywhere near where the map draws a way out.

All of it is *checkable*, and checkable in one place: on the map the coordinates were read from.
The map window already draws pins, kills, peers and the pack's own labels at stated coordinates —
the graph is the one body of positions in the app that has never been on screen.

The map's non-responsibilities say **"no line on a map, and no route drawn"**, and that stands: it
comes from [retired ADR 0049](./README.md), which is about routing through a map's *geometry*, where
an `L` record is a wall in a dungeon and a contour line outdoors. Drawing a **marker at a coordinate
a mapmaker stated** is not that, and is what the map does all day.

## Decision
**While the 🧭 panel is open, the map draws the travel graph's own claims about the zone on screen.**

- A **survey** (`surveyZone`) is the graph from one zone's point of view: every node it puts there,
  at the positions it holds for that zone, plus the teleport networks reachable from it. Pure, so the
  main process answers it (`travel:survey`) and the renderer only draws.
- **On the map**: a diamond where you cross into another zone, a circle where you arrive without
  walking. A border is named by **where it takes you**, not by the pair of zones it joins, which is
  the same reading a route's rows use and the only one that is an instruction. A node with several
  crossing points gets a marker each, because a zone offering three ways into its neighbour is one
  border drawn three times and collapsing them would put it where none of them is.
- **Off the map, in an aside**, two things that are true of the zone and have nowhere to be on it:
  - **The teleport networks, grouped and counted.** A druid reaches every ring in the world from
    wherever they stand, so a faithful drawing runs eighteen lines off the edge of Misty Thicket and
    says nothing except that the network exists. One chip reading `Druid Rings · 18` says exactly as
    much, opens when you want the names, and marks which of them is the one on this map. **The
    alternative isn't a busier map, it's an unreadable one.**
  - **The nodes with nowhere to be.** A border only one side's mapmaker labelled is *in* this zone
    with no position in it. A marker cannot show that, and its absence reads as "no such border" —
    the opposite of the truth, and the single thing an audit is most looking for.
- **A network you have switched off is dimmed, never dropped.** An audit is about what the graph
  holds, not about what you can currently use; a group that vanished when you unticked a box would
  read as a graph that had lost it.
- **Readable, not merely visible.** Hovering a node gives its exact `/loc`, which of its crossings it
  is, its kind and its node id — because auditing means comparing our figures against the game, and a
  marker alone can't be compared with anything. The whole survey copies as text for the same reason.
- **Only while navigating.** Not a layer you can leave on: it answers a question you ask while
  planning a trip and never while watching a camp, and permanently on it is one more thing over the
  kills and the pins.

## Consequences
**The map stops saying the same thing twice.** A node's position *is* the label's own, copied verbatim
by the harvest, so `to The Lesser Faydark` sat under a diamond reading `→ Lesser Faydark`. With the
graph on screen the map drops its own label at that point — matched on the rounded position rather than
the words, since these are the same point and not two labels that agree — because the marker is the
better of the two: it says where it takes you, and it answers to the pointer with the node's figures.

**The aside is off by default**, behind a *Show what the graph knows* button in the panel's own
controls. The markers are the useful half and cost nothing to read; the strip answers *should I believe
this?*, which is asked now and then rather than on every trip. The choice is remembered.

Two faults were visible within a minute of the first draw, both of which had been quietly shaping
routes: Greater Faydark's border with Timorous Deep, and Misty Thicket's with RunnyEye Citadel, are
both **unplaced** — which is exactly where the `2000?` legs in real routes were coming from. Neither
was findable from a route, and both are one line in `manual-links.ts` away from being real distances.

The survey is asked of the **same graph the router uses**, through the same `travelZone` resolution —
including a zone the pack drew twice, where the file on screen may not be the file the graph kept
([ADR 0111](./0111-one-zone-one-map-file.md)). A survey that described a different graph from the one
routing would be worse than none.

**The prohibition on drawing a route stands.** This draws nodes, never a path: nothing here joins two
markers with a line, because a line between two points on a map is a claim about the ground between
them and the geometry cannot support one. Whether a *chosen route* may be drawn as a schematic across
several maps is a separate question, deliberately not settled here, and it will need its own answer to
"what stops this reading as a walkable path?".

Rejected:

- **A layer you can leave on.** It is the panel's working, not a view of the world.
- **Drawing the networks on the map.** Eighteen lines off the edge, per network, saying only that the
  network exists.
- **Leaving unplaced nodes out.** They are the finding. Silence about them reads as "no such border".
- **Drawing the walk edges.** Within a zone every pair of nodes is joined, so it is a complete graph
  by construction — n² lines that carry exactly one bit of information, and one already known.
