/**
 * Black-box tests for the ported map geometry (src/shared/map). The two coord functions
 * are exact inverses up to integer rounding, so a round-trip must land back within one
 * grid step (one step = the zone's `scale`, adjusted for how far the image was fitted).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canvasToEqCoords,
  canvasToImagePx,
  clampPan,
  eqToCanvasCoords,
  fitRect,
  imagePxToCanvas,
} from "../../src/shared/map/coords";
import { baseZones, findZone } from "../../src/shared/map/zones";
import type { MapView } from "../../src/shared/map/types";

const CANVAS = { width: 1000, height: 1000 };
/** A landscape map, a portrait one and a square one, so letterboxing is covered both ways. */
const IMAGES = [
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

test("eq→canvas→eq round-trips within one grid step for every calibrated zone", () => {
  for (const zone of baseZones) {
    if (!zone.scale || !zone.center) continue; // uncalibrated (no map, or awaiting 📐)
    for (const image of IMAGES) {
      const view: MapView = { image, canvas: CANVAS };
      // EQ units per canvas pixel — what a whole-pixel round-trip can lose.
      const tol = Math.ceil(zone.scale * (image.width / fitRect(image, CANVAS).width)) + 1;
      for (const eq of SAMPLES) {
        const px = eqToCanvasCoords(eq, zone, view);
        assert.ok(px, `${zone.name} should map ${JSON.stringify(eq)}`);
        const back = canvasToEqCoords(px, zone, view);
        assert.ok(back);
        assert.ok(Math.abs(back.y - eq.y) <= tol, `${zone.name}: y ${back.y} vs ${eq.y} (tol ${tol})`);
        assert.ok(Math.abs(back.x - eq.x) <= tol, `${zone.name}: x ${back.x} vs ${eq.x} (tol ${tol})`);
      }
    }
  }
});

test("a zone centred on the origin puts EQ 0,0 at the image's centre", () => {
  const gfay = findZone("Greater Faydark", baseZones);
  assert.ok(gfay);
  assert.deepEqual(gfay.center, { y: 0, x: 0 });
  // A letterboxed image is still centred in the canvas, so the origin lands mid-canvas.
  const view: MapView = { image: { width: 250, height: 500 }, canvas: CANVAS };
  assert.deepEqual(eqToCanvasCoords({ y: 0, x: 0 }, gfay, view), { x: 500, y: 500 });
  assert.deepEqual(canvasToEqCoords({ x: 500, y: 500 }, gfay, view), { y: 0, x: 0 });
});

test("scale is EQ units per image pixel, measured off the map as drawn", () => {
  // 10 units/px on a 400px image drawn at 2.5× into a 1000px canvas → 4 units per canvas
  // pixel, so 400 EQ units west of the centre is 100px right of it (EQ axes are flipped).
  const zone = { name: "Z", key: "z", scale: 10, center: { y: 0, x: 0 } };
  const view: MapView = { image: { width: 400, height: 400 }, canvas: CANVAS };
  assert.deepEqual(eqToCanvasCoords({ y: 0, x: -400 }, zone, view), { x: 600, y: 500 });
  assert.deepEqual(eqToCanvasCoords({ y: -400, x: 0 }, zone, view), { x: 500, y: 600 });
  // Letterboxing halves the drawn size here, so the same EQ offset covers half the pixels.
  const half: MapView = { image: { width: 400, height: 800 }, canvas: CANVAS };
  assert.deepEqual(eqToCanvasCoords({ y: 0, x: -400 }, zone, half), { x: 550, y: 500 });
});

test("an uncalibrated zone yields undefined (nothing to plot)", () => {
  const view: MapView = { image: { width: 400, height: 400 }, canvas: CANVAS };
  const choose = findZone("Choose a zone", baseZones);
  assert.ok(choose);
  assert.equal(eqToCanvasCoords({ y: 0, x: 0 }, choose, view), undefined);
  assert.equal(canvasToEqCoords({ x: 0, y: 0 }, choose, view), undefined);
  // A zone awaiting calibration behaves the same — its map draws, its dot doesn't.
  const runnyeye = findZone("RunnyEye Citadel", baseZones);
  assert.ok(runnyeye?.mapImg);
  assert.equal(eqToCanvasCoords({ y: 0, x: 0 }, runnyeye, view), undefined);
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

test("canvas↔image pixel conversions invert, and need no calibration", () => {
  const view: MapView = { image: { width: 550, height: 328 }, canvas: CANVAS };
  const rect = fitRect(view.image, CANVAS);
  assert.deepEqual(canvasToImagePx({ x: rect.x, y: rect.y }, view), { x: 0, y: 0 });
  assert.deepEqual(imagePxToCanvas({ x: 0, y: 0 }, view), { x: rect.x, y: rect.y });
  const px = { x: 137, y: 202 };
  const back = canvasToImagePx(imagePxToCanvas(px, view)!, view);
  assert.ok(back);
  assert.ok(Math.abs(back.x - px.x) < 1e-9 && Math.abs(back.y - px.y) < 1e-9);
});
