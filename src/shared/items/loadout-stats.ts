/**
 * loadout-stats.ts — what a set of worn gear adds up to, stat by stat.
 *
 * Best in slot ranks loadouts by one weighted number; this is the breakdown behind it, so "wearing
 * now" and "best in slot" can be compared on the stats themselves. Each piece is read at its grade
 * by the caller (`gradedItemStats`), so this only adds.
 *
 * Not every stat is a total:
 *   - **AC, HP, Mana, attributes, resists and weight add up**, piece by piece.
 *   - **Haste doesn't stack** — the highest worn haste is the one that applies — so it's a max.
 *   - **A weapon's swing (DMG, Delay, Ratio, Backstab)** describes that weapon, not the character, so
 *     summing two weapons' delays would be a number about nothing. Left out.
 *
 * Pure → a tested black box.
 */
import { STATS, type ItemStats, type StatKey } from "./item-stats";

/** Stats a loadout's total is reported for, in card order. */
export const LOADOUT_STATS: readonly StatKey[] = STATS.filter((s) => s.group !== "weapon" || s.key === "haste" || s.key === "wt").map((s) => s.key);

/** Stats where the best single piece counts, not the sum. */
const HIGHEST_COUNTS: ReadonlySet<StatKey> = new Set(["haste"]);

export type LoadoutStats = Partial<Record<StatKey, number>>;

/** What these pieces add up to. A stat none of them gives is absent, not 0. */
export function loadoutStats(pieces: readonly Pick<ItemStats, "stats">[]): LoadoutStats {
  const out: LoadoutStats = {};
  for (const { stats } of pieces) {
    for (const key of LOADOUT_STATS) {
      const v = stats[key];
      if (v === undefined) continue;
      const held = out[key];
      out[key] = held === undefined ? v : HIGHEST_COUNTS.has(key) ? Math.max(held, v) : held + v;
    }
  }
  // Graded stats carry fractions (a half-grade's rounding, a 0.1 weight); a total shows like a card.
  for (const key of Object.keys(out) as StatKey[]) out[key] = Math.round(out[key]! * 10) / 10;
  return out;
}

/** One row of a before/after comparison: a stat either side gives. */
export interface StatComparison {
  key: StatKey;
  before?: number;
  after?: number;
  /** `after − before`, a missing side counting as 0. */
  change: number;
}

/** The stats either side gives, in card order, with the change from `before` to `after`. */
export function compareLoadoutStats(before: LoadoutStats, after: LoadoutStats): StatComparison[] {
  return LOADOUT_STATS.filter((key) => before[key] !== undefined || after[key] !== undefined).map((key) => ({
    key,
    before: before[key],
    after: after[key],
    change: Math.round(((after[key] ?? 0) - (before[key] ?? 0)) * 10) / 10,
  }));
}
