/**
 * item-upgrade.ts — what an item's numbers become at `+N`.
 *
 * EQL items merge up from +0 to +10 ([Item Upgrade System](https://eqlwiki.com/Item_Upgrade_System)),
 * and the wiki's item pages carry a slider that rescales the stat card as you drag it. That slider
 * is the server extension `ext.itemLevelSlider` — client-side JavaScript with no API behind it, so
 * there is nothing to *ask* the wiki for; the only way to get its numbers is to run its arithmetic.
 * This is that arithmetic, ported verbatim (including the spreadsheet-style rounding), so a `+4` here
 * reads exactly what the wiki shows at `+4`.
 *
 * Where the slider and the guide page's prose disagree, the slider wins: it is what every item page
 * displays, and the guide's own worked example predates it (ADR 0307).
 *
 * The rules, per stat:
 *  - **AC, HP, Mana, attributes, saves** — a base of 10 or less gains a flat +1 per whole grade; a
 *    larger base gains 10% per grade, *including* partial progress toward the next one, rounded
 *    half-up. Penalties shrink the same way and never cross zero.
 *  - **DMG** — +10% per grade (partial progress counts), rounded down. Backstab and other labelled
 *    damage don't scale.
 *  - **Haste** — +1 per whole grade.
 *  - **Weight** — shrinks logarithmically with total progression, rounded *up* to 0.1; 0.1 or less never moves.
 *  - **Delay** — never changes; `ratio` is re-derived from the new DMG.
 *
 * Pure and DOM-free: it is handed the sparse stat record `item-stats.ts` reads off a card and returns
 * another, so a stat the card was silent on stays silent.
 */

import type { ItemStats, StatKey } from "./item-stats";
import { heldAsNamed, type ShownName } from "../shown-name";

/** The highest grade an item can merge to. */
export const MAX_GRADE = 10;

type Stats = Partial<Record<StatKey, number>>;

/** Where an item sits on the ladder: its whole grade, and how much exp it has banked toward the next. */
interface GradeState {
  full: number;
  /** Exp into the current grade, out of `2^full` needed to reach the next. Always 0 at the cap. */
  fraction: number;
}

/** The stats the slider's "spreadsheet" rule covers — the flat-then-percent growth. */
const PRIMARY: ReadonlySet<StatKey> = new Set<StatKey>([
  "ac", "hp", "mana", "str", "sta", "agi", "dex", "wis", "int", "cha",
  "svFire", "svCold", "svMagic", "svDisease", "svPoison",
]);

// ---- The slider's rounding, kept as written so the last digit agrees with the wiki ----

/** Excel's ROUND: half away from zero. */
function excelRound(value: number): number {
  return value >= 0 ? Math.floor(value + 0.5) : Math.ceil(value - 0.5);
}

/** Excel's ROUNDUP to one decimal place (away from zero). */
function excelRoundUpTenths(value: number): number {
  const scaled = value * 10;
  return (value >= 0 ? Math.ceil(scaled) : Math.floor(scaled)) / 10;
}

// ---- Per-stat growth ----

/** Whole grades plus the share of the next one already earned — `1.5` is +1 and halfway to +2. */
function effectiveLevel({ full, fraction }: GradeState): number {
  return full <= 0 ? 0 : full + fraction / 2 ** full;
}

function scalePrimary(base: number, state: GradeState): number {
  if (base === 0) return 0;
  if (base > 0 && base <= 10) return base + state.full;
  if (base > 10) return Math.floor(base + excelRound((base * effectiveLevel(state)) / 10));
  // A penalty improves the same way a bonus grows, and stops at zero rather than flipping into one.
  if (Math.abs(base) <= 10) return Math.min(0, base + state.full);
  return Math.min(0, base + excelRound((Math.abs(base) * effectiveLevel(state)) / 10));
}

function scaleDamage(base: number, state: GradeState): number {
  return base <= 0 ? base : base + Math.floor((base * effectiveLevel(state)) / 10);
}

function scaleFlat(base: number, state: GradeState): number {
  return base > 0 ? base + state.full : base;
}

function scaleWeight(base: number, state: GradeState): number {
  if (state.full <= 0 || base <= 0.1) return base;
  const totalProgression = 2 ** state.full + state.fraction;
  return Math.max(0, excelRoundUpTenths(base * (1 - 0.09 * Math.log2(totalProgression))));
}

function scaleStat(key: StatKey, base: number, state: GradeState): number {
  if (PRIMARY.has(key)) return scalePrimary(base, state);
  if (key === "dmg") return scaleDamage(base, state);
  if (key === "haste") return scaleFlat(base, state);
  if (key === "wt") return scaleWeight(base, state);
  return base; // delay, backstab: the slider leaves them alone; ratio is re-derived below
}

/** Clamp to the ladder the slider allows: +0…+10, and no more banked exp than the next grade needs. */
function gradeState(grade: number, exp: number): GradeState {
  const full = Math.max(0, Math.min(MAX_GRADE, Math.trunc(grade)));
  const fraction = full === 0 || full === MAX_GRADE ? 0 : Math.max(0, Math.min(2 ** full - 1, Math.trunc(exp)));
  return { full, fraction };
}

/**
 * An item's stats at `+grade`, optionally with `exp` banked toward the next grade (the wiki's
 * fractional steps: `+2` with 3 exp is three-quarters of the way to `+3`).
 *
 * `stats` are the item's **+0** numbers — what its wiki card prints. Out-of-range grades clamp.
 */
export function gradedStats(stats: Stats, grade: number, exp = 0): Stats {
  const state = gradeState(grade, exp);
  const out: Stats = {};
  for (const [key, base] of Object.entries(stats) as [StatKey, number][]) {
    out[key] = scaleStat(key, base, state);
  }
  // Same derivation and rounding as `parseItemStats`, so a graded ratio compares with an ungraded one.
  if (out.dmg !== undefined && out.delay) out.ratio = Math.round((out.dmg / out.delay) * 100) / 100;
  return out;
}

/**
 * A whole stat reading at `+grade` (and `exp` toward the next) — what the Items tab and best-in-slot
 * weigh. The same arithmetic as `gradedCardLines`, so a number searched for is the number the card
 * shows (ADR 0312). +0 is the reading itself.
 */
export function gradedItemStats(stats: ItemStats, grade: number, exp = 0): ItemStats {
  const state = gradeState(grade, exp);
  return state.full === 0 ? stats : { ...stats, stats: gradedStats(stats.stats, state.full, state.fraction) };
}

// ---- The card itself, rewritten ----
//
// `gradedStats` answers "what are the numbers", for search and comparison. A card that is *shown* wants
// its own lines back with the numbers changed in place, and it carries labels `item-stats.ts` never
// reads (Endurance, regen, a bow's Range) that the slider scales all the same. So this is the slider's
// own approach — find each `LABEL: number` on a line and rewrite the number — over the same growth rules.

/** A card label, by the key the slider files it under. Longest first, so `HP REGEN` wins over `HP`. */
const CARD_LABELS: readonly [label: string, key: string][] = [
  ["ENDURANCE REGENERATION", "END_REGEN"], ["MANA REGENERATION", "MANA_REGEN"], ["HP REGENERATION", "HP_REGEN"],
  ["ENDURANCE REGEN", "END_REGEN"], ["ENDUR REGEN", "END_REGEN"], ["END REGEN", "END_REGEN"],
  ["MANA REGEN", "MANA_REGEN"], ["MP REGEN", "MANA_REGEN"], ["HP REGEN", "HP_REGEN"],
  ["SV DISEASE", "SV_DISEASE"], ["SV POISON", "SV_POISON"], ["SV MAGIC", "SV_MAGIC"], ["SV COLD", "SV_COLD"],
  ["SV FIRE", "SV_FIRE"], ["DAMAGE", "DMG"], ["WEIGHT", "WT"], ["DISEASE", "SV_DISEASE"], ["POISON", "SV_POISON"],
  ["MAGIC", "SV_MAGIC"], ["ENDUR", "END"], ["RANGE", "RANGE"], ["HASTE", "HASTE"], ["COLD", "SV_COLD"],
  ["FIRE", "SV_FIRE"], ["MANA", "MP"], ["DMG", "DMG"], ["END", "END"], ["STR", "STR"], ["STA", "STA"],
  ["AGI", "AGI"], ["DEX", "DEX"], ["WIS", "WIS"], ["INT", "INT"], ["CHA", "CHA"], ["AC", "AC"], ["HP", "HP"],
  ["MP", "MP"], ["WT", "WT"],
];
const CARD_KEY = new Map(CARD_LABELS.map(([label, key]) => [label, key]));
const CARD_STAT_RE = new RegExp(
  `(\\b(?:${CARD_LABELS.map(([l]) => l).join("|")})\\b)(:\\s*)([+-]?)(\\d+(?:\\.\\d+)?)(\\s*%?)`,
  "gi",
);
/** Card keys under the flat-then-percent rule — `PRIMARY` plus Endurance, which `StatKey` lacks. */
const PRIMARY_CARD = new Set([
  "AC", "HP", "MP", "END", "STR", "STA", "AGI", "DEX", "WIS", "INT", "CHA",
  "SV_MAGIC", "SV_FIRE", "SV_COLD", "SV_POISON", "SV_DISEASE",
]);
const FLAT_CARD = new Set(["HP_REGEN", "MANA_REGEN", "END_REGEN", "HASTE"]);
/** Having two of these earns an item the slider's invented `SV VOID: +grade` line. HP, Mana and AC don't count. */
const VOID_QUALIFIERS = new Set([
  "STR", "STA", "INT", "AGI", "DEX", "CHA", "WIS", "SV_FIRE", "SV_COLD", "SV_POISON", "SV_MAGIC", "SV_DISEASE",
]);

function scaleCardValue(key: string, signedBase: number, state: GradeState): number {
  if (PRIMARY_CARD.has(key)) return scalePrimary(signedBase, state);
  if (key === "DMG") return scaleDamage(signedBase, state);
  if (key === "RANGE") return signedBase < 0 ? signedBase : signedBase + 10 * state.full;
  if (FLAT_CARD.has(key)) return scaleFlat(signedBase, state);
  if (key === "WT") return scaleWeight(Math.abs(signedBase), state);
  return signedBase;
}

/** As the slider prints it: weight to one place, a `+` kept only where the card wrote one. */
function formatCardValue(value: number, sign: string, key: string): string {
  if (key === "WT") return value.toFixed(1);
  const text = Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
  return value > 0 && sign === "+" ? `+${text}` : text;
}

/**
 * An item's card lines at `+grade` (and `exp` toward the next), numbers rewritten in place exactly as
 * the wiki's slider would show them. +0 is the card as printed. A copy every time — never the input.
 *
 * Only a `DMG:` (or `Base Dmg:`) that opens its line is weapon damage; `Cold DMG:` and `BACKSTAB:` are left alone.
 */
export function gradedCardLines(lines: readonly string[], grade: number, exp = 0): string[] {
  const state = gradeState(grade, exp);
  if (state.full === 0) return [...lines];
  const qualifiers = new Set<string>();
  const out = lines.map((line) =>
    line.replace(CARD_STAT_RE, (match, label: string, colon: string, sign: string, num: string, pct: string, offset: number) => {
      const key = CARD_KEY.get(label.toUpperCase().replace(/\s+/g, " ")) ?? label.toUpperCase();
      // `Base Dmg:` is weapon damage too (Keg Mallet). The wiki's slider misses it — it only knows a bare
      // `DMG:` — but its own rules say weapon damage grows, and `item-stats.ts` reads it as `dmg`, so
      // the card agrees with the numbers the Items tab and best-in-slot weigh.
      if (key === "DMG" && !/^(?:base)?$/i.test(line.slice(0, offset).trim())) return match;
      if (VOID_QUALIFIERS.has(key)) qualifiers.add(key);
      const value = scaleCardValue(key, sign === "-" ? -Number(num) : Number(num), state);
      return `${label}${colon}${formatCardValue(value, sign, key)}${pct}`;
    }),
  );
  if (qualifiers.size >= 2) out.push(`SV VOID: +${state.full}`);
  return out;
}

/** `Dragoon Dirk +2` — how a graded copy is named, so a card and the log agree on it. */
export function gradedTitle(title: string, grade: number): ShownName {
  return heldAsNamed(grade > 0 ? `${title} +${grade}` : title);
}
