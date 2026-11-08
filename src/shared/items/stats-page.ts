/**
 * stats-page.ts — the Inventory window's stats page, read back from an OCR pass.
 *
 * The page is rows of `Label   cur/max` (the layout is `EQUI_InventoryWindow.xml`'s `IWS_*` labels,
 * checked against a real level-31 screenshot, ADR 0368):
 *
 *     HP        1976/1976          Strength    74/510 + 0
 *     AC        242/368 | 280      SV. Fire    19/1000
 *
 * so reading it is three small problems, each its own function below:
 *
 * 1. **Which label owns which numbers** — by geometry, not by Tesseract's line order. Two columns share
 *    a row, and a label with no number ("Primary DPS") sits beside one with ("SV. Disease"), so a row
 *    is cut into *segments*: a run of text words, then the value tokens that follow it.
 * 2. **What the label is** — the game's own wording ("SV. Magic", "End", "Intelligence"), matched
 *    exactly, then within an edit or two so "Intelllgence" still lands.
 * 3. **What the numbers are** — `cur/max`, and here is the failure that matters: at this font size the
 *    `/` is a thin stroke that Tesseract reads as a **`1`** (`242/368` → `2421368`) or drops. The format
 *    is rigid enough to undo that: a repaired cell is the split that fits what the stat can be (a
 *    pool's max is at least its current and usually equal to it; an attribute's max is the cap every
 *    other row shows). A repair that rests on nothing is reported as `doubtful`, never passed off as read.
 *
 * Several OCR passes may be given — the same image prepared two ways fails in different places, so per
 * stat the cleanest read wins (a cell whose dividers all survived, then a repair that was certain, then
 * any repair), the recogniser's own confidence breaking a tie, and the first pass winning an even one.
 *
 * What comes out is in the planner's stat keys, ready for `stat-base.ts` to turn into calibration.
 * Pure → a tested black box.
 */
import { levenshtein } from "../fuzzy";
import { rowsOf, typicalHeight, type OcrRow, type OcrWord } from "../chrome/ocr-rows";
import { ATTRIBUTE_CAP } from "./character-base";
import type { StatKey } from "./item-stats";

/** What the page said, in the planner's own stat keys. */
export type StatsValues = Partial<Record<StatKey, number>>;

export interface StatsRead {
  values: StatsValues;
  /** Read, but a lost `/` had to be inferred from what the stat can be — cells a second look could read cleanly. */
  repaired: StatKey[];
  /** Read with little behind it: a repair that rests on nothing, or a word the recogniser was unsure of. */
  doubtful: StatKey[];
  /** On the page, as far as we know, but not found — scrolled out of view, or too garbled to place. */
  missing: StatKey[];
}

/** A resist's cap as the page prints it (`SV. Fire 19/1000`). Attributes' is `ATTRIBUTE_CAP` (`74/510`). */
export const RESIST_CAP = 1000;

type Group = "pool" | "ac" | "attribute" | "resist";

interface Field {
  key: StatKey;
  group: Group;
  /** The wording the game uses, then the ones another skin does (`End`/`Endurance`, `SV. Magic`/`Magic`). */
  labels: readonly string[];
}

/** Every stat the page gives that the planner can use, with how the game words it. */
const FIELDS: readonly Field[] = [
  { key: "hp", group: "pool", labels: ["hp", "hit points"] },
  { key: "mana", group: "pool", labels: ["mana"] },
  { key: "end", group: "pool", labels: ["end", "endurance"] },
  { key: "ac", group: "ac", labels: ["ac", "armor class"] },
  { key: "str", group: "attribute", labels: ["strength", "str"] },
  { key: "sta", group: "attribute", labels: ["stamina", "sta"] },
  { key: "int", group: "attribute", labels: ["intelligence", "int"] },
  { key: "wis", group: "attribute", labels: ["wisdom", "wis"] },
  { key: "agi", group: "attribute", labels: ["agility", "agi"] },
  { key: "dex", group: "attribute", labels: ["dexterity", "dex"] },
  { key: "cha", group: "attribute", labels: ["charisma", "cha"] },
  { key: "svMagic", group: "resist", labels: ["sv magic", "magic"] },
  { key: "svFire", group: "resist", labels: ["sv fire", "fire"] },
  { key: "svCold", group: "resist", labels: ["sv cold", "cold"] },
  { key: "svDisease", group: "resist", labels: ["sv disease", "disease"] },
  { key: "svPoison", group: "resist", labels: ["sv poison", "poison"] },
  { key: "svVoid", group: "resist", labels: ["sv void", "void", "sv corruption", "corruption"] },
];

/** How many numbers a cell holds: `cur/max`, and for AC `cur/softcap | evasion`. */
const PARTS: Record<Group, number> = { pool: 2, attribute: 2, resist: 2, ac: 3 };

/** What a number can be, for the group — outside this it is a misread, not a stat. */
const PLAUSIBLE: Record<Group, number> = { pool: 9_999_999, ac: 99_999, attribute: 2_000, resist: 5_000 };

/** A word the recogniser was this unsure of (0–100) makes its stat doubtful, however tidy the number looks. */
const UNSURE = 55;

/** A repaired split is believed only when this far ahead of the next-best — that takes a structural match, not a style preference. */
const DECISIVE = 5;

// ── 1. Rows into segments ──

/** A label and the value tokens that follow it on its row. */
interface Segment {
  label: string;
  tokens: OcrWord[];
}

/** Digits and the characters a digit-run's neighbours get read as; with a digit, or a bare divider, it is a value token. */
const VALUE = /^[0-9OolI!|/\\,.+%()-]+$/;
const DIVIDER_ONLY = /^[Il!|/\\+]+$/;
const isValue = (text: string): boolean => VALUE.test(text) && (/[0-9]/.test(text) || DIVIDER_ONLY.test(text));

/**
 * One row cut into segments. A new label starts at the first text word after values, or after a gap wider
 * than a word — which is what keeps "Primary DPS" (no number) from swallowing "SV. Disease" beside it.
 */
function segmentsOf(row: OcrRow, unit: number): Segment[] {
  const segments: Segment[] = [];
  let label: OcrWord[] = [];
  let tokens: OcrWord[] = [];
  const close = () => {
    if (label.length) segments.push({ label: label.map((w) => w.text).join(" "), tokens });
    label = [];
    tokens = [];
  };
  for (const word of row.words) {
    if (isValue(word.text)) {
      if (label.length) tokens.push(word);
      continue;
    }
    const last = label[label.length - 1];
    if (tokens.length > 0 || (last && word.x0 - last.x1 > unit)) close();
    label.push(word);
  }
  close();
  return segments;
}

// ── 2. Labels ──

const normalLabel = (text: string): string => text.toLowerCase().replace(/[^a-z]+/g, " ").trim();

const ALIASES = new Map<string, Field>(FIELDS.flatMap((f) => f.labels.map((l) => [l, f] as const)));

/**
 * The stat a label names. Exact first; then within an edit (an edit or two for the long names) of
 * exactly one stat's wording — short labels ("AC", "End") never match loosely, they are too near each other.
 */
function fieldFor(text: string): Field | undefined {
  const label = normalLabel(text);
  const exact = ALIASES.get(label);
  if (exact) return exact;
  if (label.length < 5) return undefined;
  let best: { field: Field; distance: number } | undefined;
  let tied = false;
  for (const [alias, field] of ALIASES) {
    if (alias.length < 5) continue;
    const distance = levenshtein(label, alias);
    if (distance > (alias.length >= 8 ? 2 : 1)) continue;
    if (!best || distance < best.distance) {
      best = { field, distance };
      tied = false;
    } else if (distance === best.distance && field !== best.field) tied = true;
  }
  return best && !tied ? best.field : undefined;
}

// ── 3. Cells ──

interface Cell {
  /** Digits and dividers, tidied: "242/368|280". */
  text: string;
  /** How sure the recogniser was of the words that carry the figure — the least of them. */
  confidence: number;
}

/**
 * The value tokens as one string — cut where the heroic bonus (`+ 0`) begins, which is not the stat. How
 * sure the read is rests only on the words that carry the figure: not the heroic bonus, and for AC not
 * the evasion beside it (a stray misread `280` says nothing about the 242 that is wanted).
 */
function cellOf(tokens: readonly OcrWord[], group: Group): Cell | undefined {
  const own: OcrWord[] = [];
  for (const token of tokens) {
    const before = token.text.split("+")[0];
    if (before) own.push({ ...token, text: before });
    if (before !== token.text) break;
  }
  const text = own
    .map((t) => t.text)
    .join("")
    .replace(/[,%()\s]/g, "")
    .replace(/[Oo]/g, "0")
    // A divider can't begin a figure, so a leading I/l is a 1 (`l37` is 137); anywhere else it is the divider.
    .replace(/^[Il]/, "1")
    .replace(/[Il!]/g, "|")
    .replace(/[\\]/g, "/");
  if (!/[0-9]/.test(text)) return undefined;
  const carriers = group === "ac" ? own.slice(0, 1) : own;
  return { text, confidence: Math.min(...carriers.map((t) => t.confidence)) };
}

interface Decoded {
  parts: number[];
  /** Every divider was read as one. */
  clean: boolean;
  /** For a repair: it rests on a structural match, not on a preference for how the font fails. */
  certain: boolean;
}

const DIVIDERS = /[/|]+/;
const isWhole = (digits: string) => /^[0-9]+$/.test(digits);
const noLeadingZero = (digits: string) => digits === "0" || !digits.startsWith("0");

/** AC's first number is only ever fused with the softcap when it has this many digits (1 + 1 + 3 at the least). */
const FUSED_AC_DIGITS = 5;

/**
 * A run of digits that should hold a current and a max, split. The `/` between them came out as a `1`
 * (inserted) or as nothing (dropped); both splits are tried and the structure of the stat decides:
 * a pool's max is at least its current, and equal to it unless it is damaged or spent; an attribute's or
 * resist's max is the cap the other rows show. A split is only *taken* when something anchors it — a
 * lone `1976` is not `19/76` — except AC, which has no anchor (its softcap is anything), so it is taken
 * only from a number long enough to be two, and never called certain. A style preference (an inserted
 * `1` is the commoner failure) breaks ties but cannot decide a split alone.
 */
function splitFused(digits: string, group: Group, caps: readonly number[]): { cur: number; max: number; certain: boolean } | undefined {
  if (group === "ac" && digits.length < FUSED_AC_DIGITS) return undefined;
  const scored: { cur: string; max: string; score: number }[] = [];
  for (let i = 1; i < digits.length; i++) {
    const options = [{ cur: digits.slice(0, i), max: digits.slice(i), style: 0.5 }];
    if (digits[i] === "1" && i <= digits.length - 2) options.push({ cur: digits.slice(0, i), max: digits.slice(i + 1), style: 1 });
    for (const { cur, max, style } of options) {
      if (!noLeadingZero(cur) || !noLeadingZero(max)) continue;
      if (group !== "ac" && Number(cur) > Number(max)) continue;
      let score = style;
      if (group === "pool" && cur === max) score += 10;
      if ((group === "attribute" || group === "resist") && caps.includes(Number(max))) score += 10;
      scored.push({ cur, max, score });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  const [best, next] = scored;
  if (!best || (group !== "ac" && best.score < 10)) return undefined;
  return { cur: Number(best.cur), max: Number(best.max), certain: best.score - (next?.score ?? 0) >= DECISIVE };
}

/**
 * How many numbers the cell should hold if every divider survived. AC is `cur/softcap | evasion`, but a
 * `/` in the text says the first divider did survive, so its first two numbers are already apart.
 */
const expectedPieces = (group: Group, text: string): number => (group === "ac" && text.includes("/") ? 2 : PARTS[group]);

/** The cell as numbers: cleanly where its dividers survived, repaired where they didn't. */
function decode(cell: Cell, group: Group, caps: readonly number[]): Decoded | undefined {
  const pieces = cell.text.split(DIVIDERS).filter(Boolean);
  if (!pieces.length || !pieces.every(isWhole)) return undefined;
  if (pieces.length >= expectedPieces(group, cell.text)) return { parts: pieces.map(Number), clean: true, certain: true };
  const [first, ...rest] = pieces;
  const split = splitFused(first, group, caps);
  if (split) return { parts: [split.cur, split.max, ...rest.map(Number)], clean: false, certain: split.certain };
  // Nothing to split: a lone number is all the page gave. A pool's max is the figure wanted, so it stands for both.
  const lone = Number(first);
  return { parts: group === "pool" ? [lone, lone, ...rest.map(Number)] : [lone, ...rest.map(Number)], clean: false, certain: false };
}

/** The number a stat is *for*: a pool's max (current dips in a fight), anything else's current. */
const valueOf = (group: Group, parts: readonly number[]): number => (group === "pool" ? (parts[1] ?? parts[0]) : parts[0]);

// ── The read ──

interface Candidate {
  field: Field;
  cell: Cell;
}

/** Every labelled cell one pass found, the first of each stat kept (rows read top to bottom, left to right). */
function candidatesIn(pass: readonly OcrWord[]): Candidate[] {
  const unit = typicalHeight(pass);
  const found = new Map<StatKey, Candidate>();
  for (const row of rowsOf(pass)) {
    for (const segment of segmentsOf(row, unit)) {
      const field = fieldFor(segment.label);
      const cell = field && cellOf(segment.tokens, field.group);
      if (field && cell && !found.has(field.key)) found.set(field.key, { field, cell });
    }
  }
  return [...found.values()];
}

/** The max the page prints beside attributes, and beside resists — read off the rows that came out clean. */
function capsFrom(candidates: readonly Candidate[], group: Group, fallback: number): number[] {
  const seen = new Map<number, number>();
  for (const { field, cell } of candidates) {
    if (field.group !== group) continue;
    const decoded = decode(cell, group, []);
    if (decoded?.clean && decoded.parts[1] !== undefined) seen.set(decoded.parts[1], (seen.get(decoded.parts[1]) ?? 0) + 1);
  }
  const common = [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([cap]) => cap);
  return common.includes(fallback) ? common : [...common, fallback];
}

/** How much a read is to be trusted as a read: a clean cell beats a certain repair beats a guess. */
const grade = (d: Decoded): number => (d.clean ? 2 : d.certain ? 1 : 0);

/**
 * The stats page, from one or more OCR passes of the same image (best-trusted first). Per stat, the
 * cleanest read wins; between reads of the same grade the more confident word does, and between equally
 * confident ones the earlier pass.
 */
export function readStatsPage(passes: readonly (readonly OcrWord[])[]): StatsRead {
  const reads = passes.map(candidatesIn);
  const all = reads.flat();
  const caps: Partial<Record<Group, number[]>> = {
    attribute: capsFrom(all, "attribute", ATTRIBUTE_CAP),
    resist: capsFrom(all, "resist", RESIST_CAP),
  };
  const values: StatsValues = {};
  const repaired: StatKey[] = [];
  const doubtful: StatKey[] = [];
  for (const field of FIELDS) {
    const options = reads
      .map((read) => read.find((c) => c.field.key === field.key))
      .filter((c): c is Candidate => !!c)
      .map((c) => ({ cell: c.cell, decoded: decode(c.cell, field.group, caps[field.group] ?? []) }))
      .filter((o): o is { cell: Cell; decoded: Decoded } => !!o.decoded && valueOf(field.group, o.decoded.parts) <= PLAUSIBLE[field.group]);
    const chosen = options.reduce<(typeof options)[number] | undefined>((best, o) => {
      if (!best) return o;
      const better = grade(o.decoded) - grade(best.decoded) || o.cell.confidence - best.cell.confidence;
      return better > 0 ? o : best;
    }, undefined);
    if (!chosen) continue;
    values[field.key] = valueOf(field.group, chosen.decoded.parts);
    if (!chosen.decoded.clean) repaired.push(field.key);
    if ((!chosen.decoded.clean && !chosen.decoded.certain) || chosen.cell.confidence < UNSURE) doubtful.push(field.key);
  }
  return { values, repaired, doubtful, missing: FIELDS.map((f) => f.key).filter((key) => values[key] === undefined) };
}

/**
 * The figures a read was sure of — what may be applied without asking. A doubtful one (a repair that rests
 * on nothing, a word the recogniser was unsure of) is shown to the player and never used until they say so:
 * a wrong 2,427 AC applied quietly would hold every later plan to it.
 */
export function confidentValues(read: StatsRead): StatsValues {
  const out: StatsValues = {};
  for (const [key, value] of Object.entries(read.values) as [StatKey, number][]) if (!read.doubtful.includes(key)) out[key] = value;
  return out;
}
