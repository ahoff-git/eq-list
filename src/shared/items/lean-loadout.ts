/**
 * lean-loadout.ts — the loadout built for damage, set beside the one built for your goals, so the status bar
 * can say what a harder swing would cost
 * ([ADR 0365](../../../specs/decisions/0365-winning-comfortably-suggests-trading-survivability-for-damage.md)).
 *
 * "Built for damage" is not a new idea here: it is the builder's own **Melee damage** preset (swing first, HP
 * and AC held at 70% of the most any loadout reaches), so the plan on offer is one a player can reproduce with a
 * click and can read the reasons for in the goals above it. Only the comparison is new: both plans are
 * made from the same pool, criteria, weights and melee model, and the swap is read off the two.
 *
 * Pure → a tested black box. Running the plans is the caller's (`useLeanLoadout`).
 */
import type { Lean } from "../combat/headroom";
import { GOAL_PRESETS, type GoalPreset } from "./bis-goals";
import { effectiveStats, type LoadoutStats } from "./loadout-stats";
import type { DerivedRate } from "./derived-stats";

/** The preset the damage-first plan is made from. */
// A missing preset is a bug the test for this module catches, not a state to limp through.
export const LEAN_PRESET: GoalPreset = GOAL_PRESETS.find((p) => p.id === "melee")!;

/** The part of a plan the swap reads — a `BisPlan` has it, and a test needn't build one. */
export interface PlanFigures {
  stats: { loadout: LoadoutStats };
  damage: { loadout: { perSecond: number; procPerSecond: number }; model: { melee: { procDamage: boolean } } };
}

/** Swing score per second, counting a weapon's proc damage when the player's melee weights do (as `damage-plan.ts` does for "most damage"). */
const swingOf = ({ damage }: PlanFigures): number => damage.loadout.perSecond + (damage.model.melee.procDamage ? damage.loadout.procPerSecond : 0);

/**
 * What changes between your goals' plan and the damage-first one: swing, and the three pools a swing might
 * cost, attributes counted (`effectiveStats`) like every other figure the status bar borrows.
 */
export function leanSwap(plan: PlanFigures, lean: PlanFigures, rates: readonly DerivedRate[]): Lean {
  const planned = effectiveStats(plan.stats.loadout, rates).total;
  const leaned = effectiveStats(lean.stats.loadout, rates).total;
  const swap = (stat: "ac" | "hp" | "mana") => ({ plan: planned[stat] ?? 0, lean: leaned[stat] ?? 0 });
  return { swing: { plan: swingOf(plan), lean: swingOf(lean) }, ac: swap("ac"), hp: swap("hp"), mana: swap("mana") };
}
