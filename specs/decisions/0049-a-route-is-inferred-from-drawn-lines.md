# 0049: A walking route is inferred from drawn lines, and says how much to believe it

## Status
Accepted

## Context

The map window draws the game's own map files ([ADR 0039](./0039-render-the-game-s-own-maps.md)),
whose geometry is world coordinates. Given that, "suggest a walking route from where I am to there"
looks like a solved problem: run A* over the lines.

It isn't, because **the format says nothing about what's walkable**. An `L` record is a wall in a
dungeon and a contour line, river or tree line outdoors, and nothing distinguishes them. There is no
door flag, no "you can't climb this", and no closed-polygon guarantee — these are hand-authored
community files, and 10% of Blackburrow's segment endpoints are loose ends.

So a route is an *inference*, and the only question worth settling is which inference and how
honestly it reports itself. Three designs were tried against a real file (Brewall's
`blackburrow.txt` — 1,419 segments, 14 labels, 880 × 600 × 220 units), and each failed in a way that
taught the next one something:

1. **A* in plan view.** Blackburrow spirals over itself: 22% of its 10-unit plan columns hold
   geometry more than 20 units apart in height, and one column spans the zone's whole 210-unit range
   (the waterfall shaft). Routes walked through ceilings. A position has to be a cell *and* a height.
2. **Voxels, with levels found by clustering the zone's heights.** The height histogram looked
   promisingly multi-modal — 727 segment endpoints at z 0, 640 at −40, 333 at −140 — but the modes
   have *no empty gaps between them*: ramps and shaft walls populate every bucket in between. Gap
   clustering therefore returned **one** band for the whole zone, and (1)'s failure came straight
   back. Levels are local, not global.
3. **Flooding walkable surfaces outward from the walls.** This is where the real limit showed up.
   The space *between* tunnels is solid rock, and the map draws nothing there — so absence of ink
   means both "open floor" and "bedrock", and a flood seeded from walls spreads through the rock and
   reaches the entire zone. Every cell hit the surface cap and routes flew across the map in straight
   lines.

**`detectFloors`** has nothing to offer: Blackburrow declares no floor labels at all.

**Colour** is more interesting, and the first reading of it was wrong because it tested the wrong
hypothesis. Colour is certainly not a *level code* — on Blackburrow nine of fifteen segment colours
span more than 40 units of height, the largest 180 — and that was taken as "colour says nothing about
levels". But the useful question is local, not global: *where a single plan column holds geometry at
two very different heights, do the low and high groups wear different colours?* Measured over
Blackburrow's 390 stacked columns, the two groups have **disjoint colour sets in 81% of them** (e.g.
low `{blue}` — the lake — against high `{magenta, default}` — the tunnels above it). So colour is a
genuine disambiguator for overlapping structure, at 81% reliability. It is **not used**, and the
reason is timing rather than principle: the excursions it would have fixed turned out to be caused by
the two bugs below, and once those were fixed the measured need for it was gone (0.2% of sampled
route length adrift). It stands as the next lever if particular zones still misbehave.

What the mapmaker *does* provide is annotation of exactly the things geometry can't express.
Blackburrow labels its `Waterfall`, both `Swim Out (Underwater)` routes, `TRAP: Fake Floor` and
`TRAP: Fake Door`. Those are the swims and one-way drops, named.

## Decision

**A route is A* over the drawn lines, seeded from where the player is, with height carried in the
search state — and it is always presented as a suggestion carrying a confidence.**
`src/shared/map/route.ts`, pure and black-box tested (`electron/tests/route.test.ts`).

- **No precomputed walkable set.** It follows from (3) above that walkable ground can only be found
  by flooding *from where you are* with walls as barriers — which is what A* already does. So
  `buildRouteGrid` only rasterizes the lines; the search discovers what's reachable.
- **A cell records two different things**, and conflating them was the bug behind (3): height
  *intervals* something was drawn across (a wall stops you at the height it stands at; a vertical
  face stops you at every height it spans), and separately the heights that are evidence of a
  **walkable floor**, taken only from segments gentle enough to be following one. Read the waterfall
  shaft's interpolated heights as floors and it becomes a staircase the search ratchets down.
- **Height is carried, not banded.** Entering a cell, the search adopts the nearest floor the walls
  around it evidence. A corridor at z 0 over one at z −100 keeps its own floor, because the floor
  100 units below is out of reach and so cannot pull it down. Nothing is named or shown as a
  storey, so this does not conflict with
  [ADR 0040](./0040-floors-come-from-the-mapmaker.md) — that decision refuses to *present* guessed
  floors to the user, which is a claim about the zone; declining to step 100 units down is not.
- **Labels outrank geometry, through the existing classifier.** `poiKind`
  ([ADR 0048](./0048-a-map-label-is-read-by-its-words.md)) already recognises `passage`
  (swim/climb/drop/ladder/stairs/one-way), `zoneline` and `door`; those un-block the cells they
  cover, and `passage` additionally authorises a change of level that the step limit would never
  allow. **A `trap` does neither** — `TRAP: Fake Floor` is a way down and it works, but routing
  someone into a trap because it's a shortcut is a suggestion nobody asked for.
- **The step limit is symmetric, and generous (80 units).** The asymmetric version (climb 10, drop
  40) was a real bug: every descending tunnel became one-way downhill and "route me back to the exit"
  could not be answered. The cause is discretisation, not physics. It's safe to be generous because a
  wall — not the step limit — is what stops a route scaling it, and hand-drawn maps are full of height
  discrepancies (a floor drawn at one height opening onto a corridor drawn at another). Climbing stays
  *cheaper* than dropping, so a route still prefers the ramp it can walk.

  The threshold for "this is a **jump**, draw it as its own steep leg" is deliberately *separate* and
  stays at 40. They were once the same constant, and doubling the step limit therefore doubled the
  height that smoothing would draw a straight line across — which took the worst excursion in the
  corpus from 187 units to 416. A step may be 80 units; drawing one as a straight line stops being
  honest at 40.
- **Two guards against the bedrock problem.** A route may not stray more than 6 cells (24 units)
  from drawn geometry **at the height it is walking at**, since nothing in a dungeon is that far from
  every wall — beyond it you've leaked around an unclosed wall end into the rock. And how far a route
  ran from the ink is reported as part of its confidence, because a route through rock is the one
  failure this approach cannot rule out.

  Measuring that distance *in plan alone* was the single worst bug here, and an instructive one: on a
  stacked zone every column has ink somewhere, so the guard was vacuous in exactly the case it was
  written for. Its tolerance is measured rather than chosen — over 36 routes across six dungeons,
  sampled every 8 units:

      10 cells, ±1 height slice   11.8% of sampled length adrift (>40u from same-height geometry)
       8 cells, ±1 slice           4.8%
       6 cells, ±1 slice           1.0%
       6 cells, exact slice        0.2%

  Tightening it **found more routes, not fewer** (30 against 29) and cut the slowest search from
  416ms to 305ms — the tell that the slack was never buying reach, only letting the search wander
  into rock and get stuck there. Loosening it again to rescue a large room was tried and rejected:
  at 56 units, dungeon drift rose to 12.4% and the room stayed shut, because it was never a question
  of reach.

  **It remains a proximity test standing in for an enclosure test**, and that substitution is the
  known weak point: it asks "is a wall near me?" where the real question is "am I inside the drawn
  structure?". The two agree in a corridor and disagree in the middle of a large hall. A parity test —
  counting wall crossings along a scanline per height slice — would answer the real question, and is
  the next change if a zone with genuinely vast rooms misbehaves.
- **The grid has to be fine enough for a doorway to survive it.** Blackburrow set the coarse end (a
  10-unit cell swallows a third of its segments); **New Sebilis Expedition** set the fine end, by
  failing outright — at 4 units a room there was sealed, because its doorway is narrower than the wall
  cells either side of it. The room's interior sat 1–3 cells from ink, well inside every guard; it
  simply had no opening left to walk through, which is why it presented as "a walkable room A\* can't
  path in or out of".

      cell   dungeon drift   expedition   that room   slowest
        4    0.2% adrift     11/12        sealed      176ms
        3    0.1%            12/12        open         80ms
        2    0.3%            12/12        open         79ms

  3 is better on every axis at once. The counter-intuitive part is the speed: a finer grid makes each
  wall's plan footprint *smaller*, so less of the zone is spuriously solid and the search wanders less.
- **A height tolerance in units, not in slices.** The corridor test is taken in height slices, and a
  slice boundary falls at an arbitrary height — so a room floor drawn at z −4 opening onto a corridor
  at z −3 could straddle one, and a **one-unit** difference in height decided whether the room was
  reachable. Forgiving ±1 slice was the first attempt and was wrong in a different way (a slice's
  height is an implementation detail, so it granted licence proportional to nothing, and cost a factor
  of five in drift). Slices are now 4 units and the tolerance is a stated ±4 units.
- **The smoothing verifies the line it will draw.** String-pulling isn't cosmetic when its output is
  what a player is told to walk, and two faults in it produced the worst routes in the corpus, both
  by drawing a straight line across a change of level. Keeping the waypoint *before* a jump but not
  the one after let the far side be absorbed into the next straight run — on Blackburrow, one leg
  descending 101 units over 108 units of plan. And re-deriving height cell by cell while checking a
  leg let the check follow a straight line down through the ceiling of the tunnel below, approving a
  shortcut that ran 263 units from any geometry at the height it claimed. A jump is now its own
  short, steep leg, and a leg is checked along the interpolated line that actually gets drawn.
- **Confidence is measured, and thresholds come from the corpus.** Drawn line per unit of map area
  separates the two kinds of map cleanly across 567 of Brewall's files, 54 hand-labelled:

      dungeons (n=22)   min 0.0046   median 0.0294   max 0.1179
      towns    (n=12)   min 0.0077   median 0.0164   max 0.0381
      outdoors (n=20)   min 0.0007   median 0.0026   max 0.0054

  Measured from the segments rather than the cells they landed in, so it can't move with the grid
  resolution chosen for a zone. Below the gap between those groups a map is **terrain**, and a route
  is refused outright with that as the reason: there's no corridor to follow and no wall to be
  stopped by, so searching would spend the whole budget to conclude nothing.
- **The search is bounded**, because a route is asked for on a click. It gives up after a budget
  scaled to the map, and says it gave up rather than reporting no route.
- **It is off by default**, a 🧭 toolbar toggle in the map window, and the toolbar states the
  distance and how much to believe it — plus what made it doubtful. A dashed line on its own looks
  like a fact.
- **The log's position is only trusted for the zone on screen.** The map window can view any zone
  while you stand in another, and your `/loc` is then a coordinate somewhere else entirely — which
  would either fail confusingly or quietly route from the wrong end of the map. So where the viewed
  zone isn't the one you're in, the start must be **placed by hand** (⌖, or the first click), and a
  placed start is labelled as one rather than passed off as a known position. This also makes the
  feature testable at all without travelling to the zone.
- **A clicked point has no height**, because a map click is a position in plan and on a stacked zone
  that's several places. It takes the floor in view, else the middle of the map's range, and
  `findRoute` snaps it to the nearest floor the geometry evidences — so on a stacked zone you pick a
  floor first and clicks land on it.

Measured on 28 zones: dungeons and towns route in ≤416ms with 0.1–0.8% of sampled route points
clipping a wall (string-pull artefacts at corners); the eight open zones refuse instantly.

- **Wall crossings are checked against the geometry, not the grid.** A cell is too coarse to answer
  "does this step cross a wall?": a wall drawn diagonally occupies two diagonally-adjacent cells, and a
  step between the *other* two passes clean through the line while entering no blocked cell. So the
  segments are indexed per cell and the drawn legs are intersected against them exactly.

  Applying that test to every individual step is **rejected**, on measurement. It removes the last
  crossings and halves coverage (28 → 22 dungeon routes, the expedition 12/12 → 5/12, and the room
  above sealed again), because in a corridor a few cells wide the line between two quantised cell
  centres really does clip the wall — the test is right and the grid is the approximation. Finer cells
  don't rescue it. What remains with it off is bounded and small: across four zones every crossing
  measured **2.1 units or less, on 4-unit legs** — one diagonal step cutting a corner by about the
  width of a hairline. Sealing rooms to avoid that is the worse trade.

## Consequences

- The map can answer "how do I get there from here", which is the first thing it's been able to say
  about the space between two points rather than about the points.
- **Outdoor zones get no routes at all.** That's the honest answer — their lines aren't walls — but
  it means the feature is for dungeons, towns and ruins, and a user in East Karana gets a refusal
  rather than a straight line.
- **Some dungeon pairs report "gave up" where the truth is "not connected".** A zone whose levels
  are joined by nothing the labels name (Kurn's Tower draws its eight floors side by side) is
  genuinely unroutable, and on a large map no budget can prove it. The two failures read differently
  to the user but they are the same underlying gap.
- **Within a cell far from any wall, the floor height is a guess** — these maps draw walls, not
  floors, so in the middle of a wide room the search carries the last height it knew. This is the
  weakness that can't be engineered away from this data, and it's the reason confidence exists.
- **A little of every route is still unverified, at its ends.** The first and last waypoints are
  replaced by the exact positions asked for, because that's what was asked for — so if a destination
  sits off the drawn geometry (`GS: Silver Ring` is at z −228 where the geometry stops at −178), the
  leg reaching it crosses whatever lies between. Three of the five remaining adrift samples in 3,053
  are exactly this; two are genuine residual error in the middle of a route.
- A route depends on the *pack* installed: Blackburrow has no file in the game's own `maps` folder,
  so all of this rides on Brewall's, as zone naming already does.
- There is no live guidance and can't be: EQ only logs a position when one is asked for
  (`/loc`), so a route is a drawn suggestion that re-computes when a fresh position arrives, not
  turn-by-turn navigation.
- The tuning constants are now load-bearing and each carries the observation that set it. Changing
  one without re-running the sweep over real files is how this regresses.
