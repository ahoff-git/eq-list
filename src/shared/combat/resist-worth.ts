/**
 * resist-worth.ts — what a resist point is worth against the damage you actually take, and which
 * resist types are worth a suggestion.
 *
 * The rule is the wiki's ([Statistics → Resists](https://eqlwiki.com/index.php/Statistics)), from
 * EQEmu discussions and flagged there as "not necessarily correct for EQL":
 *
 *   - **every 6 resist points give a 1% greater chance to fully resist a spell**;
 *   - a level difference moves it (about 12% at 7 levels, 20% at 10) — the log carries no attacker
 *     level, so this is **the points-only part**, and says so wherever it is shown;
 *   - PvE caps it at 5%–95%; only the top is used (the 5% floor is about level gaps).
 *
 * Two consequences shape everything here. Resists act on **spells only**, so melee is untouched by
 * any of them. And a point is worth **the same on every type** (1/6 % of that type's damage, to first
 * order), so which resist to raise is simply which type hits you most — a type you already resist
 * heavily is worth no less per point, until the cap.
 *
 * Logged damage is *landed* damage, after the resists you wear, so a hardened type reads smaller than
 * it would raw. `rawDamage` undoes that with the gear's points (the only points known here — buffs,
 * race and AA aren't), which is why the figure is an estimate.
 * See [ADR 0361](../../../specs/decisions/0361-damage-taken-is-read-over-a-window-and-priced-by-the-wikis-resist-rule.md).
 *
 * Pure → a tested black box.
 */
import { ratio } from "../numbers";
import type { StatKey } from "../items/item-stats";
import type { LoadoutStats } from "../items/loadout-stats";
import { isResistType, type DamageProfile, type ResistType } from "./damage-profile";

export const RESIST_POINTS_PER_PERCENT = 6;
/** The most a resist can do in PvE: 95% of that type's spells fully resisted. */
export const RESIST_CAP = 0.95;
/** The step "what would more get me?" is answered in. */
export const TRIAL_POINTS = 30;
/** A type earns a suggestion at this share of the damage you take — +30 points then sheds ~0.5% of everything. */
export const FLAG_SHARE = 0.1;
/** Landed hits a window needs before it can advise anything: fewer is one bad pull, not a pattern. */
export const MIN_HITS = 30;

/** The item stat that raises each type — Void is a resist the game has but this app doesn't read off items yet. */
export const RESIST_STAT: Record<ResistType, StatKey | null> = {
  magic: "svMagic",
  fire: "svFire",
  cold: "svCold",
  disease: "svDisease",
  poison: "svPoison",
  void: null,
};

/** The chance of fully resisting a spell with `points` of resist, as a fraction. */
export function resistChance(points: number): number {
  return Math.min(RESIST_CAP, Math.max(0, points) / (RESIST_POINTS_PER_PERCENT * 100));
}

/** What a window's damage would have been before the resists worn (or none known: as logged). */
export function rawDamage(logged: number, points = 0): number {
  return logged / (1 - resistChance(points));
}

/** Whether the window has seen enough to advise on. */
export const isEnough = (profile: DamageProfile): boolean => profile.hits >= MIN_HITS;

export interface ResistRow {
  type: ResistType;
  /** The item stat that raises it; null where the app doesn't track one (Void). */
  stat: StatKey | null;
  damage: number;
  hits: number;
  /** Of everything taken in the window, as logged, 0–1. */
  share: number;
  /** Resist points your worn gear gives. Absent when the gear isn't known. */
  points?: number;
  /** The chance of fully resisting that `points` gives, 0–0.95. Absent with `points`. */
  resisted?: number;
  /** What `TRIAL_POINTS` more would cut, as a share of everything taken — 0.005 is half a percent. */
  saved: number;
  /** Worth a suggestion: enough evidence, a big enough share, and a resist the app can raise. */
  flagged: boolean;
}

/**
 * One row per resist type that hit you, biggest first. With `worn` (the gear's totals) each says what
 * it gives now and what more would cut; without, the saving is figured from the logged damage as is.
 */
export function resistRows(profile: DamageProfile, worn?: LoadoutStats): ResistRow[] {
  const enough = isEnough(profile);
  return profile.types.flatMap((t) => {
    const type = t.type;
    if (!isResistType(type)) return [];
    const stat = RESIST_STAT[type];
    const points = worn && stat ? (worn[stat] ?? 0) : undefined;
    const held = resistChance(points ?? 0);
    const more = Math.max(0, Math.min(TRIAL_POINTS / (RESIST_POINTS_PER_PERCENT * 100), RESIST_CAP - held));
    return [
      {
        type,
        stat,
        damage: t.damage,
        hits: t.hits,
        share: t.share,
        ...(points !== undefined && { points, resisted: held }),
        saved: ratio(rawDamage(t.damage, points) * more, profile.damage),
        flagged: enough && stat !== null && t.share >= FLAG_SHARE,
      },
    ];
  });
}

/** The types worth a suggestion in this window, biggest first. */
export const suggestions = (profile: DamageProfile): ResistRow[] => resistRows(profile).filter((r) => r.flagged);
