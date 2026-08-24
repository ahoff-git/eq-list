# 0119: A pile of destinations at one spot is a sign

## Status
Accepted

## Context
Timorous Deep's map carries twelve `to X` labels inside a **120-unit box**: Ak'Anon, Cabilis West,
East Freeport, Erudin, Greater Faydark, Gukta, Halas, Neriak Commons, North Felwithe, Oggok,
Rivervale, South Kaladim. That is a translocator's board, drawn where the gnome stands, listing where
it can send you.

The harvest read it as twelve zone lines, which made **Timorous Deep adjacent to half the world**. And
because no far side ever labelled a way back, every one of those borders was one-sided and priced by
`UNKNOWN_CROSSING` — so a route out of Greater Faydark ran 2,000 invented units to a gnome that isn't
there, instead of walking to Butcherblock and taking the one that is.

A border is symmetric. The board is a menu you read *while standing in Timorous Deep*. Reading it as
zone lines turned a one-way list into a two-way road, in both directions, twelve times.

## Decision
**Border labels crowded into one spot naming five or more distinct destinations are a conveyance's
destination board, and are refused wholesale.**

**Measured, over both packs and ~1,200 files.** A real crossing sits at the edge of the map and its
neighbours are thousands of units away; a board is a caption block. Counting *distinct* destinations
within **150 units** — with a trailing `(1)`, `(2)` folded away, since that is which of several ways in
it is and not a different zone — the whole corpus has **three** places with five or more, and all three
are boards: Timorous Deep's twelve, and the portal lists in the Plane of Tranquility and Laurion Inn.

At **four** it starts reaching real dungeon junctions — Sol A's several ways into Nagafen's Lair beside
its exit to Lavastorm — which is why five is the floor, and why the fold matters: without it that
junction counts as five distinct strings and is refused.

What the board *means* is left to the hand-authored table, which is what that table is for. The six
verified translocator gnomes are written there, and this board contradicts them: it lists Kunark and a
revamped Guk, so it is a map drawn for a different server or a different era. **A label that can't be
believed is refused** — `zoneLinkName`'s own rule for `A & B`, applied to a group rather than a string.

Every refusal is reported (`report.board`), because it is the largest single correction the harvest
makes and the one most worth checking by eye.

## Consequences
Timorous Deep keeps its real crossings — the boats from Butcherblock and Firiona Vie, its own dock, the
two hand-authored translocator legs — and loses twelve borders it never had. One-sided borders fall
from 107 to 102, and routes stop being offered a gnome in Greater Faydark.

Five boards are refused in the pack that prompted this: Timorous Deep's, the portal lists in Laurion
Inn and the Plane of Tranquility, and two floor indexes (Tower of Frozen Shadow, Trials of Smoke)
whose "destinations" are levels rather than zones and were contributing nothing anyway.

**A real hub drawn this way would be refused too.** If a zone genuinely has a conveyance to five
places, its board is now invisible to the graph and the connection has to be written down by hand.
That is the right way round: a hand-authored entry states the mode, the direction and the pairing,
none of which a caption block can say — and the alternative is inventing twelve symmetric borders from
a sign.

Rejected:

- **Reading the board as a one-way network.** Nothing in the labels says which conveyance it is, who
  may use it, or whether the far end has one back. Modelling it would be guessing with extra steps.
- **A count of labels rather than distinct destinations.** Four ways into Nagafen's Lair is one place.
- **A radius large enough to be safe.** At 300 units the same rule reaches Freeport's interiors and
  the Plane of Knowledge's book destinations; 150 is where boards and crossings are cleanly apart.
