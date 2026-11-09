"use client";
import { useRecordStatBuffMoves } from "@/lib/items/useStatsDrift";

/**
 * Watches the buff board for stat buffs coming and going — and draws nothing
 * ([ADR 0369](../../../../specs/decisions/0369-a-stale-stats-read-says-so.md)).
 *
 * A component rather than a call in the page because **it is only worth having while a stats read exists**:
 * classifying a buff needs the whole spell catalogue (7 MB of cards, turned into rows), and a window that
 * loaded that at every launch for people who never calibrate would be paying for a reminder nobody asked for.
 * The page mounts this when there is a stamp. Moves before the stamp don't matter (the read already holds
 * them), and the board it looks at first is the baseline, so starting late loses nothing.
 */
export default function StatBuffWatcher() {
  useRecordStatBuffMoves();
  return null;
}
