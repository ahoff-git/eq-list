/**
 * headroom.ts — how much more of a stat the loadout builder's loadout reaches than you wear, and when
 * that is worth saying. AC, health and mana are all asked the same question of the same two totals, so
 * the question is asked once ([ADR 0362](../../../specs/decisions/0362-melee-damage-suggests-the-ac-the-loadout-already-reaches.md),
 * [0363](../../../specs/decisions/0363-running-dry-and-dying-suggest-mana-and-health.md)).
 *
 * "How much more could I wear" needs no model of what the stat is worth, only the two numbers the builder
 * already has. And because the loadout follows the player's own goals and weights, the figure is the stat
 * *with the build kept*, not the stat at any price.
 *
 * Pure → a tested black box.
 */

/** A gain is worth saying at this share of what you wear, however many points it is — rounding on a big total stays quiet. */
export const MIN_GAIN_RATIO = 0.1;

/**
 * One stat, worn against reachable — both with attributes counted (`effectiveStats`), so health and mana
 * include what stamina and the casting stat give.
 */
export interface Reach {
  wearing: number;
  loadout: number;
}

/**
 * One stat, planned for your goals against planned for damage — the trade the builder could make if you
 * gave up some survivability for a harder swing ([ADR 0365](../../../specs/decisions/0365-winning-comfortably-suggests-trading-survivability-for-damage.md)).
 * Not "worn": what you wear has no part in it, only the two plans.
 */
export interface Swap {
  plan: number;
  lean: number;
}

/** The damage-first plan against the goals' plan: swing, and each pool a harder swing might cost. */
export interface Lean {
  /** Swing score per second (`melee.ts`'s yardstick), proc damage included when the player counts it. */
  swing: Swap;
  ac: Swap;
  hp: Swap;
  mana: Swap;
}

/** What the builder has planned, for the stats the status bar can suggest, and the inventory dump it was figured from. */
export interface Headroom {
  ac: Reach;
  hp: Reach;
  mana: Reach;
  /** Absent until the builder has planned the damage-first loadout too — it follows the main plan, off the render. */
  lean?: Lean;
  /**
   * The figures are only about *that* inventory dump, so they are dropped when a newer one arrives and
   * the builder hasn't planned again.
   */
  at?: number;
}

/** A gain worth saying: the two totals, rounded, and the difference. */
export interface Gain extends Reach {
  gain: number;
}

/**
 * The gain on offer, or null when there is no figure, the loadout reaches no more than you wear, or
 * the difference is too small to mention — fewer than `minGain` points, or under `MIN_GAIN_RATIO` of what
 * is worn. `minGain` is the stat's own scale: five points of AC is a lot, five of mana is nothing.
 */
export function worthSaying(reach: Reach | undefined, minGain: number): Gain | null {
  if (!reach) return null;
  // The gain is the difference of the rounded totals, which are what a sentence prints — rounding the
  // difference instead can say "wear 60, reaches 125 (+64)" when the totals carry fractions.
  const wearing = Math.round(reach.wearing);
  const loadout = Math.round(reach.loadout);
  const gain = loadout - wearing;
  if (gain < Math.max(minGain, wearing * MIN_GAIN_RATIO)) return null;
  return { wearing, loadout, gain };
}
