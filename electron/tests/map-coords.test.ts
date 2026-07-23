/**
 * Black-box tests for the ported map geometry (src/shared/map). The two coord
 * functions are exact inverses up to integer rounding, so a round-trip must land
 * back within one grid step (which scales with zone.size / canvas.size).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { eqToCanvasCoords, canvasToEqCoords } from "../../src/shared/map/coords";
import { baseZones, findZone } from "../../src/shared/map/zones";

const SIZE = { width: 1000, height: 1000 };
const SAMPLES = [
  { y: 0, x: 0 },
  { y: 100, x: -200 },
  { y: -500, x: 250 },
  { y: 1234, x: 678 },
];

test("eq→canvas→eq round-trips within one grid step for every calibrated zone", () => {
  for (const zone of baseZones) {
    if (!zone.size || !zone.centerOffset) continue; // uncalibrated ("Choose a zone")
    const tolY = Math.ceil(zone.size.height / SIZE.height) + 1;
    const tolX = Math.ceil(zone.size.width / SIZE.width) + 1;
    for (const eq of SAMPLES) {
      const px = eqToCanvasCoords(eq, zone, SIZE);
      assert.ok(px, `${zone.name} should map ${JSON.stringify(eq)}`);
      const back = canvasToEqCoords(px!, zone, SIZE);
      assert.ok(back);
      assert.ok(Math.abs(back!.y - eq.y) <= tolY, `${zone.name}: y ${back!.y} vs ${eq.y} (tol ${tolY})`);
      assert.ok(Math.abs(back!.x - eq.x) <= tolX, `${zone.name}: x ${back!.x} vs ${eq.x} (tol ${tolX})`);
    }
  }
});

test("a centered zone maps EQ origin to the canvas centre and back", () => {
  const gfay = findZone("Greater Faydark", baseZones);
  assert.ok(gfay);
  const px = eqToCanvasCoords({ y: 0, x: 0 }, gfay, SIZE);
  assert.deepEqual(px, { x: 500, y: 500 });
  assert.deepEqual(canvasToEqCoords({ x: 500, y: 500 }, gfay, SIZE), { y: 0, x: 0 });
});

test("an uncalibrated zone yields undefined (nothing to plot)", () => {
  const choose = findZone("Choose a zone", baseZones);
  assert.ok(choose);
  assert.equal(eqToCanvasCoords({ y: 0, x: 0 }, choose, SIZE), undefined);
});
