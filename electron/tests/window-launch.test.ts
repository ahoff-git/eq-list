/**
 * The two pure rules a launched window depends on to be *visible*.
 *
 * Everything else about window lifecycle is Electron and lives in
 * [manual-qa](../../specs/testing/manual-qa.md), but both of these were real launch bugs and both are
 * plain functions, so they get pinned here:
 *
 *  - **`once`** is what makes "show this window" happen exactly once, fed by every signal that could
 *    mean the window is up plus a deadline that has to mean it anyway. The bug it replaces was a
 *    window shown only from `ready-to-show` — an event that fires once per window and not at all for a
 *    renderer that never paints — which left the app as a taskbar button with nothing behind it.
 *  - **`windowOpacity`** decides how translucent a window opens. `overlay.opacity` was the one stored
 *    number nothing validated, so a 0 in the settings file opened every window invisible.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "../../src/shared/once";
import { OVERLAY_OPACITY, clampOpacity, windowOpacity } from "../../src/shared/constants";

test("whichever signal arrives first wins, and the rest are no-ops", () => {
  let shown = 0;
  const reveal = once(() => {
    shown += 1;
  });
  reveal(); // "it painted"
  reveal(); // "it finished loading"
  reveal(); // the deadline, arriving late
  assert.equal(shown, 1);
});

test("the deadline alone is enough — nothing else has to fire", () => {
  let shown = 0;
  const reveal = once(() => {
    shown += 1;
  });
  // The case a renderer that dies before its first paint produces: no paint, no load, just the timer.
  reveal();
  assert.equal(shown, 1, "a window is shown even when the renderer never reported anything");
});

test("each window gets its own latch", () => {
  const seen: string[] = [];
  const main = once(() => seen.push("main"));
  const map = once(() => seen.push("map"));
  main();
  main();
  map();
  assert.deepEqual(seen, ["main", "map"]);
});

test("a throw doesn't re-arm the latch", () => {
  let calls = 0;
  const reveal = once(() => {
    calls += 1;
    throw new Error("show failed");
  });
  assert.throws(reveal);
  reveal(); // the deadline, after a failed paint-driven attempt
  assert.equal(calls, 1, "one attempt, so a window can't be shown twice by a retry loop");
});

// ── how translucent a window opens ────────────────────────────────────────────

test("a stored opacity of zero can't open an invisible window", () => {
  assert.equal(windowOpacity(false, 0), OVERLAY_OPACITY.min);
  assert.equal(clampOpacity(0), OVERLAY_OPACITY.min);
  assert.equal(clampOpacity(0.05), OVERLAY_OPACITY.min);
});

test("an unusable value reads as fully opaque, not as the floor", () => {
  // The failure being guarded against is a window nobody can see, so garbage errs towards visible.
  assert.equal(windowOpacity(false, NaN), OVERLAY_OPACITY.max);
  assert.equal(windowOpacity(false, undefined as unknown as number), OVERLAY_OPACITY.max);
  assert.equal(windowOpacity(false, "0.4" as unknown as number), OVERLAY_OPACITY.max);
});

test("a legitimate slider value is left alone", () => {
  assert.equal(windowOpacity(false, 0.9), 0.9);
  assert.equal(windowOpacity(false, OVERLAY_OPACITY.min), OVERLAY_OPACITY.min);
  assert.equal(windowOpacity(false, 1), 1);
});

test("the ◐ override still wins over anything saved", () => {
  assert.equal(windowOpacity(true, 0.2), OVERLAY_OPACITY.max);
  assert.equal(windowOpacity(true, 0), OVERLAY_OPACITY.max);
});

test("nothing above full opacity, either", () => {
  assert.equal(windowOpacity(false, 4), OVERLAY_OPACITY.max);
});
