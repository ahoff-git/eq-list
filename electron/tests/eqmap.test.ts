/**
 * Black-box tests for the EverQuest map file format (pure). Two things matter here and both
 * are load-bearing: the file's coordinates are the negation of what `/loc` reports, and a
 * vector map calibrates itself — so feeding its projection to the ordinary coord maths puts
 * a world coordinate exactly where the geometry says it is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectFloors,
  floorAt,
  mapBounds,
  mergeEqMaps,
  parseEqMap,
  segmentOnFloor,
  vectorProjection,
} from "../../src/shared/map/eqmap";
import { eqToCanvasCoords } from "../../src/shared/map/coords";

/** A labelled point at a height, which is all floor detection reads. */
const at = (z: number, label: string) => `P 0, 0, ${z}, 0, 0, 0, 2, ${label.replace(/ /g, "_")}`;

test("parses geometry, negating x and y into /loc space", () => {
  const map = parseEqMap("L 100.0000, 200.0000, 15.0000, -300.5000, 400.0000, 16.0000, 100, 50, 0");
  assert.equal(map.segments.length, 1);
  assert.deepEqual(map.segments[0], {
    y1: -200,
    x1: -100,
    z1: 15,
    y2: -400,
    x2: 300.5,
    z2: 16,
    color: "rgb(100, 50, 0)",
  });
});

test("parses labelled points, with underscores as spaces", () => {
  const map = parseEqMap("P -1078.1000, 1571.3000, 8.0000, 0, 0, 240, 3, to_Butcherblock_Mountains");
  assert.deepEqual(map.pois, [
    { y: -1571.3, x: 1078.1, z: 8, label: "to Butcherblock Mountains", color: "rgb(0, 0, 240)", size: 3 },
  ]);
  // A label may contain commas — the split must not eat them.
  assert.equal(parseEqMap("P 0, 0, 0, 1, 2, 3, 2, Brewall,_Rainsinger").pois[0].label, "Brewall, Rainsinger");
});

test("pure black means 'no color given', not a black line", () => {
  // Most geometry is authored 0,0,0 and drawn in the game's own color; a black line on a
  // dark panel would be an invisible map, so the color is left for the renderer.
  assert.equal(parseEqMap("L 0, 0, 0, 1, 1, 0, 0, 0, 0").segments[0].color, undefined);
  assert.equal(parseEqMap("L 0, 0, 0, 1, 1, 0, 1, 0, 0").segments[0].color, "rgb(1, 0, 0)");
});

test("junk lines are skipped, not thrown on", () => {
  const map = parseEqMap(
    [
      "",
      "# a comment nobody documented",
      "L 1, 2", // truncated
      "L a, b, c, d, e, f, 0, 0, 0", // unparseable numbers
      "P 1, 2, 3, 0, 0, 0, 1, ", // no label
      "L 0, 0, 0, 10, 10, 0, 0, 0, 0", // the one good line
      "X 1, 2, 3",
    ].join("\n"),
  );
  assert.equal(map.segments.length, 1);
  assert.equal(map.pois.length, 0);
});

test("bounds come from geometry, and ignore a stray label outside it", () => {
  const map = parseEqMap(
    [
      "L 0, 0, 0, 100, 200, 5, 0, 0, 0",
      "P 9000, 9000, 0, 0, 0, 0, 2, Map_by_somebody",
    ].join("\n"),
  );
  // Geometry spans /loc x [-100, 0], y [-200, 0]; the far-off credit must not drag it out.
  assert.deepEqual(mapBounds(map), { minY: -200, maxY: 0, minX: -100, maxX: 0, minZ: 0, maxZ: 5 });
  // With no geometry at all, points are all we have, so they're used.
  const labelsOnly = parseEqMap("P 10, 20, 3, 0, 0, 0, 2, Somewhere");
  assert.deepEqual(mapBounds(labelsOnly), { minY: -20, maxY: -20, minX: -10, maxX: -10, minZ: 3, maxZ: 3 });
  assert.equal(mapBounds({ segments: [], pois: [] }), undefined);
});

test("mergeEqMaps stacks the layers a zone is spread across", () => {
  const a = parseEqMap("L 0, 0, 0, 1, 1, 0, 0, 0, 0");
  const b = parseEqMap("P 5, 5, 0, 0, 0, 0, 1, Camp");
  const merged = mergeEqMaps([a, b]);
  assert.equal(merged.segments.length, 1);
  assert.equal(merged.pois.length, 1);
});

test("a vector map calibrates itself: the projection lands its own corners", () => {
  // A 400×200 world box, off-centre, so a sign error can't hide.
  const map = parseEqMap("L -1000, -500, 0, -1400, -700, 0, 0, 0, 0");
  const bounds = mapBounds(map);
  assert.ok(bounds);
  assert.deepEqual(bounds, { minY: 500, maxY: 700, minX: 1000, maxX: 1400, minZ: 0, maxZ: 0 });

  const p = vectorProjection(bounds);
  assert.equal(p.scale, 1); // one synthetic pixel per EQ unit
  assert.deepEqual(p.center, { y: 600, x: 1200 });
  // The padded box keeps the geometry off the very edge.
  assert.ok(p.image.width > 400 && p.image.width < 440);

  // The projection's centre must map to the centre of a square canvas...
  const zone = { name: "Z", key: "z", scale: p.scale, center: p.center };
  const view = { image: p.image, canvas: { width: 600, height: 600 } };
  assert.deepEqual(eqToCanvasCoords(p.center, zone, view), { x: 300, y: 300 });
  // ...and the geometry must sit inside the canvas, with x growing westward (EQ axes flip).
  const west = eqToCanvasCoords({ y: 600, x: 1400 }, zone, view);
  const east = eqToCanvasCoords({ y: 600, x: 1000 }, zone, view);
  assert.ok(west && east && west.x < 300 && east.x > 300);
  assert.ok(west.x > 0 && east.x < 600);
});

test("floors come from the mapmaker's labels, top-down whichever way they number them", () => {
  // RunnyEye's real labels: numbered downward from the top.
  const dungeon = detectFloors(
    parseEqMap(
      [
        at(0, "Level 1 (Top)"),
        at(-42, "Level 2"),
        at(-86, "Level 3"),
        at(-116, "Level 4"),
        at(-149, "Level 5 (Bottom)"),
      ].join("\n"),
    ),
  );
  assert.deepEqual(dungeon.map((f) => f.label), [
    "Level 1 (Top)",
    "Level 2",
    "Level 3",
    "Level 4",
    "Level 5 (Bottom)",
  ]);
  // Unrest's real labels: numbered upward from the bottom, so ordering by the number would
  // list them upside down. Height decides, and the top floor comes first either way.
  const keep = detectFloors(
    parseEqMap([at(2, "1st Floor"), at(16, "2nd Floor"), at(43, "3rd Floor"), at(51, "4th Floor")].join("\n")),
  );
  assert.deepEqual(keep.map((f) => f.label), ["4th Floor", "3rd Floor", "2nd Floor", "1st Floor"]);
  assert.deepEqual(keep.map((f) => f.layer), [1, 2, 3, 4]);
});

test("a label that merely mentions a level is not a floor", () => {
  // All real labels from Brewall's files. Treating these as storeys would invent floors —
  // and "TRAP: Fake Floor" would be a floor made of a joke.
  const map = parseEqMap(
    [
      at(0, "Level 1 (Top)"),
      at(-42, "Level 2"),
      at(-111, "Water - LVL 3"),
      at(-62, "Bridge - LVL 2"),
      at(-22, "TRAP: Fake Floor"),
      at(-30, "GS: Questionable Cheese"),
      at(-10, "Succor"),
    ].join("\n"),
  );
  assert.deepEqual(detectFloors(map).map((f) => f.label), ["Level 1 (Top)", "Level 2"]);
});

test("several markers for one level average out, and one level is no floors at all", () => {
  // "LVL 2" dotted around a floor, plus its proper label: one floor, not four.
  const map = parseEqMap([at(0, "Level 1"), at(-40, "LVL 2"), at(-50, "LVL 2"), at(-60, "LVL 2")].join("\n"));
  const floors = detectFloors(map);
  assert.equal(floors.length, 2);
  assert.equal(floors[1].z, -50); // (-40 + -50 + -60) / 3
  // A zone that names one level (or none) has nothing to choose between.
  assert.deepEqual(detectFloors(parseEqMap(at(0, "Level 1"))), []);
  assert.deepEqual(detectFloors(parseEqMap(at(0, "Succor"))), []);
});

test("floors drawn side by side at one height aren't floors", () => {
  // Kurn's Tower, for real: eight floors laid out beside each other, every label at z=1. Their
  // heights say nothing, and banding by height would leave every floor empty.
  const tower = parseEqMap(
    ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"].map((n) => at(1, `${n} Floor`)).join("\n"),
  );
  assert.deepEqual(detectFloors(tower), []);
  // A single close pair is enough to rule the whole set out — we can't band half a map.
  assert.deepEqual(detectFloors(parseEqMap([at(0, "Level 1"), at(-2, "Level 2"), at(-80, "Level 3")].join("\n"))), []);
});

test("each floor owns the heights nearer its label, and the outer ones reach out", () => {
  const floors = detectFloors(parseEqMap([at(0, "Level 1"), at(-100, "Level 2")].join("\n")));
  assert.equal(floors[0].minZ, -50);
  assert.equal(floors[0].maxZ, Infinity);
  assert.equal(floors[1].minZ, -Infinity);
  assert.equal(floors[1].maxZ, -50);
  // So every height belongs to exactly one floor — including one above the top label.
  assert.equal(floorAt(floors, 40)?.label, "Level 1");
  assert.equal(floorAt(floors, -10)?.label, "Level 1");
  assert.equal(floorAt(floors, -60)?.label, "Level 2");
  assert.equal(floorAt(floors, -9000)?.label, "Level 2");
  assert.equal(floorAt([], 0), undefined);
});

test("a stair belongs to both floors it touches", () => {
  const floors = detectFloors(parseEqMap([at(0, "Level 1"), at(-100, "Level 2")].join("\n")));
  const [upper, lower] = floors;
  const stair = parseEqMap("L 0, 0, -10, 10, 10, -90, 0, 0, 0").segments[0];
  assert.ok(segmentOnFloor(stair, upper));
  assert.ok(segmentOnFloor(stair, lower));
  // While a wall on one floor stays on it.
  const wall = parseEqMap("L 0, 0, -95, 10, 10, -90, 0, 0, 0").segments[0];
  assert.ok(!segmentOnFloor(wall, upper));
  assert.ok(segmentOnFloor(wall, lower));
});

test("a degenerate map still projects (no divide by zero)", () => {
  const bounds = { minY: 5, maxY: 5, minX: 5, maxX: 5, minZ: 0, maxZ: 0 };
  const p = vectorProjection(bounds);
  assert.ok(p.image.width > 0 && p.image.height > 0);
  assert.deepEqual(p.center, { y: 5, x: 5 });
});
