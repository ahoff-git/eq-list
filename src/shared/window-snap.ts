/**
 * window-snap.ts — the geometry of Windows-style snapping: where a dragged window would land.
 *
 * Our windows are frameless, so the OS never sees a caption being dragged and none of Aero Snap's
 * behaviour comes for free — a titlebar drag has to work out for itself that the cursor reached an
 * edge and what rectangle that means. That arithmetic is all here, as plain functions over plain
 * rectangles, so it can be tested without a screen: the main process supplies the cursor and the
 * display's work area (see [window-drag.ts](../../electron/window-drag.ts)) and does the moving.
 *
 * The vocabulary is deliberately the one users already have from Windows: the **cursor** decides,
 * not the window — you snap by taking the pointer to the edge, and a window half off-screen with
 * the pointer in the middle is not snapping. Halves are computed so a left and a right leave no
 * seam and no overlap, whatever the work area's parity.
 */

/** A window rectangle in screen coordinates (DIP — what Electron's `getBounds`/`setBounds` use). */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A cursor position in the same coordinates. */
export interface Point {
  x: number;
  y: number;
}

/**
 * Where a drag would put the window. `maximize` is the top edge; the halves are the side edges;
 * the quarters are the corner bands of those side edges — the same set Windows offers a mouse drag
 * (the bottom edge is not one of them: Windows gives it no move-drag meaning either).
 */
export type SnapZone = "maximize" | "left" | "right" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * How a drag finished, which is not the same question as where the cursor is: only a **released**
 * drag may snap. `cancel` is an Escape (put the window back where the drag started) and `keep` is a
 * gesture that was *lost* rather than finished — focus went elsewhere, or the renderer holding it
 * went away — where the honest thing is to leave the window where it got to.
 */
export type DragEnd = "snap" | "cancel" | "keep";

export const SNAP = {
  /**
   * How close to an edge the cursor counts as "at" it. A few pixels, because reaching the edge is
   * the gesture — a wide band would snap windows the user was only dragging past.
   */
  edge: 8,
  /**
   * The share of an edge, top and bottom, that means a quarter rather than a half. A quarter of the
   * height each, as Windows does: enough to aim at without swallowing the middle.
   */
  corner: 0.25,
  /**
   * How far the cursor must travel before a press on the titlebar is a drag at all. Without it a
   * plain click on a window already sitting at an edge would snap it, and a double-click (which is
   * two presses in the same spot) could move the window out from under the second one.
   */
  threshold: 4,
} as const;

/** Distance from a rectangle's edges, so the four "am I at this edge" tests read the same way. */
function atEdges(cursor: Point, area: Rect, edge: number) {
  return {
    left: cursor.x <= area.x + edge,
    right: cursor.x >= area.x + area.width - 1 - edge,
    top: cursor.y <= area.y + edge,
    // Recorded for completeness (and used by the corner bands below), but the bottom edge alone
    // means nothing — see `SnapZone`.
    bottom: cursor.y >= area.y + area.height - 1 - edge,
  };
}

/**
 * The zone the cursor is in, or null for "leave the window where the drag put it".
 *
 * Sides are tested before the top, so the top-left corner is a quarter rather than a maximize —
 * the corner is the more specific request, and it's the one that's harder to hit by accident.
 */
export function snapZoneAt(cursor: Point, workArea: Rect, edge: number = SNAP.edge): SnapZone | null {
  const at = atEdges(cursor, workArea, edge);
  const band = workArea.height * SNAP.corner;
  const nearTop = cursor.y <= workArea.y + band;
  const nearBottom = cursor.y >= workArea.y + workArea.height - band;
  if (at.left) return nearTop ? "top-left" : nearBottom ? "bottom-left" : "left";
  if (at.right) return nearTop ? "top-right" : nearBottom ? "bottom-right" : "right";
  if (at.top) return "maximize";
  return null;
}

/**
 * The rectangle a zone means on this display.
 *
 * The far half takes the remainder rather than a second `round`, so two snapped windows tile a
 * work area of odd width exactly — a one-pixel seam of desktop between them is the kind of detail
 * that makes a feature look approximate.
 */
export function snapRect(zone: SnapZone, workArea: Rect): Rect {
  const { x, y, width, height } = workArea;
  const halfW = Math.round(width / 2);
  const halfH = Math.round(height / 2);
  const right = { x: x + halfW, width: width - halfW };
  const bottom = { y: y + halfH, height: height - halfH };
  switch (zone) {
    case "maximize":
      return { x, y, width, height };
    case "left":
      return { x, y, width: halfW, height };
    case "right":
      return { ...right, y, height };
    case "top-left":
      return { x, y, width: halfW, height: halfH };
    case "top-right":
      return { ...right, y, height: halfH };
    case "bottom-left":
      return { x, ...bottom, width: halfW };
    case "bottom-right":
      return { ...right, ...bottom };
  }
}

/** Has the cursor left the spot it was pressed in — i.e. is this a drag rather than a click? */
export function movedFar(from: Point, to: Point, threshold: number = SNAP.threshold): boolean {
  return Math.abs(to.x - from.x) >= threshold || Math.abs(to.y - from.y) >= threshold;
}

/** Where the cursor sits inside the window it grabbed — the grip a drag has to preserve. */
export function gripOn(cursor: Point, bounds: Rect): Point {
  return { x: cursor.x - bounds.x, y: cursor.y - bounds.y };
}

/** Where a window of this size goes for the cursor to keep that grip. */
export function draggedTo(cursor: Point, grip: Point, size: { width: number; height: number }): Rect {
  return { x: Math.round(cursor.x - grip.x), y: Math.round(cursor.y - grip.y), ...size };
}

/**
 * Where to put a window being pulled loose from a snap or a maximize: the size it had before,
 * placed so the cursor holds the *same proportion* along it that it held on the big one.
 *
 * Proportional rather than absolute, because the grip on a maximized window can be far to the
 * right of a restored window's whole width — grab a 3440px-wide titlebar near its right edge and
 * an absolute grip would drop a 460px window entirely to the left of the pointer, letting go of it
 * mid-drag. Proportion keeps the pointer on the titlebar it is holding, which is what Windows does.
 */
export function regrippedTo(cursor: Point, from: Rect, size: { width: number; height: number }): Rect {
  const alongX = from.width > 0 ? (cursor.x - from.x) / from.width : 0.5;
  const alongY = from.height > 0 ? (cursor.y - from.y) / from.height : 0;
  return {
    x: Math.round(cursor.x - alongX * size.width),
    y: Math.round(cursor.y - alongY * size.height),
    ...size,
  };
}
