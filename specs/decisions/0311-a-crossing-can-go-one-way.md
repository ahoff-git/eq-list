# 0311: A crossing can go one way

## Status
Accepted

## Context
The travel graph made every crossing a two-way border, one node in both its zones
([0062](./0062-a-travel-graph-of-zone-lines.md)). Several crossings of the same two zones were
positions on that one node, and a walk took the nearest one in each zone separately. The Hole broke
both assumptions at once:

- The Hole and Paineel are joined by the zone line at the top of The Hole, by a portal at the bottom
  (`to Paineel (portal)`), and by a fall from Paineel (`to The Ruins of Old Paineel (fall down)`). All
  three were one node, so standing at Paineel's zone line was standing in The Hole's portal room. Paineel
  to Neriak Third Gate came out at 25 units, where the real route is a walk down a level 40–55 dungeon.
- The Hole's portals to Neriak Third Gate and Erudin Palace landed on those zones' `from The Hole`
  labels, which made them two-way borders. Neither zone labels a way back. The guides describe them as
  exits ([Wedar's guide](https://wiki.project1999.com/Wedar%27s_Guide_to_The_Hole),
  [eqlwiki](https://eqlwiki.com/The_Hole)), and the pit inside The Hole can't be climbed out of.
- eqlwiki's Adjacent Zones row lists `[[Neriak Third Gate]] (teleporter), [[Erudin]] (teleporter)`.
  The note was cut and both were claimed as borders, the second one into the wrong zone.

The labels already say most of this, in their own words. Across both packs, `from X` nearly always
sits beside a `to X` in the same zone (Chardok, Sebilis, Charasis), so it marks where you land, not a
crossing of its own. Some labels say outright that they go one way: `(One Way)`, `One-Way`,
`(Drop Down)`, `(Fall)`, `(Hole - jump)`.

## Decision
A crossing has a direction when its label says so. A one-way crossing is its own node, separate from
any border between the same two zones.

- **What makes a crossing one-way** (`harvest.ts`): a portal, or the words *one-way*, or a fall, drop
  or jump inside the label's brackets. Brackets only for those three, because the bare words are inside
  zone names (`Befallen`, `Stoneroot Falls`). A portal is one-way because a portal label states a ride
  there and nothing about one back. If there is a way back, its own label states it.
- **The node** is `from>into` (`oneWayId`), carrying `into`, the zone it delivers you to. Its position
  in that zone is where you land, and it is often unknown.
- **`from X` lands on the crossing from X.** It joins X's one-way crossing into this zone when there is
  one (Erudin Palace's `from The Hole`). Otherwise it stays the arriving half of an ordinary border, as
  before.
- **One rule for walking, `walkable`**, shared by the builder and the router's two ends. Nobody walks
  into a one-way crossing on its arrival side, and nobody walks away from it on its departure side.
- **The wiki doesn't claim a ride.** An adjacency the wiki notes as a teleporter, portal or one-way is
  dropped when the table is generated. A wiki pair is also "already known" when the maps drew a one-way
  crossing between the two zones, in either direction.
- **A drop inside a zone is hand-authored.** `ManualBlock` gains `oneWay`, meaning you can walk from
  `a` to `b` and not back. Each end resolves to an exact label first, and an end that matches several
  places is refused and reported instead of resolving to the first one. The Hole's pit is the first
  entry: the fall from Paineel lands at the bottom, and nothing walks from there to the zone line or the
  succor point beside it.

## Consequences
- Paineel → Neriak Third Gate is about 1,430 units down The Hole. Neriak and Erudin Palace reach
  Paineel overland, and the portal room reaches Paineel through its portal.
- Across both packs this produces a small, readable set of one-way crossings. In Brewall: The Hole's
  three portals and Paineel's fall, plus Darklight Caverns, the Eastern Wastes shard and the Kael shard.
  In the game's own maps: The Hole's portals, Paineel's jump, Lower Guk's portal to Innothule, the Plane
  of Sky portal, and the two Plane of Fear portals. Those two are one-way each and two-way together.
- A one-way crossing whose landing nobody labelled costs `UNKNOWN_CROSSING` to walk on from, and wears
  its `?`. That's the honest price for a landing we can't place.
- Where you start inside a zone is still a straight line to every node. A `/loc` at the bottom of The
  Hole's pit is quoted a straight walk to the zone line. Fixing that needs to know which part of a zone
  a position is in, which nothing here does.
- Several crossings of one *two-way* border are still positions on one node, and a walk takes the
  nearest one in each zone separately. Lower Guk's shafts, the numbered ways into Nagafen's Lair and
  the Qeynos aqueduct exits can still enter at one crossing and leave from another. That's an open
  question, not settled here.
