/**
 * bis-columns.ts — which stats the loadout grid shows a column for: the ones the player has said
 * they care about. A stat they weighted, set a goal on, or put a floor under is a number they'll want
 * to read down the slots, not only inside "Value".
 *
 * Pure → a tested black box.
 */
import { STATS, type StatKey } from "./item-stats";
import { weightedStats, type StatWeights } from "./item-search";
import type { BisGoals } from "./bis-goals";

/** The stats worth a column, in card order. Melee swing is a goal but not a stat on a card, so it has none. */
export function expectedStats(weights: StatWeights, goals: BisGoals, mins: Partial<Record<StatKey, number>> = {}): StatKey[] {
  const wanted = new Set<StatKey>([
    ...weightedStats(weights),
    ...(Object.keys(goals) as (StatKey | "swing")[]).filter((k): k is StatKey => k !== "swing"),
    ...(Object.keys(mins) as StatKey[]),
  ]);
  return STATS.filter((s) => wanted.has(s.key)).map((s) => s.key);
}
