"use client";
import { UI_SCALE, clampScale, type ScaleRange } from "@/shared/constants";

/**
 * The A− / A+ interface-scale pair for a window title bar. Each window scales *itself*: the
 * main window and the map keep separate values, because one is a column of text you shrink to
 * reclaim desk space and the other is a picture you enlarge to read (see
 * [ADR 0026](../../../specs/decisions/0026-interface-scale-only-shrinks.md) for why 100% is the
 * ceiling). The caller owns which setting the value lands in.
 */
export default function ScaleButtons({
  scale,
  onScale,
  what = "interface",
  range = UI_SCALE,
}: {
  scale: number;
  onScale: (next: number) => void;
  /** Named in the tooltip, so it's clear which window is being resized. */
  what?: string;
  /** Its allowed range — the map's goes above 100% (see `MAP_UI_SCALE`). */
  range?: ScaleRange;
}) {
  const step = (direction: number) => {
    const next = clampScale(scale + direction * range.step, range);
    if (next !== scale) onScale(next);
  };
  const percent = Math.round(scale * 100);
  return (
    <>
      <button
        className="wc"
        title={`Smaller ${what} — ${percent}%`}
        onClick={() => step(-1)}
        disabled={scale <= range.min}
      >
        A−
      </button>
      <button
        className="wc"
        title={`Larger ${what} — ${percent}%${range.max <= 1 ? " (100% is full size)" : ""}`}
        onClick={() => step(1)}
        disabled={scale >= range.max}
      >
        A+
      </button>
    </>
  );
}
