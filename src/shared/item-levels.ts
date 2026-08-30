/**
 * item-levels.ts — *what level do I need to be to get this?*
 *
 * The Items tab can say what a thing **is** ([item-stats](./item-stats.ts)) and what it is worth to
 * you ([item-search](./item-search.ts)), and neither answers the question that actually decides
 * whether a row is any use: a Cloak of Wisdom off a level 45 named is not a level 12 character's
 * cloak, however well it scores.
 *
 * The wiki never states an item's level, so this **derives** one — and because the evidence varies
 * enormously in quality, every answer carries `from` and a sentence saying where it came from. The
 * order is best-evidence-first, which is the same shape [drop-truth](./drop-truth.ts) uses:
 *
 *  0. **The card's own `Required Level`.** Rare — 19 of 11,155 cards state one — and when it does,
 *     it settles the question outright: an item off a level-5 gnoll that says `Required level of 46`
 *     is a level-46 item, because the gate is *wearing* it rather than getting it.
 *  1. **The mob that drops it.** The precise answer, and the one a player means. Where several mobs
 *     drop it, the **lowest** wins: the question is "can I get this yet", and the easiest source is
 *     the one that answers it.
 *  2. **The quest that gives it.** `Minimum Level: 8` is the wiki stating a requirement outright.
 *  3. **The zone it comes from.** Always available — the zone level tables ship with the app
 *     ([ADR 0122](../../specs/decisions/0122-a-zone-wears-its-levels.md)) — and correspondingly
 *     vague: "somewhere in Butcherblock" is a range, not a level. It is the floor of the hierarchy
 *     rather than a real answer, and it says so.
 *
 * **A missing level is missing, not zero.** An item nothing can place stays `undefined`, exactly as a
 * silent stat card does, so a level filter cuts it rather than pretending it is level 1.
 *
 * Pure and DOM-free: it is handed the cards it needs and returns a number and a reason.
 */
import { zoneLevels, zoneLevelText } from "./zones/levels";
import type { ItemSource } from "./types";

/** A level, and how much to believe it. */
export interface ItemLevel {
  /** The lowest level that can get it, as the best evidence sees it. */
  min: number;
  /** The top of the range, equal to `min` when the source states one level. */
  max: number;
  /** Which rung of the hierarchy answered — the difference between a fact and an estimate. */
  from: "required" | "mob" | "quest" | "zone";
  /** One sentence naming the evidence, for a hover. */
  why: string;
}

/** Levels beyond this are the wiki's typos, not content — the game's cap is 60 in this era. */
const MAX_SANE_LEVEL = 125;

const sane = (n: number): boolean => Number.isFinite(n) && n > 0 && n <= MAX_SANE_LEVEL;

/**
 * A range out of a wiki level string.
 *
 * One grammar for all three sources, because they all write ranges the same way and differ only in
 * their label: `35`, `21 - 23`, `1-20, 35`, `37+`, `4–15+`. The `+` is deliberately *not* treated as
 * an open top — `37+` means "37 or above", so 37 is the number that matters and the top stays 37.
 */
export function parseLevelRange(text: string | undefined): { min: number; max: number } | undefined {
  if (!text) return undefined;
  const numbers = [...text.matchAll(/\d+/g)].map((m) => Number(m[0])).filter(sane);
  if (!numbers.length) return undefined;
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

/**
 * The key a mob is looked up by, folding the two ways the wiki writes the same creature.
 *
 * A zone page's roster is written for a reader — `A Burly Gnoll`, and `A Giant Snake (Blackburrow)`
 * where the name alone would be ambiguous across zones. An item's drop row is written as the game
 * writes it — `a burly gnoll`. Both are the same mob, and without folding the case and dropping that
 * disambiguating tail the level would simply never be found.
 *
 * Only a **trailing** parenthetical goes, and only when something precedes it: a mob genuinely called
 * `(Something)` keeps its name, for the same reason `withoutZoneSuffix` only ever drops a tail.
 */
export function npcKey(name: string): string {
  const fold = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const whole = fold(name);
  const trimmed = fold(name.replace(/\s*\([^()]*\)\s*$/, ""));
  // A name that is *nothing but* a parenthetical keeps it. Stripping would leave an empty key, and an
  // empty key matches every other empty key — which is how one mob's level ends up on another's item.
  return trimmed || whole;
}

/** The value of a `Label: …` line on a card, whichever of the labels it uses. */
function cardValue(lines: readonly string[] | undefined, labels: readonly string[]): string | undefined {
  for (const line of lines ?? []) {
    for (const label of labels) {
      const m = new RegExp(`^\\s*${label}\\s*:\\s*(.+)$`, "i").exec(line);
      if (m?.[1]?.trim()) return m[1].trim();
    }
  }
  return undefined;
}

/**
 * A mob's level off its stat card — `Level: 35`, or `Level: 21 - 23` for one that varies.
 *
 * A card whose `Level:` is present but empty is common on this wiki (the row exists, nobody filled
 * it in) and reads as *unknown*, not as zero.
 */
export function mobCardLevel(lines: readonly string[] | undefined): { min: number; max: number } | undefined {
  return parseLevelRange(cardValue(lines, ["Level"]));
}

/**
 * A quest's level requirement.
 *
 * Two labels, because the wiki uses both and means slightly different things by them —
 * `Minimum Level` is a gate and `Recommended Level` is advice. Minimum wins where a page carries
 * both, since it is the one that stops you handing the quest in.
 */
export function questCardLevel(lines: readonly string[] | undefined): { min: number; max: number } | undefined {
  return parseLevelRange(cardValue(lines, ["Minimum Level", "Required Level", "Recommended Level"]));
}

/** What the caller can look up for us. Anything it cannot answer simply drops a rung. */
export interface LevelSources {
  /** A mob's level range, by the name an item's source names it. */
  mob(name: string): { min: number; max: number } | undefined;
  /** A quest's stated requirement, by name. */
  quest(name: string): { min: number; max: number } | undefined;
}

/**
 * The level an item sits at, from the best evidence available.
 *
 * `sources` is the item's own `ItemSource[]`, so this reads the same rows the panel shows — a level
 * derived from something not on screen would be a number nobody could check.
 */
export function itemLevel(
  sources: readonly ItemSource[],
  lookup: LevelSources,
  /** The card's own stated requirement, when it has one — `ItemStats.requiredLevel`. */
  requiredLevel?: number,
): ItemLevel | undefined {
  // 0. The card said so. Nothing derived can outrank the wiki stating it outright.
  if (requiredLevel !== undefined && requiredLevel > 0) {
    return {
      min: requiredLevel,
      max: requiredLevel,
      from: "required",
      why: `the card says you must be level ${requiredLevel}`,
    };
  }

  // 1. The mob, and the *lowest* of them: "can I get this yet" is answered by the easiest way in.
  let best: { min: number; max: number; who: string } | undefined;
  for (const source of sources) {
    if (source.kind !== "drop" || !source.where) continue;
    const found = lookup.mob(source.where);
    if (found && (!best || found.min < best.min)) best = { ...found, who: source.where };
  }
  if (best) {
    return {
      min: best.min,
      max: best.max,
      from: "mob",
      why: `${best.who} is level ${levelText(best)}`,
    };
  }

  // 2. The quest, which states a requirement rather than implying one.
  for (const source of sources) {
    if (source.kind !== "quest" || !source.where) continue;
    const found = lookup.quest(source.where);
    if (found) {
      return { min: found.min, max: found.max, from: "quest", why: `${source.where} wants level ${levelText(found)}` };
    }
  }

  // 3. The zone — always there, and correspondingly vague. Lowest again, for the same reason.
  let zone: { min: number; max: number; where: string; text: string } | undefined;
  for (const source of sources) {
    const named = source.detail?.trim();
    if (!named) continue;
    const found = zoneLevels(named);
    const range = found && parseLevelRange(found.levels);
    if (found && range && (!zone || range.min < zone.min)) {
      zone = { ...range, where: found.zone, text: zoneLevelText(found) };
    }
  }
  if (zone) return { min: zone.min, max: zone.max, from: "zone", why: `${zone.where} is level ${zone.text}` };

  // Nothing could place it. Absent rather than zero — see the module note.
  return undefined;
}

/** `35`, or `21–23` for a range. An en dash, so it reads as a span rather than a subtraction. */
export function levelText(level: { min: number; max: number }): string {
  return level.min === level.max ? `${level.min}` : `${level.min}–${level.max}`;
}

/**
 * How much to trust it, in one word, for a column that mixes all three.
 *
 * A mob's level is a fact about the thing you have to kill; a zone's range is a guess dressed as
 * one, and a row that showed them identically would be inviting a level-12 character to go and try.
 */
export const LEVEL_CONFIDENCE: Record<ItemLevel["from"], string> = {
  required: "stated on the item itself",
  mob: "from the mob that drops it",
  quest: "the quest's stated requirement",
  zone: "only its zone's range — no page for the mob yet",
};
