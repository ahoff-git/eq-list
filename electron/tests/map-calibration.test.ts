/**
 * Black-box tests for the map calibration math (pure). The UI just feeds these — a click
 * becomes a fix, the keyboard nudges — so pinning them keeps the copy-paste values
 * trustworthy. The important property: a solved calibration puts each fix's EQ coordinate
 * back on the pixel the player clicked (verified here against the real coord functions).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calibrationValues,
  centerFrom,
  nextStep,
  nudgeCalibration,
  solveCalibration,
  MAX_STEP,
  MIN_STEP,
  SCALE_NUDGE,
} from "../../src/shared/map/calibration";
import { eqToCanvasCoords } from "../../src/shared/map/coords";
import type { MapView } from "../../src/shared/map/types";

const IMAGE = { width: 400, height: 300 };

test("centerFrom places a fix: the EQ at the image centre, given a scale", () => {
  // A fix dead centre means the map's centre *is* that coordinate.
  assert.deepEqual(centerFrom({ eq: { y: 50, x: -80 }, px: { x: 200, y: 150 } }, 10, IMAGE), { y: 50, x: -80 });
  // 10 px right of centre at 10 units/px = 100 EQ units — and EQ runs the other way, so
  // the map's centre is *east* of the fix.
  assert.deepEqual(centerFrom({ eq: { y: 0, x: 0 }, px: { x: 210, y: 150 } }, 10, IMAGE), { y: 0, x: 100 });
  assert.deepEqual(centerFrom({ eq: { y: 0, x: 0 }, px: { x: 200, y: 140 } }, 10, IMAGE), { y: -100, x: 0 });
});

test("two fixes solve the scale from the distance between them", () => {
  // 200 px apart on the image, 2000 EQ units apart in the world → 10 units per pixel.
  const solved = solveCalibration(
    [
      { eq: { y: 0, x: 1000 }, px: { x: 100, y: 150 } },
      { eq: { y: 0, x: -1000 }, px: { x: 300, y: 150 } },
    ],
    IMAGE,
  );
  assert.ok(solved);
  assert.equal(solved.scale, 10);
  assert.deepEqual(solved.center, { y: 0, x: 0 });
});

test("a solved calibration recovers the map it was sampled from", () => {
  // The round trip that matters: take a real calibration, work out where two known
  // coordinates would appear on the image, hand those back as fixes, and the solve should
  // return the calibration we started from — and re-plot each fix onto its own pixel.
  const truth = { scale: 10, center: { y: 100, x: -50 } };
  const view: MapView = { image: IMAGE, canvas: { width: 400, height: 300 } }; // 1:1, no letterbox
  const fixes = [
    { eq: { y: 1000, x: 750 }, px: { x: 120, y: 60 } },
    { eq: { y: -800, x: -1350 }, px: { x: 330, y: 240 } },
  ];
  const solved = solveCalibration(fixes, IMAGE);
  assert.deepEqual(solved, truth);

  const zone = { name: "Z", key: "z", ...solved! };
  for (const fix of fixes) {
    const px = eqToCanvasCoords(fix.eq, zone, view);
    assert.deepEqual(px, fix.px, `${JSON.stringify(px)} vs ${JSON.stringify(fix.px)}`);
  }
});

test("one fix places the map but keeps the scale it was given", () => {
  const fix = { eq: { y: 100, x: 200 }, px: { x: 100, y: 100 } };
  const solved = solveCalibration([fix], IMAGE, 4);
  assert.ok(solved);
  assert.equal(solved.scale, 4);
  assert.deepEqual(solved.center, centerFrom(fix, 4, IMAGE));
  // With no scale to fall back on there's nothing to solve — one click can't do both.
  assert.equal(solveCalibration([fix], IMAGE), undefined);
});

test("solveCalibration refuses the cases it can't answer", () => {
  assert.equal(solveCalibration([], IMAGE), undefined);
  assert.equal(solveCalibration([{ eq: { y: 0, x: 0 }, px: { x: 1, y: 1 } }], { width: 0, height: 0 }, 5), undefined);
  // Two clicks on the same pixel say nothing about scale, so the fallback stands.
  const same = [
    { eq: { y: 0, x: 0 }, px: { x: 50, y: 50 } },
    { eq: { y: 500, x: 0 }, px: { x: 50, y: 50 } },
  ];
  assert.equal(solveCalibration(same, IMAGE, 7)?.scale, 7);
  // As does clicking two spots without moving in-game.
  const still = [
    { eq: { y: 0, x: 0 }, px: { x: 50, y: 50 } },
    { eq: { y: 0, x: 0 }, px: { x: 250, y: 50 } },
  ];
  assert.equal(solveCalibration(still, IMAGE, 7)?.scale, 7);
});

test("the widest pair of fixes sets the scale", () => {
  // A third, closer fix must not dilute the long baseline the scale comes from.
  const solved = solveCalibration(
    [
      { eq: { y: 0, x: 1000 }, px: { x: 100, y: 150 } },
      { eq: { y: 0, x: 990 }, px: { x: 101, y: 150 } },
      { eq: { y: 0, x: -1000 }, px: { x: 300, y: 150 } },
    ],
    IMAGE,
  );
  assert.ok(solved);
  assert.equal(solved.scale, 10);
});

test("nudgeCalibration moves the centre by the step and the scale by a percentage", () => {
  const cal = { scale: 10, center: { y: 0, x: 0 } };
  assert.deepEqual(nudgeCalibration(cal, new Set(["j", "i"]), 50).center, { y: 50, x: 50 });
  assert.deepEqual(nudgeCalibration(cal, new Set(["l", "k"]), 50).center, { y: -50, x: -50 });
  assert.equal(nudgeCalibration(cal, new Set(["w"]), 1).scale, Number((10 * (1 + SCALE_NUDGE)).toFixed(4)));
  assert.equal(nudgeCalibration(cal, new Set(["ArrowDown"]), 1).scale, Number((10 * (1 - SCALE_NUDGE)).toFixed(4)));
  // The input is left alone — the caller decides what to do with the result.
  assert.deepEqual(cal, { scale: 10, center: { y: 0, x: 0 } });
});

test("nextStep adjusts by 10, clamps, and reports consumed keys (no-repeat)", () => {
  assert.equal(nextStep(new Set(["="]), new Set(), 100).step, 110);
  assert.equal(nextStep(new Set(["-"]), new Set(), MIN_STEP).step, MIN_STEP); // can't go below MIN
  assert.equal(nextStep(new Set(["="]), new Set(), MAX_STEP).step, MAX_STEP); // can't exceed MAX
  assert.deepEqual(nextStep(new Set(["="]), new Set(), 100).consumed, ["="]);
  assert.equal(nextStep(new Set(["="]), new Set(["="]), 100).step, 100); // already held → no change
});

test("calibrationValues renders the paste-ready string", () => {
  assert.equal(
    calibrationValues({ name: "Z", key: "z", scale: 11.227, center: { y: -50, x: 200 } }),
    "scale: 11.227, center: { y: -50, x: 200 }",
  );
});
