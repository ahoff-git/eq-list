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
import type { MapProjection, MapView, Point } from "../../src/shared/map/types";

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

test("clampPan keeps a map that fills the canvas covering it", () => {
  const canvas = { width: 1000, height: 1000 };
  // At 2× the content is 2000px, so the pan may run from -1000 (right edge aligned) to 0.
  assert.deepEqual(clampPan({ x: -400, y: -600 }, 2, canvas), { x: -400, y: -600 });
  // Dragging past either end stops at it, rather than opening a blank gutter.
  assert.deepEqual(clampPan({ x: 250, y: 80 }, 2, canvas), { x: 0, y: 0 });
  assert.deepEqual(clampPan({ x: -5000, y: -1200 }, 2, canvas), { x: -1000, y: -1000 });
  // At fit there's nowhere to go, so any pan collapses to centred.
  assert.deepEqual(clampPan({ x: -300, y: 40 }, 1, canvas), { x: 0, y: 0 });
  // Smaller than the viewport: centred, since no pan reveals any more of it.
  assert.deepEqual(clampPan({ x: -300, y: 40 }, 0.5, canvas), { x: 250, y: 250 });
  // A canvas that hasn't been measured yet can't produce a NaN pan.
  assert.deepEqual(clampPan({ x: -10, y: -10 }, 3, { width: 0, height: 0 }), { x: 0, y: 0 });
});

/** Where the map's edges land on the canvas, given a pan — what the eye actually sees. */
function edges(rect: { x: number; y: number; width: number; height: number }, zoom: number, pan: Point) {
  return {
    left: rect.x * zoom + pan.x,
    right: (rect.x + rect.width) * zoom + pan.x,
    top: rect.y * zoom + pan.y,
    bottom: (rect.y + rect.height) * zoom + pan.y,
  };
}

/**
 * The invariant a pan must satisfy, per axis: **either the map covers the viewport, or it's
 * centred in it.** There is no third case, and the bug this replaced produced one — clamping
 * against the canvas let a zoomed map sit part-covered, showing a letterbox bar where there was
 * more map to be had.
 */
function assertCoveredOrCentred(near: number, far: number, viewport: number, what: string) {
  const span = far - near;
  if (span >= viewport - 0.001) {
    assert.ok(near <= 0.001, `${what}: blank before the map (near ${near})`);
    assert.ok(far >= viewport - 0.001, `${what}: blank after the map (far ${far})`);
  } else {
    // Too small to cover, so no pan reveals more of it — centred is the only honest answer.
    assert.ok(Math.abs((near + far) / 2 - viewport / 2) < 0.001, `${what}: should be centred (${near}–${far})`);
  }
}

test("a zoomed map is never panned onto its own letterbox bars", () => {
  // A landscape map in a taller canvas is letterboxed top and bottom. Clamping against the *canvas*
  // let you drag those bars into view at any zoom, so a zoomed map showed blank space instead of the
  // map that was there to show.
  const canvas = { width: 1000, height: 1000 };
  const rect = fitRect({ width: 550, height: 328 }, canvas);
  assert.ok(rect.height < canvas.height, "expected this map to be letterboxed vertically");

  for (const zoom of [1, 1.2, 2, 5, 17]) {
    // Drag hard in every direction; every result has to satisfy the invariant.
    for (const pan of [
      { x: 0, y: 0 },
      { x: 9999, y: 9999 },
      { x: -9999, y: -9999 },
      { x: 9999, y: -9999 },
      { x: -320, y: 60 },
    ]) {
      const e = edges(rect, zoom, clampPan(pan, zoom, canvas, rect));
      const at = `zoom ${zoom}, pan ${pan.x},${pan.y}`;
      assertCoveredOrCentred(e.left, e.right, canvas.width, `${at} horizontally`);
      assertCoveredOrCentred(e.top, e.bottom, canvas.height, `${at} vertically`);
    }
  }

  // And the specific thing that was wrong: at 2× this map covers the canvas vertically, so the top
  // bar must be unreachable — under the old rule, panning down showed 400px of it.
  const e = edges(rect, 2, clampPan({ x: 0, y: 9999 }, 2, canvas, rect));
  assert.equal(Math.round(e.top), 0, `dragging down should stop with the map's top edge at the canvas top`);
});

test("each axis is clamped on its own", () => {
  // A tall map in a wide canvas: fitted, it fills the height and leaves bars either side. Zoomed
  // moderately it covers the canvas vertically while still falling well short horizontally, so the
  // axes must disagree — clamping them together is what made a zoomed map feel stuck one way and
  // loose the other.
  const canvas = { width: 1600, height: 900 };
  const rect = fitRect({ width: 328, height: 550 }, canvas);
  assert.ok(rect.width < canvas.width / 2, "expected wide bars either side");
  assert.ok(Math.abs(rect.height - canvas.height) < 1, "expected it to fill the height");

  // At fit, centred — which for a fitted map is the pan it already had.
  assert.deepEqual(clampPan({ x: 40, y: -80 }, 1, canvas, rect), { x: 0, y: 0 });

  const zoom = 1.5;
  const e = edges(rect, zoom, clampPan({ x: 0, y: -9999 }, zoom, canvas, rect));
  assert.ok(e.bottom >= canvas.height - 0.001 && e.top <= 0.001, "vertical should cover the canvas");
  assert.ok(Math.abs((e.left + e.right) / 2 - canvas.width / 2) < 0.001, "horizontal should stay centred");
});
