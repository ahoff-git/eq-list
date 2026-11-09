/**
 * stat-base.ts — what a character has before gear, so a floor can be in the game's own numbers.
 *
 * A goal like "at least 2,000 HP" is read off the Inventory window, which shows the whole character:
 * what the gear gives, what its attributes buy, and everything that is there with nothing worn — the
 * attributes a race and classes start with (and the HP, mana and AC they buy), a class's level-based HP,
 * AAs, buffs. Comparing the floor with the gear's share alone read a level-46 trio's 1,200 HP as about
 * 300 (ADR 0366), so the plan counts the rest too, in two parts:
 *
 * - **What the model knows** (`modelledBase`): the race's base attributes plus the classes' modifiers
 *   (`character-base.ts`), and the pools those attributes buy, read off each rate's own curve at the
 *   character's base. Needs a race (one ticked in the Race picker); without one there is nothing to say.
 * - **What it can't** (`Calibration`): the class and level HP table, AA bonuses, a standing buff. No
 *   formula for these is published, so the player says what the game shows and the difference from what
 *   the model counts is kept — as an *offset*, not as the typed number, so it stays right when the worn
 *   gear changes under it (the way `faction-correction.ts` keeps a stated total).
 *
 * What can be calibrated is what the game's stats page shows and the model can't fully explain: the four
 * pools (HP, mana, AC, endurance), the seven attributes, and the six resists. Attributes and resists are
 * the same case as the pools — a base the model knows only in part (a race's attributes, but not AAs or a
 * buff; no resist base at all) — and the stats grab (ADR 0368) reads every one of them in one go.
 *
 * Pure → a tested black box.
 */
import { ATTRIBUTES, baseAttributes } from "./character-base";
import type { DerivedRate } from "./derived-stats";
import type { StatKey } from "./item-stats";

export type StatTotals = Partial<Record<StatKey, number>>;

/** The six resists, as the stats page lists them. */
export const RESISTS = ["svMagic", "svFire", "svCold", "svDisease", "svPoison", "svVoid"] as const satisfies readonly StatKey[];

/** The stats the game shows that gear and race don't fully explain — the ones that can be calibrated. */
export const CALIBRATED = ["hp", "mana", "ac", "end", ...ATTRIBUTES, ...RESISTS] as const satisfies readonly StatKey[];
export type Calibrated = (typeof CALIBRATED)[number];

/** For each calibrated stat, the points the game shows beyond what the model counts (may be negative). */
export type Calibration = Partial<Record<Calibrated, number>>;

export const isCalibrated = (key: string): key is Calibrated => (CALIBRATED as readonly string[]).includes(key);

/** A stored calibration made whole: unknown stats, non-numbers and zeros are dropped. */
export function normalizeCalibration(stored: unknown): Calibration {
  const out: Calibration = {};
  if (!stored || typeof stored !== "object") return out;
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (isCalibrated(key) && typeof value === "number" && Number.isFinite(value) && Math.round(value) !== 0) out[key] = Math.round(value);
  }
  return out;
}

/**
 * What the character has before any gear, as far as the model knows: attributes from race and classes,
 * and the pools each rate's attribute buys at that base. Empty when no race is known.
 */
export function modelledBase({ rates, race, classes }: { rates: readonly DerivedRate[]; race?: string; classes: readonly string[] }): StatTotals {
  const out: StatTotals = {};
  const attributes = baseAttributes(race, classes);
  if (attributes) for (const a of ATTRIBUTES) out[a] = attributes[a];
  for (const rate of rates) {
    // A rate has a curve only when the race is known; that curve at the base is the pool the base buys.
    if (!rate.curve || rate.base === undefined) continue;
    out[rate.to] = (out[rate.to] ?? 0) + Math.round(rate.curve(rate.base));
  }
  return out;
}

/** Everything counted on top of gear: the modelled base, and the player's calibration. */
export function statBase(modelled: StatTotals, calibration: Calibration): StatTotals {
  const out: StatTotals = { ...modelled };
  for (const key of CALIBRATED) if (calibration[key]) out[key] = (out[key] ?? 0) + calibration[key]!;
  return out;
}

/**
 * What the model counts for the character *now*, before any calibration — the modelled base plus the
 * worn gear's effective totals (`effectiveStats`). The figure to compare with what the game shows.
 */
export function countedNow(modelled: StatTotals, wornEffective: StatTotals): StatTotals {
  const out: StatTotals = {};
  for (const key of CALIBRATED) out[key] = (modelled[key] ?? 0) + (wornEffective[key] ?? 0);
  return out;
}

/** The calibration with `key` set to the points the game shows beyond `counted`; no difference clears it. */
function withOffset(calibration: Calibration, key: Calibrated, shown: number, counted: number): Calibration {
  const next = { ...calibration };
  const extra = Math.round(shown - counted);
  if (extra === 0) delete next[key];
  else next[key] = extra;
  return next;
}

/** The calibration with one stat set so the model agrees with what the game shows; a blank or zero clears it. */
export function calibrate(calibration: Calibration, key: Calibrated, shown: number, counted: number): Calibration {
  return shown > 0 ? withOffset(calibration, key, shown, counted) : withOffset(calibration, key, counted, counted);
}

/**
 * The calibration after the stats page was read: every stat it gave is made to agree with the game, the
 * rest left as they were. Unlike a box the player typed into, a read **zero is a figure** (a character
 * with no void resist shows 0), not a blank — so it can pull a counted number down to match.
 */
export function applyRead(calibration: Calibration, shown: StatTotals, counted: StatTotals): Calibration {
  let next = calibration;
  for (const key of CALIBRATED) {
    const figure = shown[key];
    if (figure !== undefined && Number.isFinite(figure)) next = withOffset(next, key, figure, counted[key] ?? 0);
  }
  return next;
}

/**
 * The worn gear's totals with the resists you have **beyond** the gear added in — what the game's own window
 * shows against each type once the stats have been read. A resist is worked out from the points you have in all,
 * not just those on your back, so the damage-taken suggestions are given these (ADR 0370). With nothing read the
 * base holds no resist, and this is the gear alone, as before.
 */
export function withBaseResists(gear: StatTotals, base: StatTotals): StatTotals {
  const out: StatTotals = { ...gear };
  for (const key of RESISTS) if (base[key]) out[key] = (out[key] ?? 0) + base[key]!;
  return out;
}

/** What the game should show for a stat now, by the model and the calibration. */
export const shownNow = (counted: StatTotals, calibration: Calibration, key: Calibrated): number => (counted[key] ?? 0) + (calibration[key] ?? 0);
