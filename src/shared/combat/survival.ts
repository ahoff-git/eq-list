/**
 * survival.ts — how to live through a fight like the one on show: what, in *this* fight, a resist, armour,
 * mana or health would have changed
 * ([ADR 0364](../../../specs/decisions/0364-a-fight-you-died-in-says-how-to-survive-the-next.md)).
 *
 * The same suggestions the status bar and the loadout builder make over a window of fights, asked of one,
 * and so on a different footing: over a window a death has to be *repeated* to mean something (`strain.ts`);
 * in one fight, dying **is** the evidence, and so is running dry in it. What hit you is read as it always is —
 * the fight's own damage, 30 landed hits or too thin to say — and every figure for what the loadout could
 * reach comes from the same builder headroom, so this can't promise gear the builder wouldn't plan.
 *
 * Pure → a tested black box.
 */
import type { FightStats } from "../types";
import { acSuggestion } from "./ac-headroom";
import { damageProfile } from "./damage-profile";
import type { Found } from "./damage-taken-text";
import type { Headroom } from "./headroom";
import { suggestions } from "./resist-worth";
import { hpGain, manaGain } from "./strain";

/**
 * What to change to do better against this fight. Empty when nothing it shows is worth changing — or, for
 * armour, health and mana, when the builder hasn't planned a loadout for this inventory to compare against
 * (`headroom` undefined): the resists don't need one, because they are priced from the fight alone.
 *
 * Health is offered only if you died here; mana only if you ran dry here — a fight you walked away from
 * isn't a reason to change your gear.
 */
export function survivalFound(stats: FightStats, headroom: Headroom | undefined): Found {
  const profile = damageProfile([{ stats }]);
  const died = stats.deaths.length;
  const killing = stats.deaths[0];
  const dry = stats.outOfMana ?? 0;
  const hp = died ? hpGain(headroom?.hp) : null;
  const mana = dry ? manaGain(headroom?.mana) : null;
  return {
    // Any fight, dead or not: the question "what is hitting me" doesn't need a death to ask. But the caller
    // only shows this for a fight you died in, which is what makes it advice for *next time*.
    ac: acSuggestion(profile, headroom?.ac),
    resists: suggestions(profile),
    mana: mana && { ...mana, dry, casting: 1 },
    hp: hp && { ...hp, died, fights: 1, burst: killing?.totalTaken ? { taken: killing.totalTaken, windowSec: killing.windowSec } : undefined },
  };
}
