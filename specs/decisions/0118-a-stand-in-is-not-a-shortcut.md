# 0118: A stand-in is not a shortcut

## Status
Accepted

## Context
A route out of Castle Mistmoore quoted **4,000 units** to walk from Butcherblock's zone line to the
translocator gnome standing at its docks. The real distance is 6,858. The gnome is labelled on the map
and its coordinates are in the graph; nothing about the answer was a measurement.

Two separate faults, both of which turn `UNKNOWN_CROSSING` — the honest stand-in for a border nobody
drew — into a way of paying *less* than the truth.

**A stand-in is composable.** It costs 2,000 to reach a border with no coordinates, and it cost the
same to leave one. So an unplaced border is a **4,000-unit teleport between any two points in its
zone**, and no walk anywhere can cost more than that. Butcherblock has `butcher|kaladima`, a border
South Kaladim named and Butcherblock's own mapmaker never did; the router hopped through it.

**A border is one node however many ways across it a zone offers**, which is right for crossing and
wrong for walking through: `zoneDistance` takes the nearest pair for *each edge independently*, so a
path in by the near crossing and out by the far one pays nothing for the distance between them. That
is how the same route earlier walked into Butcherblock's boat dock and out of it six units from the
gnome, and read `3280 Boat to Butcherblock Mountains` — a ride you don't take, to the zone you're in.

Both are instances of one thing: **a route was walking *through* a node inside a single zone.**

## Decision
**Within one zone you never walk through a node.**

- Every pair of a zone's nodes is joined by construction
  ([ADR 0062](./0062-a-travel-graph-of-zone-lines.md)), so the direct walk always exists and a two-hop
  through a third is either redundant — the triangle inequality, for nodes with one position each — or
  one of the cheats above. Refusing it always yields the more honest number, never a worse route.
- Enforced in the search, where the cost is: relaxing a walk in zone Z from a node that was itself
  reached by a walk in Z is skipped.
- **Checked against the walks the search has, not the walks the graph stores.** The two virtual ends'
  walks are synthesised per query and are in no graph, so a lookup against `graph.edges` answered "no
  direct walk" for every step out of where you are standing — and the one place every search leaves
  from was the one place that could still hop through an unplaced border for less than the walk. Read
  off `outgoing` instead, with `walkKey` the single spelling both sides use, since the whole rule rests
  on the recording side and the asking side agreeing.
- **Only where the direct walk exists.** A `ManualBlock` — "two places in one zone you can't actually
  walk between" — is the one thing that removes it, and it exists precisely so a detour through a
  third node is available. So the skip is conditional on the direct edge being there, and a block
  still leaves the route it was written for.
- **The reading needs no rule of its own.** A border the route never walks through is a border that is
  never a step, so nothing has to be hidden after the fact — see the consequences.

## Consequences
Butcherblock's zone line to its translocator is **4,133** — measured, from the succor point the route
uses, with no `?`. The 4,000 that prompted this is gone, and so is the `3280 Boat to Butcherblock
Mountains` row.

`UNKNOWN_CROSSING` goes back to meaning what it says: the price of *reaching* a border nobody drew.
It can appear once on a leg and can no longer be chained into a cheaper answer than the truth.

A stand-in can still **under**-price a single leg, which is by design — it must not be so expensive
that a real crossing is never offered, nor so cheap that it always wins — and every leg priced by one
still wears its `?`.

**It replaced a rule rather than joining one.** The reading used to drop a border the route had walked
past and carry its distance onto the next row. Once the search refuses to walk through a node at all,
that could only ever fire where a `ManualBlock` had made the detour *real* — where merging it would be
wrong — so it was deleted rather than kept as insurance. One rule, in the layer nearer the cause.

The constraint makes the search path-dependent, which Dijkstra does not model exactly. It is safe
here because the transition being refused always has a direct alternative that is at least as good in
truth, so the answer cannot be worse than the unconstrained one — only more honest.

Rejected:

- **Raising `UNKNOWN_CROSSING`.** It would make two hops expensive and three cheap, and it would stop
  a real unplaced border being offered at all. The number is not the problem; composing it is.
- **Splitting a multi-crossing border into a node per crossing point.** More faithful, and it changes
  what "a border is one node" means everywhere — the thing that dissolves the unanswerable question of
  which exit pairs with which arrival.
- **Fixing it only in the reading.** The wrong number was the *chosen* route, not just the words: a
  4,000 shortcut changes which way the router goes.
