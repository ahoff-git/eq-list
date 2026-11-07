/**
 * ac-headroom.ts — when most of what lands on you is melee, and the loadout builder's loadout reaches
 * more AC than you wear, that is the suggestion: no resist touches a swing, so armour is the answer
 * ([ADR 0362](../../../specs/decisions/0362-melee-damage-suggests-the-ac-the-loadout-already-reaches.md)).
 * The two totals and what counts as "more" are `headroom.ts`'s.
 *
 * Pure → a tested black box.
 */
import { worthSaying, type Gain, type Reach } from "./headroom";
import type { DamageProfile } from "./damage-profile";
import { isEnough } from "./resist-worth";

/** Melee is "most of it" at half the damage taken: under that, the resist rows have the better claim. */
export const MELEE_FLAG_SHARE = 0.5;
/** Five points of AC is the least worth saying; the shared ratio (`MIN_GAIN_RATIO`) covers a big total. */
export const MIN_AC_GAIN = 5;

export interface AcSuggestion extends Gain {
  /** Melee's share of the damage taken, 0–1. */
  share: number;
}

/** The AC suggestion for this window, or null: not enough evidence, not mostly melee, or no real gain on offer. */
export function acSuggestion(profile: DamageProfile, reach: Reach | undefined): AcSuggestion | null {
  if (!isEnough(profile)) return null;
  const share = profile.types.find((t) => t.type === "melee")?.share ?? 0;
  const gain = share >= MELEE_FLAG_SHARE ? worthSaying(reach, MIN_AC_GAIN) : null;
  return gain && { share, ...gain };
}
