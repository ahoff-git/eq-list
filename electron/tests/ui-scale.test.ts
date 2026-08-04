import test from "node:test";
import assert from "node:assert/strict";
import { MAP_UI_SCALE, UI_SCALE, clampScale, clampUiScale } from "../../src/shared/constants";

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

// ── the map's own range ────────────────────────────────────────────────────────
// The overlay stops at full size; the map is a picture you lean into, so it may grow.

test("the map may scale above 100%, the overlay may not", () => {
  assert.equal(UI_SCALE.max, 1);
  assert.ok(MAP_UI_SCALE.max > 1);
  assert.equal(clampScale(1.5, MAP_UI_SCALE), 1.5);
  assert.equal(clampUiScale(1.5), 1); // unchanged for the overlay
});

test("each range clamps to its own ends", () => {
  assert.equal(clampScale(99, MAP_UI_SCALE), MAP_UI_SCALE.max);
  assert.equal(clampScale(0.1, MAP_UI_SCALE), MAP_UI_SCALE.min);
  assert.equal(clampScale(NaN, MAP_UI_SCALE), MAP_UI_SCALE.max);
});

test("clampUiScale is still exactly the overlay range", () => {
  // Kept as its own name because the store, and every existing caller, mean *that* range.
  for (const v of [0.4, 0.6, 0.85, 1, 2]) assert.equal(clampUiScale(v), clampScale(v, UI_SCALE));
});
