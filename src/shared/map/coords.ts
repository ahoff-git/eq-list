/**
 * Pure conversions between EQ world coordinates and canvas pixels.
 *
 * The heart of the map subsystem, and deliberately dependency-free: the zone (its
 * `scale` + `center`) and the view (the image's pixel size, the canvas's) are passed in,
 * nothing is read from global state. That makes these exact-inverse functions trivially
 * testable and portable to any renderer.
 *
 * Everything goes through `fitRect`, so the maths measures from the image as drawn rather
 * than from the whole canvas — which is what lets one isotropic `scale` be correct for a
 * letterboxed map. See specs/map/data-model.md for the derivation.
 */

import type { CanvasSize, Loc, MapDimensions, MapRect, MapView, Point, Zone } from "./types";

/**
 * Where an image lands when fitted into a canvas: scaled to touch the tighter pair of
 * edges, aspect preserved, centred. The rectangle the image is drawn into *and* the
 * rectangle the coordinate maths measures from — one definition, so they can't drift.
 */
export function fitRect(image: MapDimensions, canvas: CanvasSize): MapRect {
  const fit = Math.min(canvas.width / image.width, canvas.height / image.height);
  const width = image.width * fit;
  const height = image.height * fit;
  return { x: canvas.width / 2 - width / 2, y: canvas.height / 2 - height / 2, width, height };
}

/**
 * The view's working numbers: the drawn rectangle, its centre, and EQ units per *canvas*
 * pixel (the zone's scale is per *image* pixel, so it's adjusted by how far the image was
 * fitted). `undefined` when the zone isn't calibrated or there's nothing to draw onto.
 */
function project(zone: Zone | undefined, view: MapView) {
  if (!zone?.scale || !zone.center) return undefined;
  if (view.image.width <= 0 || view.image.height <= 0) return undefined;
  const rect = fitRect(view.image, view.canvas);
  if (rect.width <= 0) return undefined;
  return {
    cx: rect.x + rect.width / 2,
    cy: rect.y + rect.height / 2,
    // Equivalently image.height / rect.height — fitRect preserves the aspect ratio.
    perPx: zone.scale * (view.image.width / rect.width),
    center: zone.center,
  };
}

/**
 * EQ world coordinate → canvas pixel for a calibrated zone.
 * Returns `undefined` when the zone lacks the calibration the math needs.
 */
export function eqToCanvasCoords(eq: Loc, zone: Zone | undefined, view: MapView): Point | undefined {
  const p = project(zone, view);
  if (!p) return undefined;
  // EQ axes run opposite to canvas pixels, so a positive EQ offset moves up/left.
  return {
    x: Math.round(p.cx - (eq.x - p.center.x) / p.perPx),
    y: Math.round(p.cy - (eq.y - p.center.y) / p.perPx),
  };
}

/**
 * Canvas pixel → EQ world coordinate (the exact inverse of {@link eqToCanvasCoords}).
 * Returns `undefined` when the zone lacks the calibration the math needs.
 */
export function canvasToEqCoords(px: Point, zone: Zone | undefined, view: MapView): Loc | undefined {
  const p = project(zone, view);
  if (!p) return undefined;
  // Negate back to EQ orientation; EQ reports coordinates y-first.
  return {
    y: Math.round(p.center.y - (px.y - p.cy) * p.perPx),
    x: Math.round(p.center.x - (px.x - p.cx) * p.perPx),
  };
}

/**
 * Canvas pixel → image pixel, independent of the window size. Calibration fixes are
 * recorded in image pixels so a resize (or a zoom) can't invalidate them.
 */
export function canvasToImagePx(px: Point, view: MapView): Point | undefined {
  const rect = fitRect(view.image, view.canvas);
  if (rect.width <= 0) return undefined;
  const fit = rect.width / view.image.width;
  return { x: (px.x - rect.x) / fit, y: (px.y - rect.y) / fit };
}

/**
 * Keep a zoomed map covering the canvas. The scaled content spans `canvas · zoom`, so the pan
 * may run from "right/bottom edge aligned" to zero — anything outside that drags the map off
 * into blank space, which is never what you meant. At fit (zoom ≤ 1) there's nowhere to go.
 */
export function clampPan(pan: Point, zoom: number, canvas: CanvasSize): Point {
  if (zoom <= 1) return { x: 0, y: 0 };
  const limit = (span: number) => span - span * zoom; // ≤ 0
  return {
    x: Math.min(0, Math.max(limit(canvas.width), pan.x)),
    y: Math.min(0, Math.max(limit(canvas.height), pan.y)),
  };
}

/** Image pixel → canvas pixel (the inverse of {@link canvasToImagePx}). */
export function imagePxToCanvas(px: Point, view: MapView): Point | undefined {
  if (view.image.width <= 0) return undefined;
  const rect = fitRect(view.image, view.canvas);
  const fit = rect.width / view.image.width;
  return { x: rect.x + px.x * fit, y: rect.y + px.y * fit };
}
