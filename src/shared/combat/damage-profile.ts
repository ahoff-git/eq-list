/**
 * damage-profile.ts — what kind of damage a set of fights dealt **to you**, by type.
 *
 * The question behind "which resist, if any, is worth wearing": the log gives every spell hit's damage
 * type ("12 points of cold damage by Blast of Cold") and melee has none, so the damage you took
 * sorts into the five resist types, the sixth (Void), melee, and a remainder (untyped DoT ticks,
 * damage shields) that no resist can be pointed at. Read off the fights' damage cells
 * ([ADR 0053](../../../specs/decisions/0053-damage-is-cells-rolled-up.md)); fights stored before the
 * cells existed are counted but contribute nothing.
 *
 * Only damage landed on *you* — not your pet or group. And only damage that landed: a spell you
 * resisted outright is a "You resist" line, not damage, so what this shows is what still gets through
 * ([ADR 0361](../../../specs/decisions/0361-damage-taken-is-read-over-a-window-and-priced-by-the-wikis-resist-rule.md)).
 *
 * Pure → a tested black box. What the profile is *worth* is `resist-worth.ts`.
 */
import { SELF } from "./combat-parser";
import { ratio } from "../numbers";
import type { DamageCell, StoredFight } from "../types";

/** The six resist types the wiki's Statistics page names — a spell's damage type is one of them. */
export const RESIST_TYPES = ["magic", "fire", "cold", "disease", "poison", "void"] as const;
export type ResistType = (typeof RESIST_TYPES)[number];

/** What a bucket of damage was: a resist type, a swing (no resist touches it), or neither. */
export type DamageKindOfHit = ResistType | "melee" | "other";

export interface TypeShare {
  type: DamageKindOfHit;
  damage: number;
  /** Landed hits, DoT ticks included. */
  hits: number;
  /** Of everything taken in the window, 0–1. */
  share: number;
}

export interface DamageProfile {
  /** Fights looked at, and how many of them carried the cells the figures come from. */
  fights: number;
  measured: number;
  /** Damage and landed hits to you across the window. */
  damage: number;
  hits: number;
  /** Biggest first; only the types that actually hit you. */
  types: TypeShare[];
}

export const isResistType = (word: string): word is ResistType => (RESIST_TYPES as readonly string[]).includes(word);

/** Whether a cell is damage that landed on *you* from somebody else — what "damage taken" means, everywhere. */
export const landedOnYou = (c: Pick<DamageCell, "target" | "attacker">): boolean => c.target === SELF && c.attacker !== SELF;

/** Which bucket a cell's damage belongs in. Typed spell hits go by their word; everything else is melee or "other". */
function kindOfHit(cell: { kind: string; damageType?: string }): DamageKindOfHit {
  if (cell.kind === "Melee") return "melee";
  const word = cell.damageType?.toLowerCase();
  return cell.kind === "Spell" && word && isResistType(word) ? word : "other";
}

/** Anything that carries a fight's stats — a stored fight, or `{ stats }` around the window on show. */
export type FightStatsHolder = Pick<StoredFight, "stats">;

export function damageProfile(fights: readonly FightStatsHolder[]): DamageProfile {
  const sums = new Map<DamageKindOfHit, { damage: number; hits: number }>();
  let measured = 0;
  for (const f of fights) {
    const cells = f.stats.damageCells;
    if (!cells?.length) continue;
    measured++;
    for (const c of cells) {
      if (!landedOnYou(c)) continue;
      const kind = kindOfHit(c);
      const bucket = sums.get(kind) ?? { damage: 0, hits: 0 };
      bucket.damage += c.damage;
      bucket.hits += c.hits;
      sums.set(kind, bucket);
    }
  }
  const damage = [...sums.values()].reduce((n, b) => n + b.damage, 0);
  return {
    fights: fights.length,
    measured,
    damage,
    hits: [...sums.values()].reduce((n, b) => n + b.hits, 0),
    types: [...sums]
      .map(([type, b]) => ({ type, ...b, share: ratio(b.damage, damage) }))
      .filter((t) => t.damage > 0)
      .sort((a, b) => b.damage - a.damage),
  };
}
