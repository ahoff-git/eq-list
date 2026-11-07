/**
 * cruising.ts — when you are winning comfortably with your own sword, and the builder's damage-first loadout
 * would swing meaningfully harder than the one your goals plan, that is a suggestion: spend some of the
 * survivability you aren't using on damage
 * ([ADR 0365](../../../specs/decisions/0365-winning-comfortably-suggests-trading-survivability-for-damage.md)).
 *
 * Every other suggestion answers a problem (a resist, armour, mana, health). This one answers its absence, so
 * it is deliberately hard to earn — a window of fights, not one — and each part of "comfortable" is one the
 * log can state:
 *
 * - **No deaths.** One is enough to say no: a death is the one outcome that is not close to a scratch.
 * - **Little taken for what you dealt.** The log never says how much health you have (ADR 0018 only bounds it,
 *   and a healer in the group routinely makes a fight's total many times that bound), so how close a fight
 *   came is read as a ratio of damage taken to damage dealt, the same two sums the damage profile makes.
 * - **You didn't run dry**, which would say mana is the thing you are short of.
 * - **Your own melee is most of what you deal.** A harder swing does nothing for a caster's spells or a
 *   pet's bites, and gear the builder models for damage is gear for swinging.
 *
 * What it offers is a *swap*, not a gain over what you wear: the damage-first plan against the plan for your
 * goals (`Lean`). Wearing the plan you already made is not a trade, and a player whose goals already put damage
 * first has nothing more to give — the two plans swing alike, and this stays quiet.
 *
 * Pure → a tested black box.
 */
import { SELF } from "./combat-parser";
import { MIN_AC_GAIN } from "./ac-headroom";
import { landedOnYou, type FightStatsHolder } from "./damage-profile";
import { worthSaying, type Lean } from "./headroom";
import { MIN_HP_GAIN, MIN_MANA_GAIN, runsDry, type Strain } from "./strain";
import type { DamageCell } from "../types";

/** A window needs this many fights before "winning comfortably" means anything. */
export const MIN_CRUISE_FIGHTS = 10;
/** Comfortable: you took no more than this share of what you dealt. On the real history this changed nothing (melee share did the choosing); it is the guard for harder content. */
export const CRUISE_TAKEN_RATIO = 0.2;
/** A harder swing is only worth offering when this much of what you deal is your own melee. */
export const CRUISE_MELEE_SHARE = 0.5;
/** The least swing score per second worth saying; the shared ratio (`MIN_GAIN_RATIO`) covers a big total. */
export const MIN_SWING_GAIN = 2;

/** The sums "comfortably" is read from, over a window of fights. */
export interface Cruise {
  fights: number;
  /** Fights that ended with you dying in them. */
  died: number;
  /** What you dealt yourself — not your pet — and how much of it was melee. */
  dealt: number;
  melee: number;
  /** What landed on you. */
  taken: number;
}

const dealtByYou = (c: Pick<DamageCell, "target" | "attacker">): boolean => c.attacker === SELF && c.target !== SELF;

/** The window's deaths, what you dealt (melee apart), and what you took. A fight stored before its cells existed adds no damage. */
export function cruise(fights: readonly FightStatsHolder[]): Cruise {
  const sums: Cruise = { fights: fights.length, died: 0, dealt: 0, melee: 0, taken: 0 };
  for (const { stats } of fights) {
    if (stats.deaths?.length) sums.died += 1;
    for (const cell of stats.damageCells ?? []) {
      if (dealtByYou(cell)) {
        sums.dealt += cell.damage;
        if (cell.kind === "Melee") sums.melee += cell.damage;
      } else if (landedOnYou(cell)) {
        sums.taken += cell.damage;
      }
    }
  }
  return sums;
}

/** A pool that gets smaller on the way from your goals' plan to the damage-first one. */
export interface Fall {
  stat: "ac" | "hp" | "mana";
  plan: number;
  lean: number;
}

export interface SwingSuggestion {
  /** The swing score per second of your goals' plan and of the damage-first plan, rounded, and the gain. */
  plan: number;
  lean: number;
  gain: number;
  fights: number;
  /** Damage taken as a share of damage dealt, and your melee as a share of what you dealt — 0–1 (taken can pass 1 only in a bad window, which isn't flagged). */
  takenRatio: number;
  meleeShare: number;
  /** What the harder swing costs, in the pools that fall by enough to mention. Empty when it costs next to nothing. */
  falls: Fall[];
}

/** Each pool's smallest fall worth mentioning — the same per-stat scale as every other suggestion's gain. */
const FALL_MINIMUM: Record<Fall["stat"], number> = { ac: MIN_AC_GAIN, hp: MIN_HP_GAIN, mana: MIN_MANA_GAIN };

/** The pools the damage-first plan gives up, asked the way a gain is: "is the difference worth saying?", reversed. */
function fallsOf(lean: Lean): Fall[] {
  return (Object.keys(FALL_MINIMUM) as Fall["stat"][]).flatMap((stat) => {
    const fall = worthSaying({ wearing: lean[stat].lean, loadout: lean[stat].plan }, FALL_MINIMUM[stat]);
    return fall ? [{ stat, plan: fall.loadout, lean: fall.wearing }] : [];
  });
}

/**
 * The suggestion for this window, or null: too few fights, a death, too much taken, running dry, not a
 * swordsman, the builder hasn't planned the damage-first loadout yet (`lean` undefined), or it swings no
 * harder than your goals' plan already does.
 */
export function swingSuggestion(c: Cruise, strain: Strain, lean: Lean | undefined): SwingSuggestion | null {
  if (!lean || c.fights < MIN_CRUISE_FIGHTS || c.died > 0 || c.dealt <= 0 || runsDry(strain)) return null;
  const takenRatio = c.taken / c.dealt;
  const meleeShare = c.melee / c.dealt;
  if (takenRatio > CRUISE_TAKEN_RATIO || meleeShare < CRUISE_MELEE_SHARE) return null;
  const swing = worthSaying({ wearing: lean.swing.plan, loadout: lean.swing.lean }, MIN_SWING_GAIN);
  // A plan that swings nothing has no "harder" to be measured against — and the sentence says a percentage.
  if (!swing || swing.wearing <= 0) return null;
  return { plan: swing.wearing, lean: swing.loadout, gain: swing.gain, fights: c.fights, takenRatio, meleeShare, falls: fallsOf(lean) };
}
