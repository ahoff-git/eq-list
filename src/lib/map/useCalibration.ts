"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  calibrationValues,
  nextStep,
  nudgeCalibration,
  solveCalibration,
  type Calibration,
  type Fix,
} from "@/shared/map/calibration";
import type { Loc, MapDimensions, Point, Zone } from "@/shared/map/types";

const CAL_KEYS = new Set([
  "w", "s", "i", "j", "k", "l", "-", "=",
  "ArrowUp", "ArrowDown",
]);

/**
 * Dev-only map calibration (gated by the caller on `settings.debug`).
 *
 * The main flow is **fixes**: stand somewhere, `/loc`, click that spot on the map. The
 * first fix places the map; a second one far from the first also sets its scale, so a map
 * with no calibration at all becomes a calibrated one in two clicks (see ADR 0038). The
 * keyboard is left for fine-tuning afterwards — I/J/K/L move the centre by `step` EQ
 * units, W/S grow/shrink the scale, −/= change the step.
 *
 * Either way the solved values are written onto the *live* zone so the map redraws under
 * you, and `values` is the paste-ready line for zones.ts (the tool still doesn't persist —
 * see the map spec's non-responsibilities).
 */
export function useCalibration(
  zone: Zone | undefined,
  enabled: boolean,
): {
  step: number;
  tick: number;
  values: string;
  fixes: Point[];
  /** Record "this EQ location is at this image pixel" and re-solve from every fix so far. */
  addFix: (eq: Loc, px: Point, image: MapDimensions) => void;
  clearFixes: () => void;
} {
  const [step, setStep] = useState(100);
  const [tick, setTick] = useState(0);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const stepRef = useRef(step);
  stepRef.current = step;

  /** Write a solved calibration onto the live zone, and redraw if it actually moved. */
  const apply = useCallback((target: Zone, cal: Calibration) => {
    const moved = target.scale !== cal.scale || target.center?.y !== cal.center.y || target.center?.x !== cal.center.x;
    target.scale = cal.scale;
    target.center = cal.center;
    if (moved) setTick((t) => t + 1);
  }, []);

  // Leaving calibration mode (or changing zone) drops the fixes: they're clicks on *this*
  // map, and carrying them onto the next one would silently calibrate it from nonsense.
  useEffect(() => {
    if (!enabled) setFixes([]);
  }, [enabled, zone?.key]);

  // The image's pixel size comes in with the click rather than being held here: it's read
  // off the loaded map (never authored), and it's only ever needed to solve a fix.
  const addFix = useCallback(
    (eq: Loc, px: Point, image: MapDimensions) => {
      if (!zone) return;
      setFixes((prev) => {
        const next = [...prev, { eq, px }];
        const solved = solveCalibration(next, image, zone.scale);
        if (solved) apply(zone, solved);
        return next;
      });
    },
    [zone, apply],
  );

  const clearFixes = useCallback(() => setFixes([]), []);

  // Stable identity: the map draws these on a canvas keyed by the array, so a fresh one
  // per render would repaint the overlay on every unrelated state change.
  const fixPoints = useMemo(() => fixes.map((f) => f.px), [fixes]);

  useEffect(() => {
    if (!enabled || !zone) return;
    const onKey = (e: KeyboardEvent) => {
      if (!CAL_KEYS.has(e.key)) return;
      e.preventDefault();
      if (e.key === "-" || e.key === "=") {
        setStep(nextStep(new Set([e.key]), new Set(), stepRef.current).step);
        return;
      }
      // Nothing to nudge until the map has been placed — that's what a fix is for.
      if (!zone.scale || !zone.center) return;
      apply(zone, nudgeCalibration({ scale: zone.scale, center: zone.center }, new Set([e.key]), stepRef.current));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, zone, apply]);

  return { step, tick, values: zone ? calibrationValues(zone) : "", fixes: fixPoints, addFix, clearFixes };
}
