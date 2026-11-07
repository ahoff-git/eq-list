/**
 * strain.ts — the two things a window of fights can say that no resist or armour answers: you ran out of
 * mana, or you died. Each earns the same suggestion — more of the pool that failed — when the loadout
 * builder's loadout reaches more of it than you wear
 * ([ADR 0363](../../../specs/decisions/0363-running-dry-and-dying-suggest-mana-and-health.md)).
 *
 * - **Mana** is read from `FightStats.outOfMana`: of the fights where you cast at all, the share in which
 *   you ran dry. A fight stored before it was recorded can't say, so it isn't counted against you.
 * - **Health** is read from deaths. The log never states your hit points (the app only infers a bound, ADR 0018),
 *   so how close a fight came is not read off it — but a death is, and it is the one outcome more health is the
 *   answer to whatever did it (which is why it is health that is suggested when no resist or armour is the
 *   clear answer).
 *
 * Pure → a tested black box.
 */
import type { FightStatsHolder } from "./damage-profile";
import { worthSaying, type Gain, type Reach } from "./headroom";

/** A window needs this many fights (casting fights, for mana) before a rate means anything. */
export const MIN_FIGHTS = 5;
/** A single death can be bad luck; health is suggested from this many… */
export const MIN_DEATHS = 2;
/** …and when they are at least this share of the window's fights. */
export const DEATH_FLAG_SHARE = 0.1;
/** Mana is suggested when you ran dry in at least this share of the fights you cast in. */
export const DRY_FLAG_SHARE = 0.15;
/** The least worth saying, in each pool's own points — health pools here run to the hundreds, mana to the thousands. */
export const MIN_HP_GAIN = 20;
export const MIN_MANA_GAIN = 50;

/** The health the loadout reaches beyond what you wear, if that is worth saying. */
export const hpGain = (reach: Reach | undefined): Gain | null => worthSaying(reach, MIN_HP_GAIN);
/** The mana the loadout reaches beyond what you wear, if that is worth saying. */
export const manaGain = (reach: Reach | undefined): Gain | null => worthSaying(reach, MIN_MANA_GAIN);

export interface Strain {
  /** Fights in the window. */
  fights: number;
  /** Fights that ended with you dying in them. */
  died: number;
  /** Fights you cast a spell in and that recorded whether you ran dry — the mana denominator. */
  casting: number;
  /** Of those, the fights you ran out of mana in. */
  dry: number;
}

/** What the window's fights say about running dry and dying. */
export function strain(fights: readonly FightStatsHolder[]): Strain {
  let died = 0;
  let casting = 0;
  let dry = 0;
  for (const { stats } of fights) {
    if (stats.deaths?.length) died += 1;
    // Absent is "stored before it was recorded", not "never ran out": such a fight is no evidence either way.
    if (stats.outOfMana === undefined || !stats.spells?.some((s) => s.casts > 0)) continue;
    casting += 1;
    if (stats.outOfMana > 0) dry += 1;
  }
  return { fights: fights.length, died, casting, dry };
}

export interface HpSuggestion extends Gain {
  died: number;
  fights: number;
  /** One fight's own death only: what landed on you in the seconds before it (`DeathRecap`). */
  burst?: { taken: number; windowSec: number };
}

export interface ManaSuggestion extends Gain {
  dry: number;
  casting: number;
}

/** More health, when you keep dying in this window and the builder's loadout reaches more of it. */
export function hpSuggestion(s: Strain, reach: Reach | undefined): HpSuggestion | null {
  if (s.fights < MIN_FIGHTS || s.died < MIN_DEATHS || s.died / s.fights < DEATH_FLAG_SHARE) return null;
  const gain = hpGain(reach);
  return gain && { ...gain, died: s.died, fights: s.fights };
}

/** More mana, when you run dry in a real share of the fights you cast in and the builder's loadout reaches more. */
export function manaSuggestion(s: Strain, reach: Reach | undefined): ManaSuggestion | null {
  if (s.casting < MIN_FIGHTS || s.dry / s.casting < DRY_FLAG_SHARE) return null;
  const gain = manaGain(reach);
  return gain && { ...gain, dry: s.dry, casting: s.casting };
}
