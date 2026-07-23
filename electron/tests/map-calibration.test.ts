/**
 * Black-box tests for the map calibration math (pure). The UI (a dev-gated keyboard
 * hook) just feeds these; pinning them keeps the copy-paste values trustworthy.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { nudgeZone, nextStep, calibrationValues, MIN_STEP, MAX_STEP } from "../../src/shared/map/calibration";
import type { Zone } from "../../src/shared/map/types";

const zone = (): Zone => ({ name: "Z", size: { width: 1000, height: 1000 }, centerOffset: { y: 0, x: 0 } });

test("nudgeZone resizes and offsets by the given step, without mutating the zone", () => {
  const z = zone();
  const out = nudgeZone(z, new Set(["d", "w", "j", "i"]), 50); // wider, taller, offset +x +y
  assert.deepEqual(out.size, { width: 1050, height: 1050 });
  assert.deepEqual(out.centerOffset, { y: 50, x: 50 });
  // arrows mirror WASD, and the source zone is untouched.
  assert.deepEqual(nudgeZone(z, new Set(["ArrowLeft", "ArrowDown"]), 10).size, { width: 990, height: 990 });
  assert.deepEqual(z.size, { width: 1000, height: 1000 });
});

test("nudgeZone omits centerOffset when the zone has none", () => {
  const out = nudgeZone({ name: "Z", size: { width: 10, height: 10 } }, new Set(["w"]), 1);
  assert.equal(out.centerOffset, undefined);
});

test("nextStep adjusts by 100, clamps, and reports consumed keys (no-repeat)", () => {
  assert.equal(nextStep(new Set(["="]), new Set(), 100).step, 200);
  assert.equal(nextStep(new Set(["-"]), new Set(), 100).step, MIN_STEP); // can't go below MIN
  assert.equal(nextStep(new Set(["="]), new Set(), MAX_STEP).step, MAX_STEP); // can't exceed MAX
  assert.deepEqual(nextStep(new Set(["="]), new Set(), 100).consumed, ["="]);
  assert.equal(nextStep(new Set(["="]), new Set(["="]), 100).step, 100); // already held → no change
});

test("calibrationValues renders the paste-ready string", () => {
  assert.equal(
    calibrationValues({ name: "Z", size: { width: 6175, height: 6175 }, centerOffset: { y: -50, x: 200 } }),
    "size: { width: 6175, height: 6175 }, centerOffset: { y: -50, x: 200 }",
  );
});
