/**
 * Black-box tests for a panel's height arithmetic — the rules behind dragging the seam under an open
 * panel (`ResizablePanel`). All of it is a share of the window, so none of it needs a window.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampPanelPct,
  nudgePanelPct,
  panelPct,
  PANEL_PCT,
  storedPanelPct,
} from "../../src/shared/panel-size";

test("a height is reported as its share of the window", () => {
  assert.equal(panelPct(300, 1000), 30);
  assert.equal(panelPct(125, 500), 25);
});

test("the share is the same at any interface scale — both lengths are scaled alike", () => {
  // The same panel in the same window, measured with the root zoomed to 60%.
  assert.equal(panelPct(300, 1000), panelPct(180, 600));
});

test("a drag is held inside the bounds, so the view underneath always keeps a strip", () => {
  assert.equal(panelPct(2000, 1000), PANEL_PCT.max);
  assert.equal(panelPct(-40, 1000), PANEL_PCT.min);
  assert.equal(panelPct(0, 1000), PANEL_PCT.min);
});

test("an unmeasurable window has no answer, rather than a wrong one", () => {
  // What an unmounted or hidden ancestor measures as — reporting `min` here would collapse a panel
  // that nobody dragged.
  assert.equal(panelPct(300, 0), null);
  assert.equal(panelPct(300, -1), null);
  assert.equal(panelPct(Number.NaN, 1000), null);
});

test("a nudge moves by whole steps and stops at the bounds", () => {
  assert.equal(nudgePanelPct(30, 1), 30 + PANEL_PCT.step);
  assert.equal(nudgePanelPct(30, -1), 30 - PANEL_PCT.step);
  assert.equal(nudgePanelPct(PANEL_PCT.max, 5), PANEL_PCT.max);
  assert.equal(nudgePanelPct(PANEL_PCT.min, -5), PANEL_PCT.min);
});

test("a remembered height is a share, or nothing at all", () => {
  assert.equal(storedPanelPct(42), 42);
  assert.equal(storedPanelPct(null), null); // never dragged — the panel's own default stands
  assert.equal(storedPanelPct("42"), null);
  assert.equal(storedPanelPct(undefined), null);
  assert.equal(storedPanelPct(Number.NaN), null);
  // Stored by a build with wider bounds than this one's.
  assert.equal(storedPanelPct(99), PANEL_PCT.max);
});

test("clamping is the one gate every path goes through", () => {
  assert.equal(clampPanelPct(50), 50);
  assert.equal(clampPanelPct(PANEL_PCT.min - 1), PANEL_PCT.min);
  assert.equal(clampPanelPct(PANEL_PCT.max + 1), PANEL_PCT.max);
});
