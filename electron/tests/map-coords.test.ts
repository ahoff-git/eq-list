/**
 * Black-box tests for the ported map geometry (src/shared/map). The two coord functions are exact
 * inverses up to integer rounding, so a round-trip must land back within one grid step (one step =
 * the projection's `scale`, adjusted for how far the map was fitted).
 *
 * A projection is never authored — a map file states its own (see `vectorProjection` and ADR 0042) —
 * so these use projections directly rather than going through a zone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canvasToEqCoords, clampPan, eqToCanvasCoords, fitRect } from "../../src/shared/map/coords";
import type { MapProjection, MapView } from "../../src/shared/map/types";

const CANVAS = { width: 1000, height: 1000 };
/** A landscape map, a portrait one and a square one, so letterboxing is covered both ways. */
const MAPS = [
  { width: 550, height: 328 },
  { width: 271, height: 519 },
  { width: 400, height: 400 },
];
const SAMPLES = [
  { y: 0, x: 0 },
  { y: 100, x: -200 },
  { y: -500, x: 250 },
  { y: 1234, x: 678 },
];
/** A spread of real scales: a city at ~1 unit/px through a continent at ~12. */
const SCALES = [1.3, 3, 9.4, 12.7];

test("fitRect fits, centres and preserves aspect", () => {
  // Landscape into a square: full width, letterboxed top and bottom.
  assert.deepEqual(fitRect({ width: 500, height: 250 }, CANVAS), { x: 0, y: 250, width: 1000, height: 500 });
  // Portrait: full height, bars either side.
  assert.deepEqual(fitRect({ width: 250, height: 500 }, CANVAS), { x: 250, y: 0, width: 500, height: 1000 });
  // A non-square canvas fits to whichever edge binds first.
  assert.deepEqual(fitRect({ width: 100, height: 100 }, { width: 400, height: 200 }), {
    x: 100,
    y: 0,
    width: 200,
    height: 200,
  });
});

test("eq→canvas→eq round-trips within one grid step, at every scale and aspect", () => {
  for (const scale of SCALES) {
    for (const image of MAPS) {
      const projection: MapProjection = { scale, center: { y: 120, x: -340 } };
      const view: MapView = { image, canvas: CANVAS };
      // EQ units per canvas pixel — what a whole-pixel round-trip can lose.
      const tol = Math.ceil(scale * (image.width / fitRect(image, CANVAS).width)) + 1;
      for (const eq of SAMPLES) {
        const px = eqToCanvasCoords(eq, projection, view);
        assert.ok(px, `should map ${JSON.stringify(eq)}`);
        const back = canvasToEqCoords(px, projection, view);
        assert.ok(back);
        assert.ok(Math.abs(back.y - eq.y) <= tol, `y ${back.y} vs ${eq.y} (tol ${tol})`);
        assert.ok(Math.abs(back.x - eq.x) <= tol, `x ${back.x} vs ${eq.x} (tol ${tol})`);
      }
    }
  }
});

test("the projection's centre lands at the centre of the drawn map", () => {
  const projection: MapProjection = { scale: 10, center: { y: 600, x: 1200 } };
  // A letterboxed map is still centred in the canvas, so its centre is mid-canvas.
  const view: MapView = { image: { width: 250, height: 500 }, canvas: CANVAS };
  assert.deepEqual(eqToCanvasCoords(projection.center, projection, view), { x: 500, y: 500 });
  assert.deepEqual(canvasToEqCoords({ x: 500, y: 500 }, projection, view), projection.center);
});

test("scale is EQ units per map pixel, measured off the map as drawn", () => {
  // 10 units/px on a 400px map drawn at 2.5× into a 1000px canvas → 4 units per canvas pixel, so
  // 400 EQ units west of centre is 100px right of it (EQ axes are flipped).
  const projection: MapProjection = { scale: 10, center: { y: 0, x: 0 } };
  const view: MapView = { image: { width: 400, height: 400 }, canvas: CANVAS };
  assert.deepEqual(eqToCanvasCoords({ y: 0, x: -400 }, projection, view), { x: 600, y: 500 });
  assert.deepEqual(eqToCanvasCoords({ y: -400, x: 0 }, projection, view), { x: 500, y: 600 });
  // Letterboxing halves the drawn size here, so the same EQ offset covers half the pixels.
  const half: MapView = { image: { width: 400, height: 800 }, canvas: CANVAS };
  assert.deepEqual(eqToCanvasCoords({ y: 0, x: -400 }, projection, half), { x: 550, y: 500 });
});

test("no projection means nothing is plotted", () => {
  const view: MapView = { image: { width: 400, height: 400 }, canvas: CANVAS };
  assert.equal(eqToCanvasCoords({ y: 0, x: 0 }, undefined, view), undefined);
  assert.equal(canvasToEqCoords({ x: 0, y: 0 }, undefined, view), undefined);
  // A map with no size can't be drawn on either — which is the state before one has loaded.
  const projection: MapProjection = { scale: 1, center: { y: 0, x: 0 } };
  assert.equal(eqToCanvasCoords({ y: 0, x: 0 }, projection, { image: { width: 0, height: 0 }, canvas: CANVAS }), undefined);
});

test("clampPan keeps the map covering the canvas", () => {
  const canvas = { width: 1000, height: 1000 };
  // At 2× the content is 2000px, so the pan may run from -1000 (right edge aligned) to 0.
  assert.deepEqual(clampPan({ x: -400, y: -600 }, 2, canvas), { x: -400, y: -600 });
  // Dragging past either end stops at it, rather than opening a blank gutter.
  assert.deepEqual(clampPan({ x: 250, y: 80 }, 2, canvas), { x: 0, y: 0 });
  assert.deepEqual(clampPan({ x: -5000, y: -1200 }, 2, canvas), { x: -1000, y: -1000 });
  // At fit there's nowhere to go, so any pan collapses to centred.
  assert.deepEqual(clampPan({ x: -300, y: 40 }, 1, canvas), { x: 0, y: 0 });
  assert.deepEqual(clampPan({ x: -300, y: 40 }, 0.5, canvas), { x: 0, y: 0 });
  // A canvas that hasn't been measured yet can't produce a NaN pan.
  assert.deepEqual(clampPan({ x: -10, y: -10 }, 3, { width: 0, height: 0 }), { x: 0, y: 0 });
});
