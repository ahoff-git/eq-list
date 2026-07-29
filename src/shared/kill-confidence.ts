/**
 * kill-confidence.ts — how a kill's location confidence is *shown*, in one place.
 *
 * A kill's position is inferred from the last `/loc` (see `electron/kill-log.ts`), so it
 * ranges from exact to a guess. Both the map and the kill list have to say which, and they
 * must say it the same way — so the vocabulary lives here rather than being invented twice.
 * Pure and DOM-free: the map draws the glyph on a canvas, the list renders it as text.
 */

/** One rung of the ladder from "measured" to "don't believe this". */
export interface ConfidenceTier {
  /** Drawn on the map and shown in the list. Deliberately a filling circle, not a colour
   *  alone — it has to read on a busy map and for colour-blind players. */
  glyph: string;
  /** Short name, for a legend or a filter. */
  label: string;
  /** Colour for the marker; green through amber to red as the guess gets worse. */
  color: string;
  /** Plain-language explanation, for the hover. */
  why: string;
}

const TIERS: { min: number; tier: ConfidenceTier }[] = [
  {
    min: 0.8,
    tier: {
      glyph: "◉",
      label: "measured",
      color: "#46c86b",
      why: "A fresh /loc from a player who wasn't moving — this is where it happened.",
    },
  },
  {
    min: 0.5,
    tier: {
      glyph: "◍",
      label: "close",
      color: "#a8d15a",
      why: "The position fix was recent. Near enough to trust.",
    },
  },
  {
    min: 0.2,
    tier: {
      glyph: "◎",
      label: "approximate",
      color: "#f0b429",
      why: "The fix was getting old, or you were moving. Treat the spot as roughly right.",
    },
  },
  {
    min: 0.01,
    tier: {
      glyph: "○",
      label: "guess",
      color: "#e08b3a",
      why: "A stale fix. The kill happened somewhere in this general area, at best.",
    },
  },
  {
    min: 0,
    tier: {
      glyph: "⌀",
      label: "unplaced",
      color: "#e5534b",
      why: "No usable position — no /loc close enough in time. Recorded, but not placed.",
    },
  },
];

/** The tier a confidence score falls into. */
export function confidenceTier(confidence: number): ConfidenceTier {
  return (TIERS.find(({ min }) => confidence >= min) ?? TIERS[TIERS.length - 1]).tier;
}

/** Every tier, best first — for a legend or a filter's options. */
export const CONFIDENCE_TIERS: ConfidenceTier[] = TIERS.map((t) => t.tier);

/**
 * Below this a kill isn't drawn on the map by default: plotting a pure guess as though it
 * were a measurement is worse than leaving it out. It's still in the list, labelled.
 */
export const PLOTTABLE_CONFIDENCE = 0.2;
