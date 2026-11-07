"use client";
import { useMemo } from "react";
import { useCombatReportsRefresh, useCombatStats, useCurrentZone, useReading } from "@/lib/hooks";
import { useHeadroom } from "@/lib/combat/headroom";
import { acSuggestion, type AcSuggestion } from "@/shared/combat/ac-headroom";
import { cruise, swingSuggestion, type SwingSuggestion } from "@/shared/combat/cruising";
import { damageProfile, type DamageProfile } from "@/shared/combat/damage-profile";
import { windowFights, type DamageWindow } from "@/shared/combat/damage-window";
import type { Headroom } from "@/shared/combat/headroom";
import { isEnough, suggestions, type ResistRow } from "@/shared/combat/resist-worth";
import { hpSuggestion, manaSuggestion, strain, type HpSuggestion, type ManaSuggestion, type Strain } from "@/shared/combat/strain";
import type { FightSearch } from "@/shared/types";

const NO_FIGHTS: FightSearch = { fights: [], total: 0 };

export interface DamageTaken {
  window: DamageWindow;
  /** The zone you're in now, when the log has said. */
  here: string | null;
  profile: DamageProfile;
  /** Whether the window has seen enough hits to advise on (`MIN_HITS`). */
  enough: boolean;
  /** The resist types worth raising in this window, biggest first. Empty until there is evidence. */
  suggestions: ResistRow[];
  /** The armour answer to melee, when the builder's loadout reaches more AC than you wear (ADR 0362). */
  ac: AcSuggestion | null;
  /** How often the window's fights ended in your death, and how often you ran out of mana in them (ADR 0363). */
  strain: Strain;
  /** More health, when you keep dying and the builder's loadout reaches more of it. */
  hp: HpSuggestion | null;
  /** More mana, when you run dry in a real share of the fights you cast in and the loadout reaches more. */
  mana: ManaSuggestion | null;
  /** The damage-first loadout's swing against your goals' plan, when you are winning comfortably with your own sword and it would swing harder (ADR 0365). */
  swing: SwingSuggestion | null;
  /** The figures behind the armour, health and mana answers — worn against reachable — whenever the builder has them for this inventory. */
  headroom: Headroom | undefined;
  loading: boolean;
}

/**
 * What has been hitting you, over the chosen window, and what is worth doing about it
 * ([ADR 0361](../../../specs/decisions/0361-damage-taken-is-read-over-a-window-and-priced-by-the-wikis-resist-rule.md),
 * [0362](../../../specs/decisions/0362-melee-damage-suggests-the-ac-the-loadout-already-reaches.md),
 * [0363](../../../specs/decisions/0363-running-dry-and-dying-suggest-mana-and-health.md),
 * [0365](../../../specs/decisions/0365-winning-comfortably-suggests-trading-survivability-for-damage.md)).
 *
 * **Refreshed on events, never mid-fight**: the history is re-read when a new fight starts (the last
 * one has just been filed) and when its background cache lands a fresher answer — the same pair
 * `DamagePanel`'s bests use — and the window is re-cut when you zone, which is what empties it and
 * takes the old zone's advice with it. Reading the history is the cost; cutting it is not.
 *
 * Both the loadout builder's section and the status bar's pill read this, so they cannot disagree.
 */
export function useDamageTaken(window: DamageWindow): DamageTaken {
  const here = useCurrentZone();
  const fightKey = useCombatStats().fight.startedAt;
  const refreshed = useCombatReportsRefresh();
  // An empty term is "every fight, newest first" — the history search's own cap is the widest window.
  const { value, loading } = useReading((a) => a.combat.searchFights(""), NO_FIGHTS, [fightKey, refreshed]);
  const headroom = useHeadroom();
  return useMemo(() => {
    const fights = windowFights(value.fights, window, here);
    const profile = damageProfile(fights);
    const lately = strain(fights);
    return {
      window,
      here,
      profile,
      enough: isEnough(profile),
      suggestions: suggestions(profile),
      ac: acSuggestion(profile, headroom?.ac),
      strain: lately,
      hp: hpSuggestion(lately, headroom?.hp),
      mana: manaSuggestion(lately, headroom?.mana),
      swing: swingSuggestion(cruise(fights), lately, headroom?.lean),
      headroom,
      loading,
    };
  }, [value, window, here, headroom, loading]);
}
