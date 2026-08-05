/**
 * Pure conversions between EQ world coordinates and canvas pixels.
 *
 * The heart of the map subsystem, and deliberately dependency-free: the projection (the map's
 * `scale` + `center`) and the view (the map's pixel size, the canvas's) are passed in, nothing is
 * read from global state. That makes these exact-inverse functions trivially testable and portable
 * to any renderer.
 *
 * Everything goes through `fitRect`, so the maths measures from the map as drawn rather than from
 * the whole canvas — which is what lets one isotropic `scale` be correct for a letterboxed map.
 * See specs/map/data-model.md for the derivation.
 */

import type { CanvasSize, Loc, MapDimensions, MapProjection, MapRect, MapView, Point } from "./types";

/**
 * Where a map lands when fitted into a canvas: scaled to touch the tighter pair of edges, aspect
 * preserved, centred. The rectangle the map is drawn into *and* the rectangle the coordinate maths
 * measures from — one definition, so they can't drift.
 */
export function fitRect(image: MapDimensions, canvas: CanvasSize): MapRect {
  const fit = Math.min(canvas.width / image.width, canvas.height / image.height);
  const width = image.width * fit;
  const height = image.height * fit;
  return { x: canvas.width / 2 - width / 2, y: canvas.height / 2 - height / 2, width, height };
}

/**
 * The view's working numbers: the drawn rectangle, its centre, and EQ units per *canvas* pixel
 * (the projection's scale is per *map* pixel, so it's adjusted by how far the map was fitted).
 * `undefined` when there's no projection or nothing to draw onto.
 */
function project(projection: MapProjection | undefined, view: MapView) {
  if (!projection?.scale || !projection.center) return undefined;
  if (view.image.width <= 0 || view.image.height <= 0) return undefined;
  const rect = fitRect(view.image, view.canvas);
  if (rect.width <= 0) return undefined;
  return {
    cx: rect.x + rect.width / 2,
    cy: rect.y + rect.height / 2,
    // Equivalently image.height / rect.height — fitRect preserves the aspect ratio.
    perPx: projection.scale * (view.image.width / rect.width),
    center: projection.center,
  };
}

/**
 * EQ world coordinate → canvas pixel. Returns `undefined` when there's no projection to go by.
 */
export function eqToCanvasCoords(eq: Loc, projection: MapProjection | undefined, view: MapView): Point | undefined {
  const p = project(projection, view);
  if (!p) return undefined;
  // EQ axes run opposite to canvas pixels, so a positive EQ offset moves up/left.
  return {
    x: Math.round(p.cx - (eq.x - p.center.x) / p.perPx),
    y: Math.round(p.cy - (eq.y - p.center.y) / p.perPx),
  };
}

/**
 * Canvas pixel → EQ world coordinate (the exact inverse of {@link eqToCanvasCoords}).
 * Returns `undefined` when there's no projection to go by.
 */
export function canvasToEqCoords(px: Point, projection: MapProjection | undefined, view: MapView): Loc | undefined {
  const p = project(projection, view);
  if (!p) return undefined;
  // Negate back to EQ orientation; EQ reports coordinates y-first.
  return {
    y: Math.round(p.center.y - (px.y - p.cy) * p.perPx),
    x: Math.round(p.center.x - (px.x - p.cx) * p.perPx),
  };
}

/**
 * Keep a zoomed map covering the canvas — clamped against **the map as drawn**, not against the
 * canvas.
 *
 * The difference is the whole point. A map is letterboxed inside the canvas whenever their aspect
 * ratios differ (`fitRect`), so "the content spans canvas · zoom" counts the empty bars as content:
 * pan to an edge and you're looking at a scaled-up bar instead of more map. Measuring from `rect`
 * means the bars are never reachable once there's map to show in their place, which is what makes a
 * zoomed map fill the space it's given.
 *
 * Per axis, and independently, since a map can be letterboxed on one and not the other:
 * - the scaled map is **wider than the canvas** → the pan may run from "far edge aligned" to "near
 *   edge aligned", and no further;
 * - it **isn't** → there's nothing to reveal, so it sits centred.
 *
 * `rect` is optional so a caller with nothing drawn yet can still clamp sensibly; without it the
 * canvas stands in for the map, which is exactly true for a map that fills it.
 */
export function clampPan(pan: Point, zoom: number, canvas: CanvasSize, rect?: MapRect): Point {
  const box = rect ?? { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const axis = (start: number, span: number, viewport: number, at: number): number => {
    const scaled = span * zoom;
    // Centre it when the map can't fill the viewport: there is no more map to pull into view, so
    // every pan means the same picture, and centred is the one that reads as deliberate.
    if (scaled <= viewport) return viewport / 2 - (start + span / 2) * zoom;
    // Otherwise: near edge no further right/down than the viewport's, far edge no further left/up.
    const clamped = Math.min(-start * zoom, Math.max(viewport - (start + span) * zoom, at));
    // `-start * zoom` is `-0` for a map flush with the canvas edge, and a `-0` pan compares unequal
    // to the `0` every caller means by it — the same trap `neg` guards in eqmap.ts.
    return clamped === 0 ? 0 : clamped;
  };
  return {
    x: axis(box.x, box.width, canvas.width, pan.x),
    y: axis(box.y, box.height, canvas.height, pan.y),
  };
}
