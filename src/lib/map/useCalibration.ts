"use client";
import { useEffect, useRef, useState } from "react";
import { nudgeZone, nextStep, calibrationValues } from "@/shared/map/calibration";
import type { Zone } from "@/shared/map/types";

const CAL_KEYS = new Set([
  "w", "a", "s", "d", "i", "j", "k", "l", "-", "=",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

/**
 * Dev-only map calibration driven from the keyboard (gated by the caller on
 * `settings.debug`). Each key press nudges the *live* zone (mutating its shared
 * `size`/`centerOffset` so the map redraws), moving by the current `step`; −/=
 * change the step. Returns `values` (the copy-paste string for zones.ts) and a
 * `tick` the map view includes in its redraw deps so the dot moves as you tune.
 *
 * Stand at a known spot, `/loc`, then nudge until the dot sits right on the map.
 */
export function useCalibration(zone: Zone | undefined, enabled: boolean): { step: number; tick: number; values: string } {
  const [step, setStep] = useState(100);
  const [tick, setTick] = useState(0);
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    if (!enabled || !zone?.size) return;
    const onKey = (e: KeyboardEvent) => {
      if (!CAL_KEYS.has(e.key)) return;
      e.preventDefault();
      if (e.key === "-" || e.key === "=") {
        setStep(nextStep(new Set([e.key]), new Set(), stepRef.current).step);
        return;
      }
      const nudged = nudgeZone(zone, new Set([e.key]), stepRef.current);
      let changed = false;
      if (zone.size && (nudged.size.width !== zone.size.width || nudged.size.height !== zone.size.height)) {
        zone.size = nudged.size;
        changed = true;
      }
      if (
        nudged.centerOffset &&
        zone.centerOffset &&
        (nudged.centerOffset.x !== zone.centerOffset.x || nudged.centerOffset.y !== zone.centerOffset.y)
      ) {
        zone.centerOffset = nudged.centerOffset;
        changed = true;
      }
      if (changed) setTick((t) => t + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, zone]);

  return { step, tick, values: zone ? calibrationValues(zone) : "" };
}
