/**
 * damage-plan.ts — the melee model (`melee.ts`) put to work in the loadout builder: who is swinging,
 * what each weapon is worth per hand by the player's melee weights, and the report the page's Damage
 * section reads — the chances behind the numbers, both loadouts' weapons, the best setups by damage
 * alone, and where DEX stands against the proc cap.
 *
 * **Haste buys swings** ([Haste Guide](https://eqlwiki.com/Haste_Guide)). Weapons are scored at the
 * haste you have now: your best worn item's plus your buffs', to your level's cap. A haste item is worth
 * the Swing weight times what its haste adds to your weapons' unhasted swing — the ones you wear, or the
 * hardest-hitting main hand you could if you wear none — and only up to the cap your buffs leave room
 * for. Each haste item is weighed as if it were your only one; the game counts only the best, so two in
 * one loadout overstate it, and the report says what actually applies.
 *
 * **DEX buys procs.** With a proc weight set, each DEX point under 255 adds `procs weight ÷ 170` to the
 * DEX weight — the main hand's rate. That assumes the main hand carries a proc, which is what a proc
 * weight asks for; it is the slope where the character stands now, the way `derived-stats.ts` folds
 * its rates.
 *
 * **A proc's damage** is read off its spell's page (`procSpellIndex`, the spell catalogue's own
 * best-effort `damage`, ADR 0195). Only an instant proc that can hit anything is counted: a damage over
 * time proc's page gives a per-tick figure, and one that only hits undead or summoned things isn't
 * damage against most of what you fight. Both are still listed, marked. With "count proc damage" on, a
 * weapon's proc adds its damage per second to its swing, at the Swing weight — and the meanest procs
 * in the catalogue are listed, since any of them can be socketed into a weapon as a stone.
 *
 * Pure. `bis-plan.ts` builds the model once per plan and hands it the candidates.
 */
import { baseAttributes } from "./character-base";
import {
  asWeapon,
  effectiveHaste,
  handWorth,
  hasteCap,
  meleeChances,
  meleeWeighted,
  procsPerMinute,
  PPM_PER_DEX,
  PROC_DEX_CAP,
  swingScore,
  type Hand,
  type MeleeChances,
  type MeleeWeights,
  procDps,
  procRateOf,
} from "./melee";
import type { BisCandidate, BisPick, HandScore } from "./bis";
import type { ItemStats } from "./item-stats";
import type { StatWeights } from "./item-search";
import type { LoadoutStats } from "./loadout-stats";

/** A character's DEX before gear, when the race isn't known — Human's, the middle of the table. */
const UNKNOWN_BASE_DEX = 75;

export interface DamageModel {
  level: number;
  chances: MeleeChances;
  /** DEX now: race and classes plus what's worn. */
  dex: number;
  /** False when no single race is ticked, so the base under `dex` is a guess. */
  dexKnown: boolean;
  melee: MeleeWeights;
  haste: HasteNow;
  /** Per-hand worth for the solver — absent when nothing melee is weighted. */
  swing?: HandScore;
  /** What an item's haste is worth by the Swing weight — see the module note. */
  hasteWorth: (haste: number) => number;
  /** What a proc's spell says it does, by proc name. */
  procSpells: ProcSpells;
}

/** A proc's spell, as its page tells it. */
export interface ProcSpell {
  damage: number;
  /** Damage on landing, rather than per tick of a damage over time. */
  instant: boolean;
  /** What it can only hit, from its page's Target Type (`Undead`, `Construct/Elemental`) — absent for anything. */
  only?: string;
}

/** Proc spells by lower-cased name. */
export type ProcSpells = ReadonlyMap<string, ProcSpell>;

/** Target Types that hit anything you'd fight — every other one names a kind of mob. */
const ANY_TARGET = /^(single|targeted ae|ae|pb ae|pbae|area|self|group|caster|line of sight)\b/i;

/** The spell catalogue's damage spells, by name — what a proc of that name does. */
export function procSpellIndex(spells: readonly { spell: { title: string; card?: { lines: readonly string[] } }; stats: { damage?: number; instant?: boolean } }[]): ProcSpells {
  const out = new Map<string, ProcSpell>();
  for (const { spell, stats } of spells) {
    if (!stats.damage) continue;
    const lines = spell.card?.lines ?? [];
    const target = lines.find((l) => /^target type:/i.test(l))?.replace(/^target type:\s*/i, "").trim();
    const instant = lines.some((l) => /^duration:\s*instant/i.test(l)) || !!stats.instant;
    out.set(spell.title.toLowerCase(), { damage: stats.damage, instant, ...(target && !ANY_TARGET.test(target) && { only: target }) });
  }
  return out;
}

/** What one proc of this name hits an ordinary mob for — 0 when unknown, over time, or only for some mobs. */
export function procHits(procSpells: ProcSpells, name: string): number {
  const s = procSpells.get(name.trim().toLowerCase());
  return s && s.instant && !s.only ? s.damage : 0;
}

/** Haste as it stands, in percent. */
export interface HasteNow {
  /** Your best worn haste item's — only the best counts. */
  fromItem: number;
  buffs: number;
  cap: number;
  /** What applies: item + buffs, to the cap. */
  effective: number;
  /** Unhasted swing per second the worth of haste is measured against. */
  reference: number;
}

/** The weapons a character swings, as cards at their grades. */
export interface Hands {
  primary?: ItemStats;
  secondary?: ItemStats;
}

const handOf = (slot: "PRIMARY" | "SECONDARY"): Hand => (slot === "PRIMARY" ? "primary" : "secondary");

/** Unhasted swing per second of a pair of hands. */
function unhastedSwing(hands: Hands, chances: MeleeChances, level: number): number {
  const main = hands.primary && asWeapon(hands.primary);
  const off = hands.secondary && asWeapon(hands.secondary);
  return (main ? swingScore(main, "primary", chances, level) : 0) + (off && !off.twoHanded ? swingScore(off, "secondary", chances, level) : 0);
}

export interface DamageModelInputs {
  classes: readonly string[];
  race?: string;
  level: number;
  /** What's worn now, added up — DEX and haste are read from it. */
  worn: LoadoutStats;
  melee: MeleeWeights;
  /** What you swing now; with nothing there, haste is measured against the hardest-hitting main hand in `armoury`. */
  wielded?: Hands;
  /** The cards you could wear — only read when `wielded` is empty. */
  armoury?: readonly ItemStats[];
  procSpells?: ProcSpells;
}

export function damageModel({ classes, race, level, worn, melee, wielded = {}, armoury = [], procSpells = new Map() }: DamageModelInputs): DamageModel {
  const chances = meleeChances({ classes, level, ambidexterity: melee.ambidexterity, burstOfPower: melee.burstOfPower });
  const base = baseAttributes(race, classes);
  const dex = (base?.dex ?? UNKNOWN_BASE_DEX) + (worn.dex ?? 0);
  const cap = hasteCap(level);
  const effective = effectiveHaste(worn.haste ?? 0, melee.buffHaste, level);
  let reference = unhastedSwing(wielded, chances, level);
  if (!reference) for (const card of armoury) reference = Math.max(reference, unhastedSwing({ primary: card }, chances, level));
  const haste: HasteNow = { fromItem: worn.haste ?? 0, buffs: melee.buffHaste, cap, effective, reference: round2(reference) };
  const noItem = effectiveHaste(0, melee.buffHaste, level);
  const hasteWorth = (h: number) => (melee.damage && h > 0 ? (melee.damage * reference * (effectiveHaste(h, melee.buffHaste, level) - noItem)) / 100 : 0);
  const swing: HandScore | undefined = meleeWeighted(melee)
    ? (graded, slot) => {
        const w = asWeapon(graded);
        return w && handWorth(w, handOf(slot), chances, level, dex, effective, melee, (proc) => procHits(procSpells, proc));
      }
    : undefined;
  return { level, chances, dex, dexKnown: !!base, melee, haste, hasteWorth, procSpells, ...(swing && { swing }) };
}

/** The weight sheet's scorer with what haste buys in swings added — see the module note. */
export function withHasteWorth(score: (stats: ItemStats) => number, model: DamageModel): (stats: ItemStats) => number {
  if (!model.melee.damage) return score;
  return (stats) => round2(score(stats) + model.hasteWorth(stats.stats.haste ?? 0));
}

/** The weight sheet with what DEX buys in procs folded in — see the module note. */
export function withProcDex(weights: StatWeights, model: DamageModel): StatWeights {
  if (!model.melee.procs || model.dex >= PROC_DEX_CAP) return weights;
  return { ...weights, dex: Math.round(((weights.dex ?? 0) + model.melee.procs * PPM_PER_DEX) * 100) / 100 };
}

/** One weapon in one hand, read by the model. */
export interface WeaponLine {
  title: string;
  grade: number;
  heldAt?: string;
  twoHanded: boolean;
  /** Swing score, per second (`melee.ts`). */
  perSecond: number;
  /** Procs a minute from it — 0 when it carries none. */
  ppm: number;
  /** Its proc, and the damage per second it adds here (0 when its damage isn't counted — see `procHits`). */
  proc?: { name: string; perSecond: number };
}

/** A pair of hands: what each swings, and the two together. */
export interface WeaponSetup {
  primary?: WeaponLine;
  secondary?: WeaponLine;
  perSecond: number;
  ppm: number;
  /** Damage per second the two hands' procs add. */
  procPerSecond: number;
}

/** A proc in the catalogue, and what it would do in your main hand. */
export interface ProcChoice {
  name: string;
  /** What one proc hits for. */
  damage: number;
  /** Damage per second from your main hand, at your DEX. */
  perSecond: number;
  /** Cards that carry it. */
  carriers: number;
}

export interface DamageReport {
  model: DamageModel;
  wearing?: WeaponSetup;
  loadout: WeaponSetup;
  /** The most swing score the pool allows, both ways — damage alone, whatever the weights say. */
  bestDualWield?: WeaponSetup;
  bestTwoHanded?: WeaponSetup;
  /** DEX still to gain before procs stop growing, and the main-hand procs a minute it would add. */
  dexToCap: number;
  ppmAtCap: number;
  /** Haste in the loadout: its best item's, and what applies with your buffs, to the cap. */
  loadoutHaste: { fromItem: number; effective: number };
  /** The most haste any one item in the pool gives, and where — absent when none does. */
  bestHaste?: { title: string; grade: number; heldAt?: string; haste: number; slots: readonly string[] };
  /** The hardest-hitting procs in the catalogue, by what they'd add in your main hand — any can be socketed as a stone. */
  meanestProcs: ProcChoice[];
  /** Procs in the catalogue whose damage isn't counted: no damage on their page, over time, or only some mobs. */
  uncountedProcs: number;
}

/** A weapon in a hand, or `undefined` when it isn't one (or can't be swung there). */
function lineOf(c: BisCandidate, stats: ItemStats | undefined, hand: Hand, m: DamageModel): WeaponLine | undefined {
  const w = stats && asWeapon(stats);
  if (!w || (hand === "secondary" && w.twoHanded)) return undefined;
  return {
    title: c.title,
    grade: c.grade,
    ...(c.heldAt && { heldAt: c.heldAt }),
    twoHanded: w.twoHanded,
    perSecond: round2(swingScore(w, hand, m.chances, m.level, m.haste.effective)),
    ppm: w.proc ? round2(procsPerMinute(m.dex, hand, m.chances) * procRateOf(w.proc)) : 0,
    ...(w.proc && { proc: { name: w.proc, perSecond: round2(procDps(w.proc, procHits(m.procSpells, w.proc), m.dex, hand, m.chances)) } }),
  };
}

/** What a hand counts toward "most damage": its swing, and its proc's damage when that's asked for. */
const damageOf = (l: WeaponLine, m: DamageModel) => l.perSecond + (m.melee.procDamage ? (l.proc?.perSecond ?? 0) : 0);

const round2 = (n: number) => Math.round(n * 100) / 100;

function setupOf(primary?: WeaponLine, secondary?: WeaponLine): WeaponSetup {
  const lines = [primary, secondary].filter((l): l is WeaponLine => !!l);
  return {
    ...(primary && { primary }),
    ...(secondary && { secondary }),
    perSecond: round2(lines.reduce((t, l) => t + l.perSecond, 0)),
    ppm: round2(lines.reduce((t, l) => t + l.ppm, 0)),
    procPerSecond: round2(lines.reduce((t, l) => t + (l.proc?.perSecond ?? 0), 0)),
  };
}

/** How many of each hand's best are tried against each other for the best pair. */
const PAIR_FRONT = 3;

/**
 * The most damage the pool can swing: the best one-handed pair (two of each hand's front, so the best
 * main-hand weapon can still go off-hand when that's better), and the best two-hander alone. Proc damage
 * counts when "count proc damage" is on.
 */
function bestSetups(pool: readonly BisCandidate[], statsOf: (c: BisCandidate) => ItemStats | undefined, m: DamageModel) {
  const ranked = (hand: Hand, slot: string, twoHanded: boolean) =>
    pool
      .filter((c) => c.slots.includes(slot) && c.twoHanded === twoHanded)
      .flatMap((c) => {
        const line = lineOf(c, statsOf(c), hand, m);
        return line ? [{ c, line }] : [];
      })
      .sort((a, b) => damageOf(b.line, m) - damageOf(a.line, m));
  const mains = ranked("primary", "PRIMARY", false).slice(0, PAIR_FRONT);
  const offs = m.chances.dualWield > 0 ? ranked("secondary", "SECONDARY", false).slice(0, PAIR_FRONT) : [];
  let bestDualWield: WeaponSetup | undefined;
  for (const main of mains) {
    const off = offs.find((o) => o.c.id !== main.c.id && !(o.c.lore && o.c.title.toLowerCase() === main.c.title.toLowerCase()));
    const setup = setupOf(main.line, off?.line);
    const total = (s: WeaponSetup) => s.perSecond + (m.melee.procDamage ? s.procPerSecond : 0);
    if (!bestDualWield || total(setup) > total(bestDualWield)) bestDualWield = setup;
  }
  const twoHander = ranked("primary", "PRIMARY", true)[0];
  return { bestDualWield, bestTwoHanded: twoHander && setupOf(twoHander.line) };
}

/** The weapons in a set of picks (by layout slot), as a setup. */
function setupFrom(picks: readonly Pick<BisPick, "slot" | "item">[], statsOf: (c: BisCandidate) => ItemStats | undefined, m: DamageModel): WeaponSetup {
  const at = (slot: string) => picks.find((p) => p.slot === slot)?.item;
  const main = at("PRIMARY");
  const off = at("SECONDARY");
  return setupOf(main && lineOf(main, statsOf(main), "primary", m), off && lineOf(off, statsOf(off), "secondary", m));
}

/** Procs listed as the meanest. */
const MEANEST_PROCS = 6;

/** The catalogue's procs ranked by what each would add in your main hand; the rest counted. */
function meanest(procEffects: readonly { name: string; count: number }[], m: DamageModel): Pick<DamageReport, "meanestProcs" | "uncountedProcs"> {
  const counted: ProcChoice[] = [];
  let uncounted = 0;
  for (const { name, count } of procEffects) {
    const damage = procHits(m.procSpells, name);
    if (!damage) {
      uncounted++;
      continue;
    }
    counted.push({ name, damage, perSecond: round2(procDps(name, damage, m.dex, "primary", m.chances)), carriers: count });
  }
  counted.sort((a, b) => b.perSecond - a.perSecond || a.name.localeCompare(b.name));
  return { meanestProcs: counted.slice(0, MEANEST_PROCS), uncountedProcs: uncounted };
}

export function damageReport(
  model: DamageModel,
  pool: readonly BisCandidate[],
  loadout: readonly BisPick[],
  wearing: readonly Pick<BisPick, "slot" | "item">[] | undefined,
  statsOf: (c: BisCandidate) => ItemStats | undefined,
  procEffects: readonly { name: string; count: number }[] = [],
): DamageReport {
  const dexToCap = Math.max(0, PROC_DEX_CAP - model.dex);
  const hasteOf = (c: BisCandidate) => statsOf(c)?.stats.haste ?? 0;
  const loadoutItem = Math.max(0, ...loadout.map((p) => hasteOf(p.item)));
  let bestHaste: DamageReport["bestHaste"];
  for (const c of pool) {
    const haste = hasteOf(c);
    if (haste > (bestHaste?.haste ?? 0) || (bestHaste && haste === bestHaste.haste && c.heldAt && !bestHaste.heldAt)) {
      bestHaste = { title: c.title, grade: c.grade, ...(c.heldAt && { heldAt: c.heldAt }), haste, slots: c.slots };
    }
  }
  return {
    model,
    ...(wearing && { wearing: setupFrom(wearing, statsOf, model) }),
    loadout: setupFrom(loadout, statsOf, model),
    ...bestSetups(pool, statsOf, model),
    dexToCap,
    ppmAtCap: round2(dexToCap * PPM_PER_DEX),
    loadoutHaste: { fromItem: loadoutItem, effective: effectiveHaste(loadoutItem, model.melee.buffHaste, model.level) },
    ...(bestHaste && { bestHaste }),
    ...meanest(procEffects, model),
  };
}
