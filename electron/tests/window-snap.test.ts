/**
 * Black-box tests for where a dragged window lands — the geometry behind titlebar snapping.
 *
 * The cases that matter are the ones a screen would show and a reading of the code wouldn't: that a
 * corner beats the edge it shares, that two halves tile an odd-width monitor with no seam, that a
 * work area which doesn't start at 0,0 (a taskbar, a second monitor left of the primary) is honoured
 * rather than assumed away, and that a window pulled loose from a maximize stays under the pointer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SNAP,
  draggedTo,
  gripOn,
  movedFar,
  regrippedTo,
  snapRect,
  snapZoneAt,
  type Rect,
} from "../../src/shared/window-snap";

/** A 1920×1080 primary with a 40px taskbar, i.e. the ordinary case. */
const WORK: Rect = { x: 0, y: 0, width: 1920, height: 1040 };
/** A second monitor to the left and above the primary — negative origins are real. */
const LEFT_OF_PRIMARY: Rect = { x: -1600, y: -200, width: 1600, height: 900 };

test("the top edge means maximize, and the middle of the screen means nothing", () => {
  assert.equal(snapZoneAt({ x: 900, y: 0 }, WORK), "maximize");
  assert.equal(snapZoneAt({ x: 900, y: SNAP.edge }, WORK), "maximize");
  assert.equal(snapZoneAt({ x: 900, y: SNAP.edge + 1 }, WORK), null);
  assert.equal(snapZoneAt({ x: 900, y: 520 }, WORK), null);
});

test("a side edge is a half, and its corner bands are quarters", () => {
  assert.equal(snapZoneAt({ x: 0, y: 520 }, WORK), "left");
  assert.equal(snapZoneAt({ x: 1919, y: 520 }, WORK), "right");
  // A quarter of the height, top and bottom (SNAP.corner) — 260px on a 1040 work area.
  assert.equal(snapZoneAt({ x: 0, y: 259 }, WORK), "top-left");
  assert.equal(snapZoneAt({ x: 0, y: 261 }, WORK), "left");
  assert.equal(snapZoneAt({ x: 1919, y: 1039 }, WORK), "bottom-right");
});

test("a corner beats the edge it shares: the top-left is a quarter, not a maximize", () => {
  assert.equal(snapZoneAt({ x: 0, y: 0 }, WORK), "top-left");
  assert.equal(snapZoneAt({ x: 1919, y: 0 }, WORK), "top-right");
});

test("the bottom edge alone is not a zone — Windows gives it none either", () => {
  assert.equal(snapZoneAt({ x: 900, y: 1039 }, WORK), null);
});

test("zones are read against the work area, not the screen's origin", () => {
  // Dead centre of the second monitor, which is well inside the *primary's* left edge.
  assert.equal(snapZoneAt({ x: -800, y: 250 }, LEFT_OF_PRIMARY), null);
  assert.equal(snapZoneAt({ x: -1600, y: 250 }, LEFT_OF_PRIMARY), "left");
  assert.equal(snapZoneAt({ x: -800, y: -200 }, LEFT_OF_PRIMARY), "maximize");
});

test("halves tile the work area exactly, on an odd width too", () => {
  const odd: Rect = { x: 10, y: 20, width: 1601, height: 901 };
  const left = snapRect("left", odd);
  const right = snapRect("right", odd);
  assert.equal(left.x, odd.x);
  assert.equal(left.x + left.width, right.x, "no seam and no overlap between the two halves");
  assert.equal(right.x + right.width, odd.x + odd.width, "the pair covers the whole work area");
  assert.equal(left.height, odd.height);
});

test("quarters tile it in both directions", () => {
  const tl = snapRect("top-left", WORK);
  const br = snapRect("bottom-right", WORK);
  assert.deepEqual(tl, { x: 0, y: 0, width: 960, height: 520 });
  assert.deepEqual(br, { x: 960, y: 520, width: 960, height: 520 });
  assert.deepEqual(snapRect("maximize", WORK), WORK);
});

test("a drag keeps the grip the press took, whatever the window's size", () => {
  const bounds: Rect = { x: 300, y: 200, width: 460, height: 780 };
  const grip = gripOn({ x: 420, y: 210 }, bounds);
  assert.deepEqual(grip, { x: 120, y: 10 });
  // Moved 500 right and 30 down: so is the window, and it keeps its size.
  assert.deepEqual(draggedTo({ x: 920, y: 240 }, grip, { width: 460, height: 780 }), {
    x: 800,
    y: 230,
    width: 460,
    height: 780,
  });
});

test("a press only becomes a drag once the cursor leaves the spot", () => {
  const at = { x: 500, y: 12 };
  assert.equal(movedFar(at, { x: 502, y: 13 }), false, "a click, jitter and all, is not a drag");
  assert.equal(movedFar(at, { x: 500 + SNAP.threshold, y: 12 }), true);
});

test("pulling a maximized window loose leaves the pointer on its titlebar", () => {
  // Grabbed near the right end of a maximized 1920-wide caption; restoring to 460 wide would put
  // an absolute grip (1700px in) far off the window's right edge.
  const cursor = { x: 1700, y: 8 };
  const placed = regrippedTo(cursor, WORK, { width: 460, height: 780 });
  assert.equal(placed.width, 460);
  assert.ok(placed.x <= cursor.x && cursor.x <= placed.x + placed.width, "the cursor is still on the window");
  assert.ok(cursor.y - placed.y < 40, "and still on its titlebar, not down in the body");
  // Proportionally where it was: 1700/1920 ≈ 0.885 along, so ≈ 407px into a 460px window.
  assert.equal(placed.x, Math.round(1700 - (1700 / 1920) * 460));
});

test("a degenerate rectangle can't put the window nowhere", () => {
  const placed = regrippedTo({ x: 100, y: 100 }, { x: 100, y: 100, width: 0, height: 0 }, { width: 400, height: 300 });
  assert.deepEqual(placed, { x: -100, y: 100, width: 400, height: 300 }, "centred across, held at the top");
});
