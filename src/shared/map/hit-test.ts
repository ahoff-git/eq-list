/**
 * Which marker the cursor is on. Pure, because the interesting part isn't the arithmetic — it's
 * what happens when markers overlap, and a map gets crowded fast: a kill dot can sit under a pin,
 * a peer can stand on a zone line's label, and every one of them wants to be the thing you meant.
 */

import type { Point } from "./types";

/** A marker as the hit-test sees it: where it is on screen, how big, and how much it matters. */
export interface Hittable {
  /** Screen position, already projected. */
  at: Point;
  /** How close the cursor must be, in pixels. */
  radius: number;
  /**
   * Breaks a tie when two markers overlap, higher first. Distance still decides between markers
   * you can clearly tell apart; this only settles the near-coincident case, where the thing you
   * placed yourself is what you meant.
   */
  priority: number;
}

/**
 * How much a priority step is worth, in pixels of cursor distance. Small on purpose: a marker
 * plainly nearer the cursor should still win, so priority only breaks a near-tie.
 */
const PRIORITY_PX = 5;

/**
 * The marker under `cursor`, or undefined. Nearest wins, with `priority` settling overlaps —
 * which is the whole reason this isn't inline in the panel.
 */
export function pickHit<T extends Hittable>(items: readonly T[], cursor: Point): T | undefined {
  let best: T | undefined;
  let bestScore = Infinity;
  for (const item of items) {
    const distance = Math.hypot(item.at.x - cursor.x, item.at.y - cursor.y);
    if (distance > item.radius) continue;
    const score = distance - item.priority * PRIORITY_PX;
    if (score < bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}
