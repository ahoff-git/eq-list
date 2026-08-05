/**
 * A suggested walking route across a map's own geometry — A* over the drawn lines. Pure and
 * DOM-free, like the rest of `src/shared/map/`, so it's unit-tested without a canvas.
 *
 * **A map file says nothing about what's walkable.** An `L` record is a wall in a dungeon and a
 * contour line outdoors, and nothing in the format tells them apart — so a route is always an
 * inference, and this module's job is to make an honest one and say how much to believe it. See
 * [ADR 0049](../../../specs/decisions/0049-a-route-is-inferred-from-drawn-lines.md).
 *
 * Everything here was shaped by measurements on Brewall's `blackburrow.txt` — 1,419 segments, 14
 * labels, 880 × 600 × 220 units — because three plausible designs failed on it in three different
 * ways, and the failures are the design rationale:
 *
 * 1. **Plan view walks through ceilings.** 22% of Blackburrow's 10-unit plan columns hold geometry
 *    more than 20 units apart in height, and one column spans the zone's entire 210-unit range (the
 *    waterfall shaft). So a position is a cell **and a height**, never just a cell.
 * 2. **Levels can't be found by clustering heights.** Blackburrow's height histogram has clear modes
 *    (727 endpoints at 0, 640 at −40, 333 at −140) and *no empty gaps between them* — ramps and
 *    shaft walls fill every bucket — so global banding yields exactly one band and the stacking
 *    problem returns. Height is therefore carried along the search and re-derived from the walls
 *    beside each cell, so a corridor over another keeps its own floor.
 * 3. **The space between tunnels is solid rock the map doesn't draw.** This is the important one.
 *    Absence of ink means both "open floor" and "bedrock", and nothing distinguishes them — so
 *    walkable ground cannot be found by flooding outward from the walls, which spreads through the
 *    rock and reaches the whole zone. It can only be found by flooding *from where you are*, with
 *    walls as barriers, which is exactly what A* already does. Hence there's no precomputed
 *    walkable set here: {@link buildRouteGrid} only rasterizes the lines, and the search discovers
 *    what's reachable.
 *
 * 4. **The smoothing has to verify the line it will actually draw.** String-pulling is not cosmetic
 *    here — its output is what the player is told to walk. Two faults in it produced the worst
 *    routes in the corpus, both by drawing a straight line across a *change of level*: keeping the
 *    waypoint before a jump but not the one after it, and re-deriving height cell by cell while
 *    checking a leg, which follows a straight line down through the ceiling of the tunnel below. A
 *    jump is now its own short, steep leg, and a leg is checked along the line that gets drawn.
 *
 * Two guards fall out of (3). A cell too far from any drawn line **at the height being walked** is
 * refused (`MAX_INK_CELLS`, `INK_SLICE`), since a dungeon has no floor 24 units from every wall —
 * that's rock, reached by leaking around one of the map's unclosed wall ends (10% of Blackburrow's
 * endpoints are loose). Measuring that in plan alone was a real bug and a subtle one: on a stacked
 * zone every column has ink *somewhere*, so the guard did nothing in the one place it was written
 * for, and routes struck out 250 units across bedrock that merely had a tunnel above it. And how far
 * a route ran from the ink is reported as confidence, because a route through rock is the one failure
 * this approach cannot rule out.
 *
 * Two signals deliberately unused. **`detectFloors`**: Blackburrow declares no floors at all. Nor
 * does any of this conflict with
 * [ADR 0040](../../../specs/decisions/0040-floors-come-from-the-mapmaker.md), which refuses to
 * *present* guessed storeys to the user: nothing here is named or shown as a floor, and declining to
 * step 100 units down claims nothing about the zone.
 *
 * **Colour** is the interesting one, and it is held in reserve rather than dismissed. It is not a
 * level code — nine of Blackburrow's fifteen segment colours span more than 40 units of height — but
 * *locally* it does separate stacked structure: where one plan column holds geometry at two very
 * different heights, the low and high groups wear disjoint colours in 81% of Blackburrow's 390 such
 * columns (the lake below in blue, the tunnels above in magenta). It's unused because the routes that
 * seemed to need it were in fact being spoiled by the two bugs above, and with those fixed only 0.2%
 * of sampled route length runs outside the corridor. It is the next lever, at 81% reliability, if
 * particular zones still misbehave.
 */

import { poiKind } from "./poi-kinds";
import type { EqMap, MapSegment } from "./eqmap";

/** A step on a suggested route: a world position, with the height it's at. */
export interface RouteStep {
  y: number;
  x: number;
  z: number;
}

/** Why a route couldn't be found, in words a panel can show as-is. */
export type RouteFailure =
  | "no-geometry"
  | "start-off-map"
  | "goal-off-map"
  | "start-blocked"
  | "goal-blocked"
  | "unreachable"
  | "gave-up"
  | "terrain-map";

/**
 * How much to believe a route. A map that draws sealed corridors gives a trustworthy one; a map
 * whose lines are contours gives a plausible-looking lie, and the difference is measurable — see
 * {@link routeConfidence}.
 */
export type RouteConfidence = "likely" | "rough" | "doubtful";

export interface Route {
  steps: RouteStep[];
  /** Ground distance in EQ units, summed along the steps (ignores height). */
  distance: number;
  confidence: RouteConfidence;
  /** What made it doubtful, if anything — shown so the guess is legible rather than silent. */
  notes: string[];
}

export type RouteResult = { ok: true; route: Route } | { ok: false; reason: RouteFailure };

// ── Tuning ────────────────────────────────────────────────────────────────────────────────────
// Every number here was picked against real files, and its comment says which observation.

/**
 * The finest grid resolution, in EQ units. Blackburrow's median segment is 14 units long and 454 of
 * its 1,419 segments are shorter than 10, so a 10-unit cell would swallow a third of the detail —
 * including the walls that make a corridor a corridor. 4 keeps them, and that zone comes out
 * 224 × 153.
 */
const MIN_CELL = 4;

/**
 * The most cells a grid may span in either direction. A zone's *size* varies by two orders of
 * magnitude — Blackburrow is 880 units across, East Karana 9,500 — and at a fixed 4 units East
 * Karana would be 2,389 × 1,978 cells, which is 226MB of wall intervals for a map whose lines
 * aren't walls anyway. Beyond this the cell grows instead, so cost is bounded by the *detail* a
 * dungeon needs rather than by the largest zone in the game.
 */
const MAX_GRID_SIDE = 600;

/** Two heights this close are telling us the same thing, and are merged. */
const WALL_GAP = 8;

/** A wall blocks a height within this of the wall itself. */
const BLOCK_TOL = 6;

/**
 * How much a single step between adjacent cells may change your height, up **or** down.
 *
 * Symmetric on purpose, and the asymmetric version was a real bug worth recording: with a tight
 * climb limit (10) and a loose drop (40), every descending tunnel in Blackburrow became one-way
 * downhill, and "route me back to the exit" could not be answered at all. The cause is
 * discretisation, not physics — {@link floorNear} snaps to whichever floor the nearby walls
 * evidence, so a smooth ramp arrives as a series of jumps larger than any real gradient.
 *
 * It's safe to be generous here because this limit isn't what stops a route scaling a wall — the
 * wall does, by blocking every height it spans (see {@link RouteGrid}). What remains is a cap on
 * absurdity: a 40-unit drop is survivable, and descents are charged more than climbs, so a route
 * still prefers the ramp it can walk.
 */
const MAX_STEP = 40;

/** Extra cost per unit of descent, so a drop is a last resort rather than a free shortcut. */
const DROP_PENALTY = 0.5;

/** Extra cost per unit of climb. Cheaper than a drop: a ramp you can walk up is a normal route. */
const CLIMB_PENALTY = 0.2;

/**
 * A height change bigger than a step is a *jump* — a ladder, a shaft, a labelled drop — and is
 * called out as a change of level rather than treated as walking.
 */
const JUMP = MAX_STEP;

/**
 * How far from the nearest drawn line a route may stray, in cells — measured **at the height it's
 * walking at** (see {@link INK_SLICE}). Beyond this you're in the rock between two tunnels, reached
 * by leaking around one of the map's unclosed wall ends.
 *
 * Six cells (24 units) was measured, not chosen. Over 36 routes across six dungeons, sampled every
 * 8 units and asked how far the drawn line sat from any geometry at its own height:
 *
 *     10 cells, ±1 slice   11.8% of samples adrift (>40u)   29 routes found
 *      8 cells, ±1 slice    4.8%                            29
 *      6 cells, ±1 slice    1.0%                            29
 *      6 cells,  exact      0.2%                            30
 *      5 cells,  exact      0.1%                            30
 *
 * Tightening it *found more routes*, not fewer, which is the tell that the slack wasn't buying
 * reach — it was letting the search cut corners through rock and then get stuck out there.
 */
const MAX_INK_CELLS = 6;

/**
 * How tall a slice the "is there corridor here?" measurement is taken in.
 *
 * This has to be **per height**, not per plan cell, and getting that wrong was a real bug: measured
 * in plan alone, every column of a zone stacked over itself has ink *somewhere*, so the guard did
 * nothing in exactly the place it was written for. Routes stayed within 6 units of geometry for most
 * of their length and then struck out 250 units across solid rock, because the rock had a tunnel
 * above it.
 */
const INK_SLICE = 8;

/** A ceiling on the slices, so a very tall zone widens its slices rather than growing without end. */
const MAX_INK_SLICES = 48;

/** Beyond this mean distance from the ink, a route is crossing more blank map than corridor. */
const OPEN_GROUND_CELLS = 5;

/**
 * Drawn line per unit of map area, dividing zones whose lines are walls from zones whose lines are
 * scenery. Both are read off the corpus — 567 of Brewall's maps, with 54 hand-labelled:
 *
 *     dungeons (n=22)   min 0.0046   median 0.0294   max 0.1179
 *     towns    (n=12)   min 0.0077   median 0.0164   max 0.0381
 *     outdoors (n=20)   min 0.0007   median 0.0026   max 0.0054
 *
 * The outdoor zones stop at 0.0054 and the dungeons start (bar one) at 0.0133, so `SPARSE_INK` sits
 * in that gap: every open zone measured falls below it. The one dungeon that does too is
 * `solrotower` at 0.0046 — Solusek's tower is tall and thin, so almost nothing of it shows in plan,
 * and calling its routes doubtful is the right answer for the right reason.
 */
const DENSE_INK = 0.02;
const SPARSE_INK = 0.006;

/**
 * How finely height is tracked in the search state. A cell revisited at a height within this of one
 * already seen isn't a new place to be — without the quantisation, a ramp would mint an unbounded
 * number of states per cell.
 */
const HEIGHT_STEP = 4;

/** How far a start or goal may be nudged to find somewhere you could stand, in cells. */
const SNAP_CELLS = 8;

/** Arriving this close to the goal's height counts as arriving. */
const GOAL_Z_TOL = 12;

/**
 * How many places the search will consider before giving up, as a multiple of the grid's cells and
 * clamped to the range below.
 *
 * A route is asked for on a click, so a bounded answer beats an unbounded one. It scales with the
 * map because the two failures it has to tell apart are different sizes: on a small map, exhausting
 * the space is how "these two places genuinely aren't connected" is *proved* (Kurn's Tower draws its
 * eight floors side by side, so most pairs really are unreachable), while on a large one no budget
 * would prove it and giving up is the only honest answer.
 */
const EXPANSIONS_PER_CELL = 8;
const MIN_EXPANSIONS = 60_000;
const MAX_EXPANSIONS = 150_000;

/**
 * How far from a label its permission reaches, in EQ units. A `Swim Out (Underwater)` marker sits at
 * the mouth of the route it names, not along all of it, so the opening has to be wide enough to be
 * found — but not so wide it dissolves the walls of the room it's in.
 */
const LABEL_RADIUS = 12;

/**
 * How far a way-up-or-down label's authority reaches in height. A marker's own z sits on one of the
 * two levels it joins, give or take how carefully it was placed.
 */
const LINK_REACH = 20;

/** How many separate walls, and how many floor heights, one cell may record. */
const MAX_BLOCKS = 6;
const MAX_FLOORS = 6;

/**
 * How steep a segment may be, in height per unit of plan distance, and still count as a wall
 * standing on a floor rather than a vertical face.
 *
 * Deliberately **not** derived from {@link MAX_STEP}: this is a claim about what the mapmaker drew,
 * not about what a route may do. At 2.5 (a touch under 70°) a wall following a descending corridor
 * still tells us where that corridor's floor is, while Blackburrow's waterfall shaft — 178 units
 * inside two cells — does not, and is read as the face it is.
 */
const MAX_FLOOR_SLOPE = 2.5;

// ── The lines ─────────────────────────────────────────────────────────────────────────────────

/**
 * The map's lines, rasterized. **Not** a walkable set — see the note at the top of this file about
 * why one can't be precomputed. Built once per map and reused across routes, because rasterizing is
 * the expensive part and a panel asks for a route far more often than the zone changes.
 *
 * Each cell records two different things, and conflating them is the biggest trap in this data:
 *
 * - **blocks** — height *intervals* something was drawn across. A wall stops you at the height it
 *   stands at; a vertical face stops you at every height it spans. An interval rather than a list
 *   because Blackburrow's waterfall shaft drops 178 units inside two cells.
 * - **floors** — heights that are evidence of walkable floor, taken only from segments gentle
 *   enough to be following one. Read the shaft's interpolated heights as floors instead and they
 *   become a staircase the search ratchets down, which is how a route ends up flying from the
 *   zone-in to the bottom of the lake in a straight line.
 */
export interface RouteGrid {
  cols: number;
  rows: number;
  /** EQ units per cell — `MIN_CELL` for anything dungeon-sized, coarser for a whole landscape. */
  cell: number;
  minX: number;
  minY: number;
  /** `blocks[cell * MAX_BLOCKS * 2 + i * 2]` low, `+ 1` high; `blockCount` intervals per cell. */
  blocks: Float32Array;
  blockCount: Uint8Array;
  /** `floors[cell * MAX_FLOORS + i]` — floor heights per cell, `floorCount` of them. */
  floors: Float32Array;
  floorCount: Uint8Array;
  /** A label says you may pass here even though a line was drawn through it. */
  passable: Uint8Array;
  /**
   * The height of the label saying you can change level here — a ladder, a shaft, a swim down —
   * or `NaN` where there is none.
   *
   * The height matters, not just the fact: a label knows about its own level and no other, so in a
   * zone stacked three deep a `Ladder Down` at the top authorises the first descent and says nothing
   * about the one below it. Where two such labels overlap, the first wins; they're within a few
   * units of each other in practice (Blackburrow's two `Swim Out` markers sit 12 apart).
   */
  linkZ: Float32Array;
  /**
   * Cells to the nearest drawn line **at a given height**, capped — the measure of "is this corridor,
   * or the bedrock between two tunnels?". Indexed `inkDistance[slice * cells + cell]`; read it
   * through {@link inkCellsAway}, which also forgives the slice boundary.
   */
  inkDistance: Uint8Array;
  /** How the height range is sliced: `slice = floor((z - minZ) / sliceHeight)`, clamped. */
  slices: number;
  sliceHeight: number;
  /**
   * Drawn line per unit of map area — how densely this zone is inked, and the basis of
   * {@link routeConfidence}. Measured from the segments themselves rather than from the cells they
   * landed in, because a rasterized count isn't scale-invariant: coarsening the cell makes every
   * line cover more *area*, which would let a zone's believability change with nothing but the grid
   * resolution chosen for it.
   */
  inkPerArea: number;
  /** The height range the geometry covers, which bounds the search's height buckets. */
  minZ: number;
  maxZ: number;
}

const colOf = (grid: RouteGrid, x: number) => Math.floor((x - grid.minX) / grid.cell);
const rowOf = (grid: RouteGrid, y: number) => Math.floor((y - grid.minY) / grid.cell);
const inBounds = (grid: RouteGrid, col: number, row: number) =>
  col >= 0 && col < grid.cols && row >= 0 && row < grid.rows;

/** The eight plan neighbours. Changing level happens in place — see {@link linkMoves}. */
const NEIGHBOURS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
];

export function buildRouteGrid(map: EqMap): RouteGrid | undefined {
  if (!map.segments.length) return undefined;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const s of map.segments) {
    minX = Math.min(minX, s.x1, s.x2);
    maxX = Math.max(maxX, s.x1, s.x2);
    minY = Math.min(minY, s.y1, s.y2);
    maxY = Math.max(maxY, s.y1, s.y2);
    minZ = Math.min(minZ, s.z1, s.z2);
    maxZ = Math.max(maxZ, s.z1, s.z2);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(minZ)) return undefined;

  // Fine enough for a dungeon's detail, coarse enough that a landscape doesn't cost hundreds of MB.
  const span = Math.max(maxX - minX, maxY - minY);
  const cell = Math.max(MIN_CELL, Math.ceil(span / MAX_GRID_SIDE));
  // One cell of margin, so a wall on the boundary has an outside to be a wall against.
  const cols = Math.ceil((maxX - minX) / cell) + 3;
  const rows = Math.ceil((maxY - minY) / cell) + 3;
  const cells = cols * rows;

  const grid: RouteGrid = {
    cols,
    rows,
    cell,
    minX: minX - cell,
    minY: minY - cell,
    blocks: new Float32Array(cells * MAX_BLOCKS * 2),
    blockCount: new Uint8Array(cells),
    floors: new Float32Array(cells * MAX_FLOORS),
    floorCount: new Uint8Array(cells),
    passable: new Uint8Array(cells),
    linkZ: new Float32Array(cells).fill(NaN),
    inkDistance: new Uint8Array(0), // sized by measureInkDistance, once the height range is sliced
    slices: 1,
    sliceHeight: 1,
    inkPerArea: 0,
    minZ,
    maxZ,
  };

  let inkLength = 0;
  for (const seg of map.segments) inkLength += Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1);
  grid.inkPerArea = inkLength / Math.max(1, (maxX - minX) * (maxY - minY));

  rasterize(grid, map.segments);
  markLabels(grid, map);
  measureInkDistance(grid);
  return grid;
}

function rasterize(grid: RouteGrid, segments: readonly MapSegment[]): void {
  for (const seg of segments) {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const dz = seg.z2 - seg.z1;
    const run = Math.hypot(dx, dy);
    // A segment with no plan length at all is pure vertical face: all block, no floor.
    const gentle = run > 0 && Math.abs(dz) / run <= MAX_FLOOR_SLOPE;
    // Sampled by plan distance *and* by height: half a cell so a diagonal can't skip a corner and
    // leave a gap to leak through, and one `WALL_GAP` of height so a steep face lands as a single
    // continuous interval rather than a ladder of separate walls.
    const steps = Math.max(1, Math.ceil(run / (grid.cell / 2)), Math.ceil(Math.abs(dz) / WALL_GAP));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const col = colOf(grid, seg.x1 + dx * t);
      const row = rowOf(grid, seg.y1 + dy * t);
      if (!inBounds(grid, col, row)) continue;
      const at = row * grid.cols + col;
      const z = seg.z1 + dz * t;
      addBlock(grid, at, z);
      // A steep face still stands on something — its low end — but only there.
      if (gentle) addFloor(grid, at, z);
      else if (i === 0 || i === steps) addFloor(grid, at, Math.min(seg.z1, seg.z2));
    }
  }
}

/** Record a wall at a height, growing the interval it belongs to rather than adding another. */
function addBlock(grid: RouteGrid, at: number, z: number): void {
  const n = grid.blockCount[at];
  const base = at * MAX_BLOCKS * 2;
  for (let i = 0; i < n; i++) {
    const lo = grid.blocks[base + i * 2];
    const hi = grid.blocks[base + i * 2 + 1];
    if (z >= lo - WALL_GAP && z <= hi + WALL_GAP) {
      grid.blocks[base + i * 2] = Math.min(lo, z);
      grid.blocks[base + i * 2 + 1] = Math.max(hi, z);
      return;
    }
  }
  if (n >= MAX_BLOCKS) {
    // Out of room: widen the nearest interval rather than forget the wall. Forgetting one lets a
    // route walk through it, which is the worse error.
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < n; i++) {
      const gap = Math.min(Math.abs(grid.blocks[base + i * 2] - z), Math.abs(grid.blocks[base + i * 2 + 1] - z));
      if (gap < bestGap) {
        bestGap = gap;
        best = i;
      }
    }
    grid.blocks[base + best * 2] = Math.min(grid.blocks[base + best * 2], z);
    grid.blocks[base + best * 2 + 1] = Math.max(grid.blocks[base + best * 2 + 1], z);
    return;
  }
  grid.blocks[base + n * 2] = z;
  grid.blocks[base + n * 2 + 1] = z;
  grid.blockCount[at] = n + 1;
}

/** Record floor evidence at a height, merging heights too close to be separate floors. */
function addFloor(grid: RouteGrid, at: number, z: number): void {
  const n = grid.floorCount[at];
  const base = at * MAX_FLOORS;
  for (let i = 0; i < n; i++) {
    if (Math.abs(grid.floors[base + i] - z) <= WALL_GAP) {
      // Keep the lowest: a wall stands on its floor, so its low end is where you'd be.
      grid.floors[base + i] = Math.min(grid.floors[base + i], z);
      return;
    }
  }
  if (n >= MAX_FLOORS) return;
  grid.floors[base + n] = z;
  grid.floorCount[at] = n + 1;
}

/** Is something drawn across this height here? Then you can't be standing in it. */
function blocked(grid: RouteGrid, at: number, z: number): boolean {
  if (grid.passable[at]) return false;
  const n = grid.blockCount[at];
  const base = at * MAX_BLOCKS * 2;
  for (let i = 0; i < n; i++) {
    if (z >= grid.blocks[base + i * 2] - BLOCK_TOL && z <= grid.blocks[base + i * 2 + 1] + BLOCK_TOL) return true;
  }
  return false;
}

/**
 * The floor height to adopt on entering a cell: the nearest floor evidence around it that's within
 * one step of where you already are, or the height you came in with when there's nothing nearby to
 * go by (the middle of a wide room, where no wall is drawn).
 *
 * This is what keeps the levels apart. Walking at z 0 in a corridor drawn over one at z −100, the
 * floor 100 units below is out of reach, so it can't pull you down into it.
 */
function floorNear(grid: RouteGrid, col: number, row: number, from: number): number {
  let best = from;
  let bestGap = Infinity;
  for (const [dc, dr] of [[0, 0], ...NEIGHBOURS]) {
    const c = col + dc;
    const r = row + dr;
    if (!inBounds(grid, c, r)) continue;
    const at = r * grid.cols + c;
    const base = at * MAX_FLOORS;
    for (let i = 0; i < grid.floorCount[at]; i++) {
      const z = grid.floors[base + i];
      if (z - from > MAX_STEP || from - z > MAX_STEP) continue;
      const gap = Math.abs(z - from);
      if (gap < bestGap) {
        bestGap = gap;
        best = z;
      }
    }
  }
  return best;
}

/** Every cell within a label's reach. */
function nearLabel(grid: RouteGrid, x: number, y: number): number[] {
  const reach = Math.max(1, Math.ceil(LABEL_RADIUS / grid.cell));
  const c0 = colOf(grid, x);
  const r0 = rowOf(grid, y);
  const out: number[] = [];
  for (let dr = -reach; dr <= reach; dr++) {
    for (let dc = -reach; dc <= reach; dc++) {
      if (Math.hypot(dc, dr) > reach) continue;
      if (!inBounds(grid, c0 + dc, r0 + dr)) continue;
      out.push((r0 + dr) * grid.cols + c0 + dc);
    }
  }
  return out;
}

/**
 * Where labels say there's a way through, and where they say there's a way *down*. `poiKind`
 * already recognises both — `passage` covers swim/climb/drop/ladder/stairs/one-way, `zoneline` the
 * exits, `door` the doors — so this reuses that classifier rather than reading labels again.
 *
 * Only `passage` marks a **link**, because only it describes going up or down; a door is a hole in a
 * wall you walk through on the level.
 *
 * Traps are deliberately neither. Blackburrow's `TRAP: Fake Floor` is a hole you fall through, and
 * it *is* a way down, but routing someone into a trap because it's a shortcut is a suggestion no one
 * asked for.
 */
function markLabels(grid: RouteGrid, map: EqMap): void {
  for (const poi of map.pois) {
    const kind = poiKind(poi.label);
    if (kind !== "passage" && kind !== "zoneline" && kind !== "door") continue;
    for (const at of nearLabel(grid, poi.x, poi.y)) {
      grid.passable[at] = 1;
      if (kind === "passage" && Number.isNaN(grid.linkZ[at])) grid.linkZ[at] = poi.z;
    }
  }
}

/**
 * How many cells each cell is from the nearest drawn line, **per height slice**: one multi-source
 * BFS per slice, seeded from the geometry that reaches that slice, capped at
 * {@link MAX_INK_CELLS} + 1.
 *
 * A wall standing at z 0 says "there is corridor here, at z 0". It says nothing about z -100, and
 * measuring it as though it did is what let routes cut across bedrock.
 */
function measureInkDistance(grid: RouteGrid): void {
  const cells = grid.cols * grid.rows;
  const span = Math.max(1, grid.maxZ - grid.minZ);
  grid.slices = Math.max(1, Math.min(MAX_INK_SLICES, Math.ceil(span / INK_SLICE)));
  grid.sliceHeight = span / grid.slices;
  const cap = MAX_INK_CELLS + 1;
  grid.inkDistance = new Uint8Array(cells * grid.slices).fill(cap);

  const sliceOf = (z: number) => {
    const i = Math.floor((z - grid.minZ) / grid.sliceHeight);
    return i < 0 ? 0 : i >= grid.slices ? grid.slices - 1 : i;
  };

  for (let slice = 0; slice < grid.slices; slice++) {
    const base = slice * cells;
    const queue: number[] = [];
    for (let at = 0; at < cells; at++) {
      // A wall spans heights, so it seeds every slice it reaches: a shaft wall really does mean
      // "there is structure here" at each level it passes.
      const bb = at * MAX_BLOCKS * 2;
      let touches = false;
      for (let i = 0; i < grid.blockCount[at] && !touches; i++) {
        if (sliceOf(grid.blocks[bb + i * 2]) <= slice && sliceOf(grid.blocks[bb + i * 2 + 1]) >= slice) {
          touches = true;
        }
      }
      if (!touches) continue;
      grid.inkDistance[base + at] = 0;
      queue.push(at);
    }
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head];
      const d = grid.inkDistance[base + at];
      if (d >= cap - 1) continue;
      const col = at % grid.cols;
      const row = (at - col) / grid.cols;
      for (const [dc, dr] of NEIGHBOURS) {
        const c = col + dc;
        const r = row + dr;
        if (!inBounds(grid, c, r)) continue;
        const next = r * grid.cols + c;
        if (grid.inkDistance[base + next] <= d + 1) continue;
        grid.inkDistance[base + next] = d + 1;
        queue.push(next);
      }
    }
  }
}

/**
 * How far this cell is from drawn geometry at this height.
 *
 * Only the height's own slice counts. Reading the neighbouring slices as well seemed like harmless
 * forgiveness for a wall sitting just the wrong side of a boundary, and it cost a factor of five in
 * accuracy — ±1 slice is ±8 units of extra licence at every step, which compounds along a leg into
 * a line that drifts out of the corridor entirely.
 */
export function inkCellsAway(grid: RouteGrid, at: number, z: number): number {
  const cells = grid.cols * grid.rows;
  // Clamped, not skipped: the geometry's own top and bottom land exactly on a boundary, and the
  // highest walkable height in a zone is often precisely `maxZ` — which without this reads as "no
  // slice", i.e. "not corridor", and refuses to route along a zone's top floor at all.
  const raw = Math.floor((z - grid.minZ) / grid.sliceHeight);
  const slice = raw < 0 ? 0 : raw >= grid.slices ? grid.slices - 1 : raw;
  return grid.inkDistance[slice * cells + at];
}

// ── Search ────────────────────────────────────────────────────────────────────────────────────

/** Somewhere you could be standing: a cell, and how high up in it. */
interface Place {
  at: number;
  z: number;
}

/** What a height change adds to a step: cheap to walk up a ramp, dear to drop off something. */
const heightPenalty = (dz: number) => (dz >= 0 ? dz * CLIMB_PENALTY : -dz * DROP_PENALTY);

/**
 * A binary heap. A sorted-array open set is O(n) per insert and Blackburrow's grid runs to 34,000
 * cells, which turns a route into a visible pause.
 */
class Heap {
  private keys: number[] = [];
  private costs: number[] = [];

  get size(): number {
    return this.keys.length;
  }

  push(key: number, cost: number): void {
    this.keys.push(key);
    this.costs.push(cost);
    let i = this.keys.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.costs[parent] <= this.costs[i]) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  pop(): number | undefined {
    if (!this.keys.length) return undefined;
    const top = this.keys[0];
    const lastKey = this.keys.pop() as number;
    const lastCost = this.costs.pop() as number;
    if (this.keys.length) {
      this.keys[0] = lastKey;
      this.costs[0] = lastCost;
      let i = 0;
      for (;;) {
        const left = i * 2 + 1;
        const right = left + 1;
        let best = i;
        if (left < this.keys.length && this.costs[left] < this.costs[best]) best = left;
        if (right < this.keys.length && this.costs[right] < this.costs[best]) best = right;
        if (best === i) break;
        this.swap(best, i);
        i = best;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.costs[a], this.costs[b]] = [this.costs[b], this.costs[a]];
  }
}

/**
 * Somewhere near this position you could actually be standing, searched outward by ring and, within
 * a ring, by how close it is to the height asked for — being on the wrong level is a worse error
 * than being a few units out in plan, and a stacked zone makes both possible.
 *
 * A `/loc` lands where it lands, often within a couple of units of a wall, and Blackburrow's
 * `GS: Silver Ring` sits at z −228 when the geometry bottoms out at −178. Refusing to route because
 * the position given isn't already standable would be pedantry.
 */
function snap(grid: RouteGrid, to: RouteStep): Place | undefined {
  const col = colOf(grid, to.x);
  const row = rowOf(grid, to.y);
  for (let ring = 0; ring <= SNAP_CELLS; ring++) {
    let best: Place | undefined;
    let bestGap = Infinity;
    for (let dr = -ring; dr <= ring; dr++) {
      for (let dc = -ring; dc <= ring; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const c = col + dc;
        const r = row + dr;
        if (!inBounds(grid, c, r)) continue;
        const at = r * grid.cols + c;
        // The floor here, if the map says anything about one, else the height we were given.
        const z = floorNear(grid, c, r, to.z);
        if (blocked(grid, at, z)) continue;
        if (inkCellsAway(grid, at, z) > MAX_INK_CELLS) continue;
        const gap = Math.abs(z - to.z);
        if (gap < bestGap) {
          bestGap = gap;
          best = { at, z };
        }
      }
    }
    if (best) return best;
  }
  return undefined;
}

const onMap = (grid: RouteGrid, at: RouteStep) => inBounds(grid, colOf(grid, at.x), rowOf(grid, at.y));

/**
 * A suggested walking route from `start` to `goal`, or why there isn't one.
 *
 * The state is a cell plus a height, quantised by `HEIGHT_STEP` so a ramp can't mint unbounded
 * states. Height is *carried*: entering a cell, the search adopts the nearest floor the walls
 * around it evidence, which is what stops a corridor from falling into the one below it.
 */
export function findRoute(grid: RouteGrid | undefined, start: RouteStep, goal: RouteStep): RouteResult {
  if (!grid) return { ok: false, reason: "no-geometry" };
  // Refused up front rather than searched: on a map whose lines are terrain there's no corridor to
  // follow and no wall to be stopped by, so a search would spend its whole budget to conclude
  // nothing. Saying so immediately is both faster and more honest.
  if (routeConfidence(grid) === "doubtful") return { ok: false, reason: "terrain-map" };
  if (!onMap(grid, start)) return { ok: false, reason: "start-off-map" };
  if (!onMap(grid, goal)) return { ok: false, reason: "goal-off-map" };

  const from = snap(grid, start);
  if (!from) return { ok: false, reason: "start-blocked" };
  const to = snap(grid, goal);
  if (!to) return { ok: false, reason: "goal-blocked" };

  const buckets = Math.max(1, Math.ceil((grid.maxZ - grid.minZ) / HEIGHT_STEP) + 3);
  const bucketOf = (z: number) => {
    const b = Math.round((z - grid.minZ) / HEIGHT_STEP) + 1;
    return b < 0 ? 0 : b >= buckets ? buckets - 1 : b;
  };
  const keyOf = (p: Place) => p.at * buckets + bucketOf(p.z);

  const goalCol = to.at % grid.cols;
  const goalRow = (to.at - goalCol) / grid.cols;
  const heuristic = (at: number) => {
    const col = at % grid.cols;
    return Math.hypot((goalCol - col) * grid.cell, (goalRow - (at - col) / grid.cols) * grid.cell);
  };

  const cameFrom = new Map<number, number>();
  const placeOf = new Map<number, Place>();
  const bestCost = new Map<number, number>();
  const open = new Heap();
  const startKey = keyOf(from);
  placeOf.set(startKey, from);
  bestCost.set(startKey, 0);
  open.push(startKey, heuristic(from.at));

  const budget = Math.min(
    MAX_EXPANSIONS,
    Math.max(MIN_EXPANSIONS, grid.cols * grid.rows * EXPANSIONS_PER_CELL),
  );
  let endKey: number | undefined;
  let expansions = 0;
  while (open.size) {
    if (++expansions > budget) return { ok: false, reason: "gave-up" };
    const key = open.pop() as number;
    const here = placeOf.get(key) as Place;
    if (here.at === to.at && Math.abs(here.z - to.z) <= GOAL_Z_TOL) {
      endKey = key;
      break;
    }
    const cost = bestCost.get(key) as number;
    const col = here.at % grid.cols;
    const row = (here.at - col) / grid.cols;

    const relax = (next: Place, step: number) => {
      const nextKey = keyOf(next);
      const nextCost = cost + step;
      if (nextCost >= (bestCost.get(nextKey) ?? Infinity)) return;
      bestCost.set(nextKey, nextCost);
      placeOf.set(nextKey, next);
      cameFrom.set(nextKey, key);
      open.push(nextKey, nextCost + heuristic(next.at));
    };

    // Walking: to a plan neighbour, adopting the floor the walls there evidence.
    for (const [dc, dr] of NEIGHBOURS) {
      const c = col + dc;
      const r = row + dr;
      if (!inBounds(grid, c, r)) continue;
      const at = r * grid.cols + c;
      const z = floorNear(grid, c, r, here.z);
      const dz = z - here.z;
      if (dz > MAX_STEP || -dz > MAX_STEP) continue;
      if (blocked(grid, at, z)) continue;
      // Nothing drawn near here *at this height* is bedrock between two tunnels, not floor — and it
      // has to be measured per height, because in plan alone a stacked zone always has ink somewhere.
      if (inkCellsAway(grid, at, z) > MAX_INK_CELLS) continue;
      relax({ at, z }, Math.hypot(dc * grid.cell, dr * grid.cell) + heightPenalty(dz));
    }
    // Changing level in place, where a label says there's a way up or down.
    for (const z of linkMoves(grid, here)) {
      relax({ at: here.at, z }, Math.abs(z - here.z) + heightPenalty(z - here.z));
    }
  }
  if (endKey === undefined) return { ok: false, reason: "unreachable" };

  const path: Place[] = [];
  for (let key: number | undefined = endKey; key !== undefined; key = cameFrom.get(key)) {
    path.push(placeOf.get(key) as Place);
    if (key === startKey) break;
  }
  path.reverse();

  const steps = smooth(grid, path).map((p) => {
    const col = p.at % grid.cols;
    return {
      x: grid.minX + (col + 0.5) * grid.cell,
      y: grid.minY + ((p.at - col) / grid.cols + 0.5) * grid.cell,
      z: p.z,
    };
  });
  // The endpoints are what was asked for; the grid is our approximation of them, not the answer.
  if (steps.length) {
    steps[0] = { ...start };
    steps[steps.length - 1] = { ...goal };
  }

  return { ok: true, route: { steps, distance: groundLength(steps), ...verdict(grid, path) } };
}

/**
 * The heights a label lets you move to without leaving this cell — the other floors evidenced
 * around it. This is where a label outranks the geometry: the map drew a 178-unit shaft and wrote
 * `Swim Out (Underwater)` beside it, and the words are the better evidence, so the stride and drop
 * limits don't apply.
 */
function linkMoves(grid: RouteGrid, here: Place): number[] {
  const linkZ = grid.linkZ[here.at];
  if (Number.isNaN(linkZ)) return [];
  // The label vouches for its own level. A jump has to touch that level at one end or the other —
  // arriving at it, or leaving from it — so one marker can't authorise a descent past itself.
  const authorised = (z: number) =>
    Math.abs(here.z - linkZ) <= LINK_REACH || Math.abs(z - linkZ) <= LINK_REACH;
  const col = here.at % grid.cols;
  const row = (here.at - col) / grid.cols;
  // Only the next floor up and the next one down: a ladder takes you to the level below, not past
  // it to the one under that. Without this, one label in a zone stacked three deep authorises the
  // whole descent.
  let below: number | undefined;
  let above: number | undefined;
  for (const [dc, dr] of [[0, 0], ...NEIGHBOURS]) {
    const c = col + dc;
    const r = row + dr;
    if (!inBounds(grid, c, r)) continue;
    const at = r * grid.cols + c;
    const base = at * MAX_FLOORS;
    for (let i = 0; i < grid.floorCount[at]; i++) {
      const z = grid.floors[base + i];
      if (Math.abs(z - here.z) <= JUMP) continue; // a step, not a link
      if (blocked(grid, here.at, z)) continue;
      if (!authorised(z)) continue;
      if (z < here.z) below = below === undefined ? z : Math.max(below, z);
      else above = above === undefined ? z : Math.min(above, z);
    }
  }
  return [below, above].filter((z): z is number => z !== undefined);
}

/**
 * Drop the places you don't need to be told about. A grid path is a staircase of single cells; what
 * a person wants is "go to that corner, then that one", so a place is kept only when the straight
 * line past it would cross something — the usual string-pull.
 */
function smooth(grid: RouteGrid, path: Place[]): Place[] {
  if (path.length <= 2) return path;
  const kept: Place[] = [path[0]];
  let anchor = 0;
  for (let i = 1; i < path.length; i++) {
    // A jump between levels gets **both** its ends kept: where you leave, and where you arrive.
    // Keeping only the near side let the far side be absorbed into the next straight run, and the
    // result was a single leg descending 101 units over 108 units of plan — a line drawn through
    // rock between two real places, which is what made routes read as nonsense.
    if (Math.abs(path[i].z - path[i - 1].z) > JUMP) {
      if (kept[kept.length - 1] !== path[i - 1]) kept.push(path[i - 1]);
      kept.push(path[i]);
      anchor = i;
      continue;
    }
    if (!clearLine(grid, path[anchor], path[i])) {
      kept.push(path[i - 1]);
      anchor = i - 1;
    }
  }
  const last = path[path.length - 1];
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}

/**
 * Can you walk straight between two places — checking **the line that will actually be drawn**?
 *
 * So height is interpolated linearly between the two ends, not re-derived cell by cell. Letting it
 * re-derive was subtly wrong and produced the worst routes in the corpus: tracking the local floor
 * as it went, the check would happily follow a straight line *down through the ceiling* of the
 * tunnel below, approving a shortcut that passed 263 units from any geometry at the height it
 * claimed to be at. The polyline is a straight line in three dimensions; that is the thing to
 * verify.
 */
function clearLine(grid: RouteGrid, a: Place, b: Place): boolean {
  // A change of level is a jump, never a walk — `smooth` keeps both its ends instead.
  if (Math.abs(b.z - a.z) > MAX_STEP) return false;
  const ac = a.at % grid.cols;
  const ar = (a.at - ac) / grid.cols;
  const bc = b.at % grid.cols;
  const br = (b.at - bc) / grid.cols;
  const steps = Math.max(1, Math.max(Math.abs(bc - ac), Math.abs(br - ar)) * 2);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const c = Math.round(ac + (bc - ac) * t);
    const r = Math.round(ar + (br - ar) * t);
    if (!inBounds(grid, c, r)) return false;
    const at = r * grid.cols + c;
    const z = a.z + (b.z - a.z) * t;
    if (blocked(grid, at, z)) return false;
    if (inkCellsAway(grid, at, z) > MAX_INK_CELLS) return false;
  }
  return true;
}

function groundLength(steps: RouteStep[]): number {
  let total = 0;
  for (let i = 1; i < steps.length; i++) {
    total += Math.hypot(steps[i].x - steps[i - 1].x, steps[i].y - steps[i - 1].y);
  }
  return Math.round(total);
}

/**
 * How much to believe *this* route, as opposed to this map. Two things are measurable and both
 * matter: how far the route ran from any drawn line (blank map is bedrock as often as it's floor),
 * and how much of it leaned on a label rather than on drawn corridor.
 */
function verdict(grid: RouteGrid, path: Place[]): { confidence: RouteConfidence; notes: string[] } {
  const notes: string[] = [];
  let confidence = routeConfidence(grid);
  if (confidence === "doubtful") {
    notes.push("This map's lines may be terrain rather than walls, so the route may cross open ground.");
  }

  const meanInk = path.reduce((sum, p) => sum + inkCellsAway(grid, p.at, p.z), 0) / Math.max(1, path.length);
  if (meanInk > OPEN_GROUND_CELLS) {
    notes.push("Much of this route crosses map the geometry says nothing about, so it may not be walkable.");
    confidence = confidence === "likely" ? "rough" : confidence;
  }

  const viaLabel = path.filter((p) => grid.passable[p.at] === 1).length;
  if (viaLabel > path.length / 3) {
    notes.push("Much of this route goes where a map label says there's a way through, not along drawn corridor.");
    if (confidence === "likely") confidence = "rough";
  }

  const jumps = path.filter((p, i) => i > 0 && Math.abs(p.z - path[i - 1].z) > JUMP).length;
  if (jumps) {
    notes.push(jumps === 1 ? "Includes a change of level." : `Includes ${jumps} changes of level.`);
  }
  return { confidence, notes };
}

/**
 * How enclosed a map is, which is the one measurable difference between a dungeon and a landscape.
 * A dungeon's lines are walls and they seal, so a fair fraction of the map carries ink. Outdoor
 * lines are contours and rivers — they cross the whole map without enclosing anything.
 *
 * Deliberately a coarse three-way answer rather than a number: it decides what the panel says about
 * a route, and the honest resolution here is "believe it / take it as a sketch / don't".
 */
export function routeConfidence(grid: RouteGrid): RouteConfidence {
  const ink = grid.inkPerArea;
  if (!ink) return "doubtful";
  // Thresholds read off the corpus: the sixteen dungeons measured sit above DENSE, the open zones of
  // Karana and the Feerrott below SPARSE, and the towns and sprawling ruins land in between.
  if (ink < SPARSE_INK) return "doubtful";
  return ink >= DENSE_INK ? "likely" : "rough";
}

/** Words for a failure, for a panel to show without inventing its own. */
export const ROUTE_FAILURES: Record<RouteFailure, string> = {
  "no-geometry": "This map has no geometry to route across.",
  "start-off-map": "Your last known position is outside this map.",
  "goal-off-map": "That destination is outside this map.",
  "start-blocked": "There's no walkable ground near your last known position.",
  "goal-blocked": "There's no walkable ground near that destination.",
  unreachable: "No route found — the drawn geometry doesn't connect these two places.",
  "gave-up": "Gave up looking for a route — try somewhere nearer, or a closer starting point.",
  "terrain-map":
    "This zone's map is drawn as terrain rather than walls, so there's nothing to work a walking route out from.",
};
