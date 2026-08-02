/**
 * Pure calibration math: given a zone and the keys pressed, compute the next
 * `size` / `centerOffset` and step size. No listeners, no state, no globals — the
 * caller owns keyboard handling and decides how to store results. Ported from
 * eq-map (ADR 0010); `nudgeZone` gained a `step` param so a press moves by the
 * chosen step (the original moved by 1, unusably slow on multi-thousand-unit zones).
 *
 * Keys: W/A/S/D or arrows grow/shrink height/width · I/J/K/L nudge the centre
 * offset · −/= shrink/grow the step (clamped 100..5000).
 */

import type { Loc, Zone } from "./types";

export type ZoneSize = { width: number; height: number };
export const MIN_STEP = 10;
export const MAX_STEP = 500;

/**
 * Updated `size` (and `centerOffset`, when the zone has one) for the held keys,
 * each axis moved by `step`. Returns fresh objects; never mutates `zone`.
 */
export function nudgeZone(zone: Zone, keys: Set<string>, step = 1): { size: ZoneSize; centerOffset?: Loc } {
  const size: ZoneSize = { width: zone.size?.width ?? 0, height: zone.size?.height ?? 0 };

  if (keys.has("a") || keys.has("ArrowLeft")) size.width -= step;
  if (keys.has("w") || keys.has("ArrowUp")) size.height += step;
  if (keys.has("d") || keys.has("ArrowRight")) size.width += step;
  if (keys.has("s") || keys.has("ArrowDown")) size.height -= step;

  if (!zone.centerOffset) return { size };

  const centerOffset: Loc = { ...zone.centerOffset };
  if (keys.has("j")) centerOffset.x += step;
  if (keys.has("i")) centerOffset.y += step;
  if (keys.has("l")) centerOffset.x -= step;
  if (keys.has("k")) centerOffset.y -= step;

  return { size, centerOffset };
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
  const s = zone.size;
  const c = zone.centerOffset;
  return `size: { width: ${s?.width}, height: ${s?.height} }, centerOffset: { y: ${c?.y}, x: ${c?.x} }`;
}
