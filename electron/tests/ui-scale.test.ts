import test from "node:test";
import assert from "node:assert/strict";
import { UI_SCALE, clampUiScale } from "../../src/shared/constants";

test("100% is the maximum — the scale only goes down", () => {
  assert.equal(UI_SCALE.max, 1);
  assert.equal(clampUiScale(1.6), 1);
  assert.equal(clampUiScale(1), 1);
});

test("clamps up to the smallest legible size", () => {
  assert.equal(clampUiScale(0.1), UI_SCALE.min);
});

test("keeps a value inside the range, rounded to whole percent", () => {
  assert.equal(clampUiScale(0.85), 0.85);
  assert.equal(clampUiScale(0.8499999999), 0.85);
});

test("a missing or broken stored value falls back to full size", () => {
  assert.equal(clampUiScale(NaN), 1);
  assert.equal(clampUiScale(undefined as unknown as number), 1);
});

test("stepping from the maximum lands on a supported step", () => {
  assert.equal(clampUiScale(UI_SCALE.max - UI_SCALE.step), 0.95);
});
