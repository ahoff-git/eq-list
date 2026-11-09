/**
 * stats-identity.ts — who the Inventory window says you are: the name, the level and the classes.
 *
 * They sit in the window's top-right corner, over the XP bars:
 *
 *     Kainos
 *     31  WIZ/DRU/MAG
 *
 * (`IW_Name`, `IW_Level`, `IW_Class` in `EQUI_InventoryWindow.xml`). A stats grab that drags over the whole
 * window has them in the crop, and then the planner need not be told: the Class picker and the level
 * are exactly what the read is measured against ([ADR 0369](../../../specs/decisions/0369-a-stale-stats-read-says-so.md)),
 * so reading them takes away the one step a player could get wrong.
 *
 * What makes this safe to take from OCR is the vocabulary: there are sixteen class codes and three letters
 * each, so a run like `WIZIDRUMAG` — the `/` read as an `I`, or dropped (`WIZDRUMAG`), both seen on real
 * screenshots — decodes only one way, or not at all. A decode that matches the codes **letter for letter**
 * is believed; one that needed a letter guessed is shown to the player and never applied
 * (`Identity.unsure`), the same rule `stats-page.ts` keeps for a number.
 *
 * Pure → a tested black box.
 */
import { CLASS_ABBREVIATIONS, CLASS_NAMES } from "../class-names";
import { levenshtein } from "../fuzzy";
import { rowsOf, typicalHeight, UNSURE_CONFIDENCE, type OcrRow, type OcrWord } from "../chrome/ocr-rows";
import { MAX_PLAYER_LEVEL } from "./item-levels";

/** What the corner of the window said, as far as it could be read. */
export interface Identity {
  /** The character's name, when a confident word sits right above the level. */
  name?: string;
  /** 1–`MAX_PLAYER_LEVEL`, when read with confidence (or by two preparations agreeing). */
  level?: number;
  /** Full class names (`"Wizard"`), in the order the window lists them. Empty when they could not be read exactly. */
  classes: string[];
  /** What the corner showed but could not be settled — so the notice can ask for it instead of staying quiet. */
  unsure: ("level" | "classes")[];
  /** The class run as the recogniser gave it, kept when `unsure` has `classes`, to say what was seen. */
  saw?: string;
}

/** A character has this many classes at most (EQL: three). */
export const MAX_CLASSES = 3;

/** Names at least this long can have a letter misread and still be told from another name. */
const MISREAD_ROOM = 5;

const CODES: ReadonlySet<string> = new Set(CLASS_ABBREVIATIONS);
const NAME_OF = new Map(CLASS_ABBREVIATIONS.map((code, i) => [code, CLASS_NAMES[i]]));

/**
 * What stands between two codes, or clutters one — a `/` read as `I`, `l`, `1`, `|`, `!`, or nothing at all.
 * No code *begins* with any of these, so skipping them where a code should start can't eat a letter of one.
 */
const DIVIDER = /[/|\\!1IL.,\-\s]/;

/** How far apart, in word heights, two pieces of one run may sit — the `/` between codes can be a wide gap to the recogniser. */
const RUN_GAP = 2;

/** Only these can be part of a class run; anything else ends it. */
const CLASSISH = /^[A-Za-z][A-Za-z/|\\!1.,-]*$/;

interface Decoded {
  classes: string[];
  /** Every code matched letter for letter. */
  exact: boolean;
}

/** The one code that differs from `chunk` in a single letter — or none, or more than one (then it is a guess between). */
function nearCode(chunk: string): string | undefined {
  const near = CLASS_ABBREVIATIONS.filter((code) => [...code].filter((letter, i) => letter !== chunk[i]).length === 1);
  return near.length === 1 ? near[0] : undefined;
}

/** A run of class codes read back from text: `WIZIDRUMAG` → Wizard, Druid, Magician. Undefined when it isn't that. */
export function decodeClasses(run: string): Decoded | undefined {
  const text = run.toUpperCase();
  const codes: string[] = [];
  let exact = true;
  for (let at = 0; at < text.length; ) {
    if (DIVIDER.test(text[at])) {
      at += 1;
      continue;
    }
    const chunk = text.slice(at, at + 3);
    const code = CODES.has(chunk) ? chunk : chunk.length === 3 ? nearCode(chunk) : undefined;
    if (!code) return undefined;
    if (code !== chunk) exact = false;
    codes.push(code);
    at += 3;
  }
  if (!codes.length || codes.length > MAX_CLASSES || new Set(codes).size !== codes.length) return undefined;
  return { classes: codes.map((code) => NAME_OF.get(code) as string), exact };
}

/** The level and the run when a recogniser fused them (`31WIZ/DRU/MAG`): split in two, the box shared out by letter. */
function unfused(word: OcrWord): OcrWord[] {
  const m = word.text.match(/^(\d{1,2})([A-Za-z/|\\!].*)$/);
  if (!m) return [word];
  const width = (word.x1 - word.x0) / word.text.length;
  const cut = word.x0 + width * m[1].length;
  return [
    { ...word, text: m[1], x1: cut },
    { ...word, text: m[2], x0: cut },
  ];
}

const isLevelWord = (word: OcrWord | undefined): word is OcrWord => !!word && /^\d{1,2}$/.test(word.text);

/** The run starting at `from`: words that could be codes, and close enough together to be one run. The longest that decodes. */
function runAt(words: readonly OcrWord[], from: number, unit: number): { decoded: Decoded; text: string; end: number } | undefined {
  let best: { decoded: Decoded; text: string; end: number } | undefined;
  let text = "";
  for (let i = from; i < words.length; i++) {
    const word = words[i];
    if (!CLASSISH.test(word.text) || (i > from && word.x0 - words[i - 1].x1 > unit * RUN_GAP)) break;
    text += word.text;
    const decoded = decodeClasses(text);
    if (decoded) best = { decoded, text, end: i };
  }
  return best;
}

interface Line {
  level: { value: number; confidence: number };
  run: string;
  decoded: Decoded;
  name?: string;
}

/** The name: a confident, letters-only word on the row above, standing over the level. */
function nameAbove(rows: readonly OcrRow[], at: number, x: number, unit: number): string | undefined {
  const above = rows[at - 1];
  if (!above || rows[at].y - above.y > unit * 3.5) return undefined;
  const word = above.words.find((w) => Math.abs(w.x0 - x) <= unit * 2 && /^[A-Za-z]{3,15}$/.test(w.text) && w.confidence >= UNSURE_CONFIDENCE);
  return word?.text;
}

/**
 * The class line of one pass: a number with a run of codes right after it. The number is required — three
 * letters that merely look like a code, alone somewhere on the page, are not a class — and the cost is
 * only that a level the recogniser dropped takes the classes with it, which the player can tick.
 */
function lineIn(pass: readonly OcrWord[]): Line | undefined {
  const unit = typicalHeight(pass);
  const rows = rowsOf(pass.flatMap(unfused));
  for (let r = 0; r < rows.length; r++) {
    const { words } = rows[r];
    for (let i = 0; i + 1 < words.length; i++) {
      const level = words[i];
      if (!isLevelWord(level) || words[i + 1].x0 - level.x1 > unit * 3) continue;
      const run = runAt(words, i + 1, unit);
      if (!run) continue;
      return {
        level: { value: Number(level.text), confidence: level.confidence },
        run: run.text,
        decoded: run.decoded,
        name: nameAbove(rows, r, level.x0, unit),
      };
    }
  }
  return undefined;
}

const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The corner of the window, from one or more passes of the same image. `undefined` when the crop doesn't
 * show it (a drag over the stats page alone) — which is not a failure, only less to go on.
 *
 * Classes are believed when a pass matched the codes exactly and no pass matched different ones. The level
 * when a confident read says so and nothing contradicts it, or when two passes agree on a doubtful one.
 */
export function readIdentity(passes: readonly (readonly OcrWord[])[]): Identity | undefined {
  const lines = passes.map(lineIn).filter((l): l is Line => !!l);
  if (!lines.length) return undefined;
  const unsure: Identity["unsure"] = [];

  const exact = lines.flatMap((l) => (l.decoded.exact ? [l.decoded.classes] : []));
  const classes = exact.length && exact.every((c) => sameList(c, exact[0])) ? exact[0] : [];
  if (!classes.length) unsure.push("classes");

  const levels = lines.map((l) => l.level);
  const values = new Set(levels.map((l) => l.value));
  const confident = levels.some((l) => l.confidence >= UNSURE_CONFIDENCE);
  const agreed = values.size === 1 && (confident || levels.length > 1);
  const level = agreed ? [...values][0] : undefined;
  const plausible = level !== undefined && level >= 1 && level <= MAX_PLAYER_LEVEL;
  if (!plausible) unsure.push("level");

  return {
    ...(lines.find((l) => l.name)?.name && { name: lines.find((l) => l.name)?.name }),
    ...(plausible && { level }),
    classes,
    unsure,
    ...(!classes.length && { saw: lines[0].run }),
  };
}

/** The same character, allowing the odd letter the recogniser got wrong — for telling your window from an alt's. */
export function sameCharacter(read: string, followed: string): boolean {
  const a = read.toLowerCase();
  const b = followed.toLowerCase();
  // A short name has no room for a misread: one wrong letter is a different name.
  return a === b || (Math.min(a.length, b.length) >= MISREAD_ROOM && levenshtein(a, b) <= 1);
}
