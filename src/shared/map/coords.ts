/**
 * Pure conversions between EQ world coordinates and canvas pixels.
 *
 * The heart of the map subsystem, and deliberately dependency-free: the zone
 * (its `size` + `centerOffset`) and the canvas size are passed in, nothing is
 * read from global state. That makes these exact-inverse functions trivially
 * testable and portable to any renderer.
 *
 * See specs/map/data-model.md for the derivation.
 */

import type { Loc, Point, CanvasSize, Zone } from "./types";

/**
 * EQ world coordinate → canvas pixel for a calibrated zone.
 * Returns `undefined` when the zone lacks the calibration the math needs.
 */
export function eqToCanvasCoords(eq: Loc, zone: Zone | undefined, size: CanvasSize): Point | undefined {
  if (!zone?.size || !zone.centerOffset) return undefined;

  // EQ axes run opposite to canvas pixels, so negate first.
  const unscaled = { x: 0 - eq.x, y: 0 - eq.y };

  const centered = {
    x: ((unscaled.x - zone.centerOffset.x) * size.width) / zone.size.width,
    y: ((unscaled.y - zone.centerOffset.y) * size.height) / zone.size.height,
  };

  return {
    x: Math.round(centered.x + size.width / 2),
    y: Math.round(centered.y + size.height / 2),
  };
}

/**
 * Canvas pixel → EQ world coordinate (the exact inverse of {@link eqToCanvasCoords}).
 * Returns `undefined` when the zone lacks the calibration the math needs.
 */
export function canvasToEqCoords(px: Point, zone: Zone | undefined, size: CanvasSize): Loc | undefined {
  if (!zone?.size || !zone.centerOffset) return undefined;

  // Shift origin to the canvas center.
  const centered = { x: px.x - size.width / 2, y: px.y - size.height / 2 };

  const scaled = {
    x: (centered.x / size.width) * zone.size.width + zone.centerOffset.x,
    y: (centered.y / size.height) * zone.size.height + zone.centerOffset.y,
  };

  // Negate back to EQ orientation; EQ reports coordinates y-first.
  return { y: 0 - Math.round(scaled.y), x: 0 - Math.round(scaled.x) };
}
