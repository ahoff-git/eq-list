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
 * **HP, mana and AC are also made of attributes**: STA into HP, INT/WIS into mana, AGI into AC, at
 * your classes' and level's rates (`derived-stats.ts`, ADR 0317) — the same rates the value weights
 * are folded with, so the totals shown and the score agree. `effectiveStats` adds them; the comparison
 * says how much of each total came that way.
 *
 * Pure → a tested black box.
 */
import { STATS, type ItemStats, type StatKey } from "./item-stats";
import type { DerivedRate } from "./derived-stats";

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

/** Totals with what attributes add to HP, mana and AC folded in, and how much each fold added. */
export interface EffectiveStats {
  total: LoadoutStats;
  /** For each secondary stat, the part of `total` the attributes gave — absent where they gave none. */
  fromAttributes: LoadoutStats;
}

/**
 * The totals as your character would see them: each rate adds what the gear's `from` buys in `to` — so
 * +40 STA on a Warrior/Shaman at 50 is HP as well as STA. With the race known that's exact across the
 * bands (`curve(base + gear) − curve(base)`: 20 AGI that lifts a 70 to 90 is 25 AC back and 5 more, not
 * 6.67); without it, `points × perPoint`. Whole points, as the game shows a pool.
 */
export function effectiveStats(stats: LoadoutStats, rates: readonly DerivedRate[]): EffectiveStats {
  const total: LoadoutStats = { ...stats };
  const fromAttributes: LoadoutStats = {};
  for (const rate of rates) {
    const points = stats[rate.from];
    if (!points) continue;
    const added = Math.round(rate.curve && rate.base !== undefined ? rate.curve(rate.base + points) - rate.curve(rate.base) : points * rate.perPoint);
    if (!added) continue;
    fromAttributes[rate.to] = (fromAttributes[rate.to] ?? 0) + added;
    total[rate.to] = (total[rate.to] ?? 0) + added;
  }
  return { total, fromAttributes };
}

/** One row of a before/after comparison: a stat either side gives. */
export interface StatComparison {
  key: StatKey;
  before?: number;
  after?: number;
  /** `after − before`, a missing side counting as 0. */
  change: number;
  /** How much of `before` / `after` the attributes gave (HP, mana and AC only). */
  fromAttributes?: { before?: number; after?: number };
}

/**
 * The stats either side gives, in card order, with the change from `before` to `after`. With `rates`,
 * HP, mana and AC are the effective totals — attributes included — and each says how much came that way.
 */
export function compareLoadoutStats(before: LoadoutStats, after: LoadoutStats, rates: readonly DerivedRate[] = []): StatComparison[] {
  const b = effectiveStats(before, rates);
  const a = effectiveStats(after, rates);
  return LOADOUT_STATS.filter((key) => b.total[key] !== undefined || a.total[key] !== undefined).map((key) => {
    const via = b.fromAttributes[key] !== undefined || a.fromAttributes[key] !== undefined;
    return {
      key,
      before: b.total[key],
      after: a.total[key],
      change: Math.round(((a.total[key] ?? 0) - (b.total[key] ?? 0)) * 10) / 10,
      ...(via && { fromAttributes: { before: b.fromAttributes[key], after: a.fromAttributes[key] } }),
    };
  });
}
