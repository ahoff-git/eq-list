/**
 * Pure calibration math: work out a map's `scale` and `center` from what the player can
 * actually tell us, and fine-tune them from the keyboard. No listeners, no state, no
 * globals — the caller owns keyboard/mouse handling and decides how to store results.
 *
 * The load-bearing idea is a **fix**: you stand somewhere, `/loc` to learn the EQ
 * coordinate, and click that spot on the map. That pairs a world coordinate with an image
 * pixel. One fix places the map (`center`); two fixes far apart also give its scale, since
 * the EQ distance between them divided by the pixel distance *is* EQ units per pixel.
 * That's the whole calibration — see ADR 0038.
 *
 * Keys, for tuning afterwards: I/J/K/L nudge the centre by `step` EQ units · W/S (or the
 * up/down arrows) grow/shrink the scale by `SCALE_NUDGE` · −/= change the step.
 */

import type { Loc, MapDimensions, Point, Zone } from "./types";

/** What calibration produces: the two numbers a zone needs to plot a coordinate. */
export type Calibration = { scale: number; center: Loc };

/** A known EQ location, paired with the **image pixel** the player says it sits on. */
export type Fix = { eq: Loc; px: Point };

export const MIN_STEP = 10;
export const MAX_STEP = 500;
/** One scale keypress, as a fraction — 1% per press is fine tuning at any zone size. */
export const SCALE_NUDGE = 0.01;

/**
 * The `center` that puts `fix.eq` exactly on `fix.px`, at a given scale. EQ axes run
 * opposite to pixels, so a fix right of the image centre is *west* of the map's centre.
 */
export function centerFrom(fix: Fix, scale: number, image: MapDimensions): Loc {
  return {
    y: Math.round(fix.eq.y + (fix.px.y - image.height / 2) * scale),
    x: Math.round(fix.eq.x + (fix.px.x - image.width / 2) * scale),
  };
}

/** The pair of fixes furthest apart in pixels — the most accurate scale a set can give. */
function widestPair(fixes: Fix[]): [Fix, Fix] | undefined {
  let best: [Fix, Fix] | undefined;
  let bestPx = 0;
  for (let i = 0; i < fixes.length; i++) {
    for (let j = i + 1; j < fixes.length; j++) {
      const px = Math.hypot(fixes[j].px.x - fixes[i].px.x, fixes[j].px.y - fixes[i].px.y);
      if (px > bestPx) {
        bestPx = px;
        best = [fixes[i], fixes[j]];
      }
    }
  }
  return best;
}

/**
 * Solve a calibration from fixes. Two or more (separated) fixes give the scale outright;
 * with a single fix the map can only be *placed*, so `fallbackScale` is kept — which is
 * the useful behaviour for nudging an already-calibrated map onto one known spot.
 *
 * The centre is averaged over every fix, so a shaky click on one of them is diluted rather
 * than decisive. Returns `undefined` when there's nothing to solve from.
 */
export function solveCalibration(
  fixes: Fix[],
  image: MapDimensions,
  fallbackScale?: number,
): Calibration | undefined {
  if (fixes.length === 0 || image.width <= 0 || image.height <= 0) return undefined;

  const pair = widestPair(fixes);
  let scale = fallbackScale;
  if (pair) {
    const [a, b] = pair;
    const eqDist = Math.hypot(b.eq.x - a.eq.x, b.eq.y - a.eq.y);
    const pxDist = Math.hypot(b.px.x - a.px.x, b.px.y - a.px.y);
    // Two fixes on the same spot say nothing about scale — keep what we had.
    if (eqDist > 0 && pxDist > 0) scale = eqDist / pxDist;
  }
  if (!scale || scale <= 0) return undefined;

  const centers = fixes.map((f) => centerFrom(f, scale!, image));
  return {
    scale: Number(scale.toFixed(4)),
    center: {
      y: Math.round(centers.reduce((sum, c) => sum + c.y, 0) / centers.length),
      x: Math.round(centers.reduce((sum, c) => sum + c.x, 0) / centers.length),
    },
  };
}

/**
 * A calibration nudged by the held keys: the centre by `step` EQ units, the scale by a
 * fixed percentage (so one keypress means the same thing on a hut and on a continent).
 * Returns a fresh object; never mutates its input.
 */
export function nudgeCalibration(cal: Calibration, keys: Set<string>, step = 1): Calibration {
  let scale = cal.scale;
  if (keys.has("w") || keys.has("ArrowUp")) scale *= 1 + SCALE_NUDGE;
  if (keys.has("s") || keys.has("ArrowDown")) scale *= 1 - SCALE_NUDGE;

  const center: Loc = { ...cal.center };
  if (keys.has("j")) center.x += step;
  if (keys.has("i")) center.y += step;
  if (keys.has("l")) center.x -= step;
  if (keys.has("k")) center.y -= step;

  return { scale: Number(scale.toFixed(4)), center };
}

/**
 * Next step size from the −/= keys, honoring a "no-repeat" set so a held key only
 * fires once. `consumed` lists keys the caller should add to its no-repeat set.
 * Clamped to [MIN_STEP, MAX_STEP].
 */
export function nextStep(
  keys: Set<string>,
  noRepeat: Set<string>,
  step: number,
): { step: number; consumed: string[] } {
  let next = step;
  const consumed: string[] = [];

  if (keys.has("-") && !noRepeat.has("-")) {
    next = Math.max(MIN_STEP, step - 10);
    consumed.push("-");
  }
  if (keys.has("=") && !noRepeat.has("=")) {
    next = Math.min(MAX_STEP, step + 10);
    consumed.push("=");
  }

  return { step: next, consumed };
}

/** The copy-pasteable calibration string shown in the UI (drops straight into zones.ts). */
export function calibrationValues(zone: Zone): string {
  return `scale: ${zone.scale}, center: { y: ${zone.center?.y}, x: ${zone.center?.x} }`;
}
