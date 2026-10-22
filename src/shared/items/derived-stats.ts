/**
 * derived-stats.ts — HP, mana and AC are partly made of other stats, so weighting them should
 * weight those stats too.
 *
 * A card's `MANA: +25` is mana, but so is its `INT: +10` — for a class whose pool runs on
 * intelligence. Weighting only the printed number misses the bigger half of what "max my mana" asks,
 * so this works out, for **your classes at your level**, how many points of a secondary stat one
 * point of a primary stat buys, and folds that into the weight sheet before anything is scored:
 *
 *   effective INT weight = your INT weight + your Mana weight × mana per INT
 *
 * Search and best in slot both score with the folded sheet, so they can't disagree about it.
 *
 * The rates, and where each comes from (EQL publishes none; see ADR 0317):
 *
 * - **STA → HP.** Each class's pool gains `level × factor / 3000` HP per STA, the factor being
 *   EQEmu's `GetClassLevelFactor`. That table reproduces every row of eqlwiki's level-50 and
 *   level-60 STA-to-HP charts (Game Mechanics, "Hitpoint Calculation").
 * - **INT/WIS → mana.** Each caster's pool gains `2.5 × perConverted(level)` mana per point while
 *   the stat sits in 101–200, the band a geared character is in. `perConverted` is EQEmu's
 *   `CalcBaseMana`; at level 50 it gives 11.25 mana per point, which EQL players measured
 *   (eqltools.com, gear-score.js comments). Hybrids pool at the same rate as full casters.
 * - **Best two of three.** A trio's HP and mana are the sum of its two biggest pools, so a third
 *   class adds nothing (eqltools.com "The trio system" — player consensus, not a developer statement).
 * - **AGI → AC.** About a third of an AC per point above 75 (eqlwiki Statistics: 76→85 AGI gave a
 *   level-60 Shadow Knight 3 AC). The softest number here. Below 75 the loss is far steeper, but no
 *   geared character is down there.
 *
 * The character's own stat totals are not known, so the 255 STA halving and the 200 INT/WIS knee are
 * not applied; the rates are the ones a character between 100 and 200 sees.
 */
import type { ClassName } from "../class-names";
import type { StatKey } from "./item-stats";
import type { StatWeights } from "./item-search";

/** Who is being scored for: the classes the Class picker has ticked, and a level. */
export interface CharacterBasis {
  classes: readonly string[];
  level: number;
}

/** One point of `from` is worth `perPoint` points of `to`, through these classes' pools. */
export interface DerivedRate {
  from: StatKey;
  to: StatKey;
  perPoint: number;
  /** The classes whose pools carry it — empty for a rate no class changes (AGI → AC). */
  pools: string[];
}

/** A trio's pool is its two biggest classes' pools added up. */
const COUNTED_POOLS = 2;

/** A stat between 101 and 200 converts at 2.5 points per point; see the module note. */
const MID_BAND_CONVERSION = 2.5;

/** AC per AGI above 75; see the module note. */
const AC_PER_AGI = 1 / 3;

/**
 * EQEmu's `GetClassLevelFactor`: the per-class HP-per-STA factor, which steps up with level. Each row
 * is `[below this level, factor]`, the last row covering everything above.
 */
const HP_FACTORS: Record<ClassName, readonly (readonly [number, number])[]> = {
  Warrior: [[20, 220], [30, 230], [40, 250], [53, 270], [57, 280], [60, 290], [70, 300], [Infinity, 311]],
  Paladin: [[35, 210], [45, 220], [51, 230], [56, 240], [60, 250], [68, 260], [Infinity, 270]],
  "Shadow Knight": [[35, 210], [45, 220], [51, 230], [56, 240], [60, 250], [68, 260], [Infinity, 270]],
  Berserker: [[35, 210], [45, 220], [51, 230], [56, 240], [60, 250], [68, 260], [Infinity, 270]],
  Ranger: [[58, 200], [70, 210], [Infinity, 220]],
  Monk: [[51, 180], [58, 190], [70, 200], [Infinity, 210]],
  Bard: [[51, 180], [58, 190], [70, 200], [Infinity, 210]],
  Rogue: [[51, 180], [58, 190], [70, 200], [Infinity, 210]],
  Beastlord: [[51, 180], [58, 190], [70, 200], [Infinity, 210]],
  Cleric: [[70, 150], [Infinity, 157]],
  Druid: [[70, 150], [Infinity, 157]],
  Shaman: [[70, 150], [Infinity, 157]],
  Necromancer: [[70, 120], [Infinity, 127]],
  Wizard: [[70, 120], [Infinity, 127]],
  Magician: [[70, 120], [Infinity, 127]],
  Enchanter: [[70, 120], [Infinity, 127]],
};

/** Which stat feeds each caster's mana pool. A class not listed has none. */
const MANA_STAT: Partial<Record<ClassName, "int" | "wis">> = {
  Bard: "int",
  "Shadow Knight": "int",
  Necromancer: "int",
  Wizard: "int",
  Magician: "int",
  Enchanter: "int",
  Paladin: "wis",
  Ranger: "wis",
  Beastlord: "wis",
  Cleric: "wis",
  Druid: "wis",
  Shaman: "wis",
};

const FULL_CASTERS = new Set<string>(["Cleric", "Druid", "Shaman", "Necromancer", "Wizard", "Magician", "Enchanter"]);

const round2 = (n: number) => Math.round(n * 100) / 100;

function hpFactor(klass: string, level: number): number {
  const steps = HP_FACTORS[klass as ClassName];
  return steps?.find(([below]) => level < below)?.[1] ?? 0;
}

/** Mana per *converted* point of INT/WIS, per pool — EQEmu `CalcBaseMana`. */
function manaPerConverted(level: number): number {
  return level <= 40 ? 0.075 * level : 3 + 0.15 * (level - 40);
}

/**
 * The two mana pools a trio counts. A full caster's pool is the big one, so full casters lead; the
 * tiebreak favours a stat two classes share. Decided by the classes alone, never by gear — ranking on
 * stat totals made a point of WIS able to flip which pools counted (eqltools found the same).
 */
function countedManaPools(classes: readonly string[]): { klass: string; stat: "int" | "wis" }[] {
  const pools = classes.flatMap((klass) => {
    const stat = MANA_STAT[klass as ClassName];
    return stat ? [{ klass, stat }] : [];
  });
  const shared = (stat: string) => pools.filter((p) => p.stat === stat).length > 1;
  const rank = (p: { klass: string; stat: string }) => (FULL_CASTERS.has(p.klass) ? 2 : 0) + (shared(p.stat) ? 1 : 0);
  return [...pools].sort((a, b) => rank(b) - rank(a)).slice(0, COUNTED_POOLS);
}

/**
 * What one point of each primary stat is worth in HP, mana and AC, for these classes at this level.
 * No class ticked means no pools to speak of, so only AGI → AC is offered.
 */
export function derivedRates({ classes, level }: CharacterBasis): DerivedRate[] {
  const rates: DerivedRate[] = [];

  const hpPools = classes
    .filter((klass) => hpFactor(klass, level) > 0)
    .sort((a, b) => hpFactor(b, level) - hpFactor(a, level))
    .slice(0, COUNTED_POOLS);
  if (hpPools.length) {
    const factor = hpPools.reduce((sum, klass) => sum + hpFactor(klass, level), 0);
    rates.push({ from: "sta", to: "hp", perPoint: round2((level * factor) / 3000), pools: hpPools });
  }

  const manaPools = countedManaPools(classes);
  for (const stat of ["int", "wis"] as const) {
    const pools = manaPools.filter((p) => p.stat === stat).map((p) => p.klass);
    if (!pools.length) continue;
    const perPoint = pools.length * MID_BAND_CONVERSION * manaPerConverted(level);
    rates.push({ from: stat, to: "mana", perPoint: round2(perPoint), pools });
  }

  rates.push({ from: "agi", to: "ac", perPoint: round2(AC_PER_AGI), pools: [] });
  return rates;
}

/**
 * The weight sheet with the secondary stats folded into the primary ones: each rate adds
 * `weight[to] × perPoint` to `weight[from]`. A secondary stat left unweighted adds nothing, so a sheet
 * that never mentions HP, mana or AC comes back as it went in.
 */
export function foldDerivedWeights(weights: StatWeights, rates: readonly DerivedRate[]): StatWeights {
  const out: StatWeights = { ...weights };
  for (const rate of rates) {
    const via = weights[rate.to];
    if (!via) continue;
    const total = round2((out[rate.from] ?? 0) + via * rate.perPoint);
    if (total === 0) delete out[rate.from];
    else out[rate.from] = total;
  }
  return out;
}

/** The rates that a sheet actually uses — the ones whose secondary stat carries a weight. */
export function ratesInUse(weights: StatWeights, rates: readonly DerivedRate[]): DerivedRate[] {
  return rates.filter((rate) => !!weights[rate.to]);
}

/** What one item's attributes give in a weighted secondary stat: `amount` of `to`, from `points` of `from`. */
export interface DerivedGain {
  from: StatKey;
  to: StatKey;
  points: number;
  amount: number;
}

/**
 * Why an item is worth more than its printed numbers: what its attributes give in the secondary stats
 * you've weighted — "+203 mana from 9 INT". Only the rates a sheet uses (`ratesInUse`), so an item is
 * never explained by a stat you didn't ask for; whole points, as the game shows a pool.
 */
export function derivedGains(stats: Partial<Record<StatKey, number>>, weights: StatWeights, rates: readonly DerivedRate[]): DerivedGain[] {
  return ratesInUse(weights, rates).flatMap((rate) => {
    const points = stats[rate.from] ?? 0;
    const amount = Math.round(points * rate.perPoint);
    return points > 0 && amount > 0 ? [{ from: rate.from, to: rate.to, points, amount }] : [];
  });
}
