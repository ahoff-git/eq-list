/**
 * Black-box tests for suggested walking routes (pure). The arithmetic isn't the interesting part —
 * A* is A* — so these test the inferences the module makes about map data that never says what's
 * walkable: that a wall stops a route, that a gap lets it through, that a zone stacked on itself
 * doesn't let you walk through a ceiling, and that a label saying "Ladder" outranks the geometry
 * while one saying "TRAP" does not.
 *
 * Geometry is written directly in `/loc` space (what `parseEqMap` produces), so a test says where
 * a wall is without also negating coordinates in its head.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { EqMap, MapPoi, MapSegment } from "../../src/shared/map/eqmap";
import { buildRouteGrid, findRoute, routeConfidence, type RouteStep } from "../../src/shared/map/route";

/** A wall from (x1,y1) to (x2,y2) at one height. */
const wall = (x1: number, y1: number, x2: number, y2: number, z = 0): MapSegment => ({
  x1,
  y1,
  z1: z,
  x2,
  y2,
  z2: z,
});

/** Four walls enclosing a rectangle. */
const box = (x0: number, y0: number, x1: number, y1: number, z = 0): MapSegment[] => [
  wall(x0, y0, x1, y0, z),
  wall(x1, y0, x1, y1, z),
  wall(x1, y1, x0, y1, z),
  wall(x0, y1, x0, y0, z),
];

const poi = (x: number, y: number, z: number, label: string): MapPoi => ({ x, y, z, label, size: 2 });

const mapOf = (segments: MapSegment[], pois: MapPoi[] = []): EqMap => ({ segments, pois });

const at = (x: number, y: number, z = 0): RouteStep => ({ x, y, z });

/** Route or fail loudly — every ok-path test wants the route, not a union to unwrap. */
function route(map: EqMap, start: RouteStep, goal: RouteStep) {
  const result = findRoute(buildRouteGrid(map), start, goal);
  assert.equal(result.ok, true, `expected a route, got ${result.ok ? "" : result.reason}`);
  if (!result.ok) throw new Error("unreachable");
  return result.route;
}

function failure(map: EqMap, start: RouteStep, goal: RouteStep) {
  const result = findRoute(buildRouteGrid(map), start, goal);
  assert.equal(result.ok, false, "expected no route");
  if (result.ok) throw new Error("unreachable");
  return result.reason;
}

/** Where a route's polyline crosses a vertical line, so a test can check *which* gap it used. */
function crossingY(steps: RouteStep[], x: number): number | undefined {
  for (let i = 1; i < steps.length; i++) {
    const a = steps[i - 1];
    const b = steps[i];
    if (a.x === b.x) continue;
    if ((a.x - x) * (b.x - x) > 0) continue; // same side
    const t = (x - a.x) / (b.x - a.x);
    return a.y + (b.y - a.y) * t;
  }
  return undefined;
}

// ── Levels are local, not global ───────────────────────────────────────────────────────────────

test("a zone whose heights run continuously still keeps its levels apart", () => {
  // The reason levels can't be found by clustering the zone's heights: Blackburrow's histogram has
  // clear modes and no empty gaps between them — ramps and shaft walls fill every bucket. Here a
  // ramp beside the rooms touches *every* height from 0 to -100, so any global banding collapses to
  // one level; the two rooms must still be separate places.
  const map = mapOf([
    ...box(0, 0, 100, 100, 0),
    ...box(0, 0, 100, 100, -100),
    ...Array.from({ length: 21 }, (_, i) => wall(120, i * 5, 160, i * 5, -i * 5)),
  ]);
  assert.equal(failure(map, at(50, 50, 0), at(50, 50, -100)), "unreachable");
});

test("a vertical face is a wall, not a staircase of floors", () => {
  // Blackburrow's waterfall shaft drops 178 units inside two cells. Read as floor evidence it
  // becomes a ladder the search ratchets down, and a route flies from the zone-in to the bottom of
  // the lake in a straight line. Here the only thing joining two levels is one sheer drop.
  const map = mapOf([
    ...box(0, 0, 100, 100, 0),
    ...box(0, 0, 100, 100, -100),
    wall(50, 50, 50, 50, 0), // a zero-length vertical segment: all face, no floor
    { x1: 50, y1: 50, z1: 0, x2: 52, y2: 50, z2: -100 },
  ]);
  assert.equal(failure(map, at(25, 25, 0), at(25, 25, -100)), "unreachable");
});

// ── Walls stop routes, gaps let them through ──────────────────────────────────────────────────

test("routes down a corridor", () => {
  const map = mapOf([wall(0, 0, 200, 0), wall(0, 20, 200, 20)]);
  const r = route(map, at(10, 10), at(190, 10));
  // Straight down the middle: the ground distance is the corridor's length, not a detour.
  assert.ok(r.distance >= 180 && r.distance < 200, `distance ${r.distance}`);
  // The endpoints are what was asked for, not the grid's nearest cell.
  assert.deepEqual(r.steps[0], at(10, 10));
  assert.deepEqual(r.steps[r.steps.length - 1], at(190, 10));
});

test("crosses a dividing wall only where the wall has a gap", () => {
  const map = mapOf([
    ...box(0, 0, 100, 100),
    wall(50, 0, 50, 80), // sealed from the bottom to y=80; the gap is above it
  ]);
  const r = route(map, at(25, 20), at(75, 20));
  const crossed = crossingY(r.steps, 50);
  assert.ok(crossed !== undefined, "route never crosses the dividing wall");
  assert.ok(crossed > 78, `crossed the wall at y=${crossed}, which is through solid line`);
  // And it cost what the detour costs, rather than the 50 units a straight line would.
  assert.ok(r.distance > 130, `distance ${r.distance} is too short to have used the gap`);
});

test("two sealed rooms are unreachable from each other", () => {
  const map = mapOf([...box(0, 0, 40, 40), ...box(60, 0, 100, 40)]);
  assert.equal(failure(map, at(20, 20), at(80, 20)), "unreachable");
});

test("a straight run across open ground is reported as a straight run", () => {
  // String-pulling is the difference between "walk to that corner" and 60 single-cell steps.
  const r = route(mapOf(box(0, 0, 200, 200)), at(10, 10), at(190, 190));
  assert.ok(r.steps.length <= 4, `expected a handful of steps, got ${r.steps.length}`);
});

// ── Stacked levels ────────────────────────────────────────────────────────────────────────────

const stacked = (pois: MapPoi[] = []) =>
  mapOf(
    [
      wall(0, 0, 100, 0, 0),
      wall(0, 20, 100, 20, 0),
      wall(0, 0, 100, 0, -100),
      wall(0, 20, 100, 20, -100),
    ],
    pois,
  );

test("a tunnel stacked over another doesn't let you walk through the ceiling", () => {
  // The whole Blackburrow problem: identical geometry 100 units apart. In plan view these are
  // one corridor; they are not.
  assert.equal(failure(stacked(), at(10, 10, 0), at(90, 10, -100)), "unreachable");
});

test("a label naming a way down connects the levels", () => {
  const r = route(stacked([poi(90, 10, 0, "Ladder Down")]), at(10, 10, 0), at(90, 10, -100));
  const heights = r.steps.map((s) => s.z);
  assert.ok(Math.min(...heights) <= -100, "route never descends");
  assert.ok(Math.max(...heights) >= 0, "route never starts at the top");
  assert.ok(
    r.notes.some((n) => /change of level/i.test(n)),
    `expected the level change to be called out, got ${JSON.stringify(r.notes)}`,
  );
});

test("a trap is not a route, even though it is a way down", () => {
  // Blackburrow's `TRAP: Fake Floor` is a hole you fall through. It works. Don't suggest it.
  assert.equal(failure(stacked([poi(90, 10, 0, "TRAP: Fake Floor")]), at(10, 10, 0), at(90, 10, -100)), "unreachable");
});

test("only adjacent levels connect", () => {
  // Three levels, with a way down named on the top one only: you may reach the middle, never
  // the bottom.
  const map = mapOf(
    [
      wall(0, 0, 100, 0, 0),
      wall(0, 20, 100, 20, 0),
      wall(0, 0, 100, 0, -100),
      wall(0, 20, 100, 20, -100),
      wall(0, 0, 100, 0, -200),
      wall(0, 20, 100, 20, -200),
    ],
    [poi(90, 10, 0, "Ladder Down")],
  );
  route(map, at(10, 10, 0), at(90, 10, -100)); // one level down: fine
  assert.equal(failure(map, at(10, 10, 0), at(90, 10, -200)), "unreachable");
});

test("a change of level is drawn as a step, not a diagonal across the map", () => {
  // What made real routes read as nonsense: `smooth` kept the waypoint *before* a jump but not the
  // one after it, so the far side got absorbed into the next straight run. On Blackburrow that
  // produced a single leg descending 101 units over 108 units of plan — a line through solid rock
  // between two real places. A level change has to be its own short, steep leg.
  const r = route(stacked([poi(90, 10, 0, "Ladder Down")]), at(10, 10, 0), at(90, 10, -100));
  for (let i = 1; i < r.steps.length; i++) {
    const drop = Math.abs(r.steps[i].z - r.steps[i - 1].z);
    const plan = Math.hypot(r.steps[i].x - r.steps[i - 1].x, r.steps[i].y - r.steps[i - 1].y);
    if (drop > 40) {
      assert.ok(plan <= 20, `a ${Math.round(drop)}u level change is drawn across ${Math.round(plan)}u of plan`);
    }
  }
});

test("a route won't cross ground whose only geometry is on another level", () => {
  // The corridor guard has to be measured *per height*. Measured in plan alone it is no constraint
  // at all on a stacked zone — every column has ink somewhere — which is how routes came to strike
  // out hundreds of units across bedrock that merely had a tunnel underneath it.
  const map = mapOf([
    // Two sealed rooms at ground level, far apart, with nothing at all drawn between them...
    ...box(0, 0, 60, 60, 0),
    ...box(200, 0, 260, 60, 0),
    // ...except a corridor a hundred units below, running the whole way across.
    wall(0, 0, 260, 0, -100),
    wall(0, 60, 260, 60, -100),
  ]);
  assert.equal(failure(map, at(30, 30, 0), at(230, 30, 0)), "unreachable");
});

// ── Labels that open the way ───────────────────────────────────────────────────────────────────

test("a door in a sealed wall lets a route straight through", () => {
  const map = mapOf(
    [...box(0, 0, 100, 100), wall(50, 0, 50, 100)],
    [poi(50, 50, 0, "Locked Door (Picklock 200+)")],
  );
  const r = route(map, at(25, 50), at(75, 50));
  assert.ok(r.distance < 80, `distance ${r.distance} suggests it went around, not through`);
  const crossed = crossingY(r.steps, 50);
  assert.ok(crossed !== undefined && Math.abs(crossed - 50) < 14, `crossed at y=${crossed}, not at the door`);
});

test("a route leaning on labels rather than corridor says so", () => {
  const map = mapOf(
    [...box(0, 0, 100, 100), wall(50, 0, 50, 100)],
    [poi(50, 50, 0, "Swim Out (Underwater)")],
  );
  const r = route(map, at(45, 50), at(55, 50));
  assert.ok(
    r.notes.some((n) => /map label/i.test(n)),
    `expected the label reliance to be called out, got ${JSON.stringify(r.notes)}`,
  );
});

// ── Positions that don't quite land on open ground ─────────────────────────────────────────────

test("a position inside a wall is snapped to open ground rather than refused", () => {
  const map = mapOf([wall(0, 0, 200, 0), wall(0, 20, 200, 20)]);
  // Start exactly on the drawn wall — a `/loc` lands where it lands.
  const r = route(map, at(10, 0), at(190, 10));
  assert.ok(r.steps.length >= 2);
});

test("a destination outside the map is named as such", () => {
  const map = mapOf(box(0, 0, 100, 100));
  assert.equal(failure(map, at(50, 50), at(9000, 9000)), "goal-off-map");
  assert.equal(failure(map, at(-9000, -9000), at(50, 50)), "start-off-map");
});

test("a map with no geometry has no route", () => {
  assert.equal(findRoute(buildRouteGrid(mapOf([])), at(0, 0), at(1, 1)).ok, false);
  const result = findRoute(buildRouteGrid(mapOf([])), at(0, 0), at(1, 1));
  assert.equal(result.ok === false && result.reason, "no-geometry");
});

// ── How much to believe it ─────────────────────────────────────────────────────────────────────

test("an enclosed dungeon is believable, sparse terrain lines are not", () => {
  const dungeon = buildRouteGrid(mapOf([...box(0, 0, 200, 200), wall(100, 0, 100, 150)]));
  assert.ok(dungeon);
  assert.equal(routeConfidence(dungeon), "likely");

  // What an outdoor map looks like: a few long strokes over a wide area, enclosing nothing.
  const terrain = buildRouteGrid(
    mapOf([wall(0, 0, 1000, 1000), wall(0, 500, 1000, 400), wall(500, 0, 400, 1000)]),
  );
  assert.ok(terrain);
  assert.equal(routeConfidence(terrain), "doubtful");
});

test("a terrain map is refused outright rather than searched", () => {
  // Measured across 567 of Brewall's maps, every open zone is sparser than any dungeon. On one of
  // those there's no corridor to follow and no wall to be stopped by, so a route would be pure
  // invention — and saying so costs nothing, where searching costs the whole budget.
  const map = mapOf([wall(0, 0, 1000, 1000), wall(0, 500, 1000, 400), wall(500, 0, 400, 1000)]);
  assert.equal(failure(map, at(100, 300), at(900, 300)), "terrain-map");
});
