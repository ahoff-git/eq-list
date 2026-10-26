/**
 * melee.ts — how much a weapon hits for, in the hand it's swung from, and how often it procs: eqlwiki's
 * working models, so the loadout builder can weigh weapons by damage rather than by a bare DMG/delay.
 *
 * Sources, all transcribed as the pages state them (ADR 0337):
 *
 * - **[Skill Dual Wield](https://eqlwiki.com/Skill_Dual_Wield#Working_Legends_Damage_Bonus_Model)** —
 *   the damage bonus, dual wield / double attack / triple attack chances and their default skills,
 *   Burst of Power's flurry, and the per-hand comparison score. The page calls every one of these a
 *   *working model* — fitted to parses, not published by the developers — and says it is "not a complete
 *   average-DPS simulator": STR, ATK, Offense, mitigation, hit rate, crits and procs are left out.
 *   It leaves haste out too, since haste scales every weapon alike. The next source puts it back in.
 * - **[Haste Guide](https://eqlwiki.com/Haste_Guide)** — haste is attack *rate*: hasted delay =
 *   `delay / (1 + haste)`, unrounded, never under 5 (unconfirmed). Only your best worn haste item counts,
 *   and buff haste (spells, songs) adds to it. The total is capped by level: 55% to 30, +1% a level to 75%
 *   at 50, and 100% from 51 (the page says the last is untested). The damage bonus is read off the
 *   weapon's own delay, so haste speeds the swing without changing what each hit carries.
 * - **[Weapon Procs](https://eqlwiki.com/Weapon_Procs)** — procs per minute from DEX:
 *   `DEX / 170 + 0.5` in the main hand, half that in the off hand, DEX counting to 255. A proc rate is a
 *   *per-minute* target, so weapon delay and haste don't change it. The page flags this as Live's rule
 *   ("sounds right"), not a measured EQL one. It also lists a few procs with a higher rate
 *   (`PROC_RATE_BONUS`). A proc's damage per second is its rate times its spell's damage
 *   (`damage-plan.ts` reads that off the spell's page), in the same rough units as the swing score.
 * - **[Spellblade](https://eqlwiki.com/Spellblade)** — procs your top spell gem, at a rate that rises
 *   with max mana and falls with the spell's cost. No figures are given, so it is named, not modelled.
 *
 * The score's units are the page's: `(2 × DMG + bonus) / delay` per round, times the swings a round
 * makes. Delay is in tenths of a second, so ×10 reads as "per second" — a yardstick to compare weapons
 * by, not a parse.
 *
 * Pure → a tested black box.
 */
import type { ItemStats } from "./item-stats";

/** Total haste allowed at a level, as a percent — the Haste Guide's table. */
export function hasteCap(level: number): number {
  if (level <= 30) return 55;
  if (level <= 50) return 55 + (level - 30);
  return 100;
}

/** Hasted delay never goes below this (the Haste Guide: "needs confirmation"). */
export const MIN_HASTED_DELAY = 5;

/** Haste that applies, as a percent: the best worn item's plus buffs', to the level's cap. */
export function effectiveHaste(itemHaste: number, buffHaste: number, level: number): number {
  return Math.min(hasteCap(level), Math.max(0, itemHaste) + Math.max(0, buffHaste));
}

/** What the character brings to a swing. Skills left out are taken as trained to the modelled cap. */
export interface MeleeBasis {
  classes: readonly string[];
  level: number;
  /** The Ambidexterity AA: dual wield chance ×1.32. */
  ambidexterity?: boolean;
  /** Burst of Power AA rank, 0–3. */
  burstOfPower?: number;
  dualWield?: number;
  doubleAttack?: number;
  tripleAttack?: number;
}

/** What a basis comes to: each chance, and the skill it was read from. */
export interface MeleeChances {
  dualWield: number;
  doubleAttack: number;
  tripleAttack: number;
  /** Extra attacks a successful triple attack brings on average, from Burst of Power (1 = none). */
  flurry: number;
  skills: { dualWield: number; doubleAttack: number; tripleAttack: number };
}

export type Hand = "primary" | "secondary";

/** A weapon as the model reads it. */
export interface Swung {
  dmg: number;
  delay: number;
  twoHanded: boolean;
}

/** Dual wield skill by level: `level × perLevel + 5`, then the class cap. */
const DUAL_WIELD: Record<string, { perLevel: number; cap: number }> = {
  Bard: { perLevel: 5, cap: 210 },
  Beastlord: { perLevel: 5, cap: 210 },
  Monk: { perLevel: 7, cap: 252 },
  Ranger: { perLevel: 5, cap: 210 },
  Rogue: { perLevel: 6, cap: 210 },
  Warrior: { perLevel: 5, cap: 210 },
};

/** Double attack: from this level, `level × 5` to the class max. */
const DOUBLE_ATTACK: Record<string, { from: number; cap: number }> = {
  Monk: { from: 15, cap: 250 },
  Warrior: { from: 15, cap: 245 },
  Berserker: { from: 15, cap: 250 },
  Rogue: { from: 16, cap: 240 },
  Paladin: { from: 20, cap: 235 },
  "Shadow Knight": { from: 20, cap: 235 },
  Ranger: { from: 20, cap: 235 },
};

/** Triple attack: 5 a level from 46, to 100. Main hand and two-handers only. */
const TRIPLE_ATTACK_CLASSES = new Set(["Monk", "Warrior", "Rogue", "Ranger", "Berserker"]);
const TRIPLE_ATTACK_FROM = 46;
const TRIPLE_ATTACK_CAP = 100;

const AMBIDEXTERITY = 1.32;
/** Burst of Power's flurry chance by rank; a flurry is one or two more attacks, evenly. */
const FLURRY_CHANCE = [0, 0.07, 0.11, 0.15];
const FLURRY_ATTACKS = 1.5;

/** The damage bonus's hand modifier, and the delay past which it stops growing. */
const ONE_HANDED_BONUS = 0.8;
const TWO_HANDED_BONUS = 1.1;
const BONUS_DELAY_CAP = 50;

/** Classes whose Spellblade invocation turns a spell gem into a proc. */
export const SPELLBLADE_CLASSES: ReadonlySet<string> = new Set(["Beastlord", "Paladin", "Ranger", "Shadow Knight"]);

/** DEX counts toward proc rate up to here. */
export const PROC_DEX_CAP = 255;
/** Main-hand procs per minute gained per DEX point. */
export const PPM_PER_DEX = 1 / 170;
const PPM_FLOOR = 0.5;

/** Procs that fire more often than the DEX rate, by the Weapon Procs page's "effect rate modifiers". */
const PROC_RATE_BONUS: Record<string, number> = {
  "spirit strike": 1.5,
  "winter's roar": 1.64,
  "chaotic feedback": 1.75,
  "banish undead": 1.54,
  "ward summoned": 3.89,
};

/** How much more often this proc fires than the DEX rate says (1 for most). */
export const procRateOf = (name: string): number => PROC_RATE_BONUS[name.trim().toLowerCase()] ?? 1;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
/** A trio takes the best of its classes' caps — they don't add. */
const bestOf = (classes: readonly string[], skill: (klass: string) => number) => Math.max(0, ...classes.map(skill));

/** Skills at the modelled cap for these classes and this level, as the wiki's calculator defaults them. */
export function defaultSkills(classes: readonly string[], level: number): MeleeChances["skills"] {
  return {
    dualWield: bestOf(classes, (k) => (DUAL_WIELD[k] ? Math.min(level * DUAL_WIELD[k].perLevel + 5, DUAL_WIELD[k].cap) : 0)),
    doubleAttack: bestOf(classes, (k) => (DOUBLE_ATTACK[k] && level >= DOUBLE_ATTACK[k].from ? Math.min(level * 5, DOUBLE_ATTACK[k].cap) : 0)),
    tripleAttack: bestOf(classes, (k) =>
      TRIPLE_ATTACK_CLASSES.has(k) && level >= TRIPLE_ATTACK_FROM ? Math.min((level - TRIPLE_ATTACK_FROM + 1) * 5, TRIPLE_ATTACK_CAP) : 0,
    ),
  };
}

/** Each chance a round rolls, from the basis's skills (or their modelled defaults). */
export function meleeChances(basis: MeleeBasis): MeleeChances {
  const d = defaultSkills(basis.classes, basis.level);
  const skills = { dualWield: basis.dualWield ?? d.dualWield, doubleAttack: basis.doubleAttack ?? d.doubleAttack, tripleAttack: basis.tripleAttack ?? d.tripleAttack };
  return {
    dualWield: clamp01((skills.dualWield / 400) * (basis.ambidexterity && skills.dualWield > 0 ? AMBIDEXTERITY : 1)),
    doubleAttack: skills.doubleAttack > 0 ? clamp01((basis.level + skills.doubleAttack) / 500) : 0,
    tripleAttack: skills.tripleAttack > 0 ? skills.tripleAttack / (skills.tripleAttack + 800) : 0,
    flurry: 1 + (FLURRY_CHANCE[Math.max(0, Math.min(3, Math.round(basis.burstOfPower ?? 0)))] ?? 0) * FLURRY_ATTACKS,
    skills,
  };
}

/**
 * The main hand's damage bonus. The page doesn't know its rounding, so neither does this. Applies to
 * main-hand hits only — an ordinary off-hand swing gets none.
 */
export function damageBonus(w: Swung, level: number): number {
  const hand = w.twoHanded ? TWO_HANDED_BONUS : ONE_HANDED_BONUS;
  return hand * Math.max(level, w.dmg) * (Math.min(w.delay, BONUS_DELAY_CAP) / 40) * (level / 100);
}

/** Swings a round makes from this hand: double and triple attack (and flurry) for the main hand, double only for the off. */
function swingsPerRound(hand: Hand, c: MeleeChances): number {
  return hand === "primary" ? 1 + c.doubleAttack + c.doubleAttack * c.tripleAttack * c.flurry : c.dualWield * (1 + c.doubleAttack);
}

/**
 * The page's score for this weapon in this hand, as per second, at `haste` percent (already capped —
 * `effectiveHaste`). 0 for an off hand that never swings.
 */
export function swingScore(w: Swung, hand: Hand, c: MeleeChances, level: number, haste = 0): number {
  if (!(w.delay > 0) || !(w.dmg > 0)) return 0;
  const bonus = hand === "primary" ? damageBonus(w, level) : 0;
  const delay = Math.max(MIN_HASTED_DELAY, w.delay / (1 + haste / 100));
  return (((2 * w.dmg + bonus) / delay) * swingsPerRound(hand, c)) * 10;
}

/** Procs per minute from this hand at this DEX — none from an off hand that never swings. */
export function procsPerMinute(dex: number, hand: Hand, c: MeleeChances): number {
  const main = Math.min(Math.max(dex, 0), PROC_DEX_CAP) * PPM_PER_DEX + PPM_FLOOR;
  if (hand === "primary") return main;
  return c.dualWield > 0 ? main / 2 : 0;
}

/** A card read as a weapon: its swing, and the proc it carries. `undefined` for anything not swung. */
export function asWeapon(stats: Pick<ItemStats, "stats" | "skill" | "effects">): (Swung & { procs: boolean; proc?: string }) | undefined {
  const { dmg, delay } = stats.stats;
  if (!dmg || !delay) return undefined;
  const proc = stats.effects.find((e) => e.kind === "proc")?.name;
  return { dmg, delay, twoHanded: /^2H\b/i.test(stats.skill ?? ""), procs: !!proc, ...(proc && { proc }) };
}

/** Damage per second a proc adds from this hand: its rate there, times what one proc hits for. */
export function procDps(proc: string, damage: number, dex: number, hand: Hand, c: MeleeChances): number {
  return (procsPerMinute(dex, hand, c) * procRateOf(proc) * damage) / 60;
}

/** What the player has asked of the melee model: how much a point of each is worth, and the AAs it can't read. */
export interface MeleeWeights {
  /** Value points per point of swing score (per second). */
  damage: number;
  /** Value points per proc a minute — from a weapon that procs. */
  procs: number;
  ambidexterity: boolean;
  burstOfPower: number;
  /** Haste from buffs and songs you usually have, as a percent — it adds to your best worn item's. */
  buffHaste: number;
  /** Count a weapon's proc damage into its swing, at the Swing weight. */
  procDamage: boolean;
}

export const NO_MELEE_WEIGHTS: MeleeWeights = { damage: 0, procs: 0, ambidexterity: false, burstOfPower: 0, buffHaste: 0, procDamage: false };

export const meleeWeighted = (m: MeleeWeights): boolean => m.damage !== 0 || m.procs !== 0;

/** Stored melee weights made whole: a missing or malformed field takes its default. */
export function normalizeMeleeWeights(stored: unknown): MeleeWeights {
  const o = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    damage: num(o.damage),
    procs: num(o.procs),
    ambidexterity: o.ambidexterity === true,
    burstOfPower: Math.max(0, Math.min(3, Math.round(num(o.burstOfPower)))),
    buffHaste: Math.max(0, num(o.buffHaste)),
    procDamage: o.procDamage === true,
  };
}

/**
 * What a weapon is worth in each hand, by the player's melee weights: swing score at the character's
 * haste — plus its proc's damage, with `procDamage` on and the proc's damage known (`procHits`) — and
 * procs at its DEX. The card's own DMG/delay weights are replaced in the hands, not added to, so a
 * weapon isn't paid twice for one swing.
 */
export function handWorth(
  w: Swung & { procs: boolean; proc?: string },
  hand: Hand,
  c: MeleeChances,
  level: number,
  dex: number,
  haste: number,
  m: MeleeWeights,
  procHits: (proc: string) => number = () => 0,
): number {
  if (hand === "secondary" && w.twoHanded) return 0;
  const procs = w.proc ? procsPerMinute(dex, hand, c) * procRateOf(w.proc) : 0;
  const procDamage = m.procDamage && w.proc ? procDps(w.proc, procHits(w.proc), dex, hand, c) : 0;
  return m.damage * (swingScore(w, hand, c, level, haste) + procDamage) + m.procs * procs;
}
