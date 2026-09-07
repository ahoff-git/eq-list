/**
 * spell-stats.ts — a spell's wiki card, read as numbers instead of as lines of text.
 *
 * The counterpart to `item-stats.ts`, for spells instead of items: `parseSpellCard`
 * (`electron/wiki/parse.ts`) already turns a spell's page into an `ItemCard`, and this is the one
 * place that turns those lines into facts a table can sort by.
 *
 * **Mana, cast time, recast time and range are read straight off a labelled line** — the wiki
 * states each as `"Label: value"` (see the `spell-burst-of-fire` fixture), so this is a lookup, not
 * a guess. **Damage is not** — the game's own spell file could answer it exactly, but ADR 0080
 * refused to compute damage from that file's effect-formula blob, on the grounds that no reference
 * implementation is confirmed to match this server. This module answers a different, narrower
 * question at a different, lower bar: not "what does this spell do", but "which of these spells hits
 * harder", for a browsable catalogue rather than the tracker. The wiki's own numbers are read as
 * best-effort text, explicitly approximate, per
 * [ADR 0195](../../specs/decisions/0195-a-spell-catalog-trusts-the-wikis-own-numbers.md).
 *
 * Pure and DOM-free — handed lines, returns numbers, which is what makes it testable against real
 * cards the same way `item-stats.ts` is.
 */

/** A spell's numbers, read from its card. Absent means the card never said, not that it's zero. */
export interface SpellStats {
  mana?: number;
  castSec?: number;
  recastSec?: number;
  range?: number;
  /** Best-effort, from the wiki's own text — see the module note on why this is approximate. */
  damage?: number;
  /** Minimum level per class that can cast it, keyed as the wiki spells the class ("Ranger"). */
  levels: Partial<Record<string, number>>;
  /** A buff/heal rather than something you throw at a mob. */
  beneficial?: boolean;
  /** No duration at all — a direct heal, a gate, a bind: something that happens and is over. */
  instant?: boolean;
}

/** No card, or nothing on it we could read. */
export const NO_SPELL_STATS: SpellStats = { levels: {} };

/** The first line starting `label:`, its value parsed as a number — or undefined if there is none. */
function labelNumber(lines: readonly string[], label: string): number | undefined {
  const prefix = `${label.toLowerCase()}:`;
  const line = lines.find((l) => l.toLowerCase().startsWith(prefix));
  if (!line) return undefined;
  const value = Number.parseFloat(line.slice(line.indexOf(":") + 1));
  return Number.isFinite(value) ? value : undefined;
}

/** The first line starting `label:`, its value as text — or undefined if there is none. */
function labelText(lines: readonly string[], label: string): string | undefined {
  const prefix = `${label.toLowerCase()}:`;
  const line = lines.find((l) => l.toLowerCase().startsWith(prefix));
  return line ? line.slice(line.indexOf(":") + 1).trim() : undefined;
}

/** `"Druid - Level 3, Ranger - Level 14"` → `{ Druid: 3, Ranger: 14 }`. */
function parseLevels(text: string | undefined): Partial<Record<string, number>> {
  if (!text) return {};
  const levels: Partial<Record<string, number>> = {};
  for (const entry of text.split(",")) {
    const m = /^\s*(.+?)\s*-\s*Level\s*(\d+)/i.exec(entry);
    if (m) levels[m[1]] = Number(m[2]);
  }
  return levels;
}

/**
 * The wiki's own `"Decrease Hitpoints by 11 (L3) to 14 (L8)"` slot-effect line — rendered the same
 * way for every damage spell, which is what makes it a better source than hand-written prose. Takes
 * the higher (max-rank) figure when the effect scales with level.
 */
const SLOT_DAMAGE = /Decrease Hitpoints by (\d+)(?:\s*\(L\d+\))?(?:\s+to\s+(\d+)\s*\(L\d+\))?/i;

/**
 * The prose fallback, for a card whose slot line doesn't match — e.g. "burns your target, doing 14
 * damage". Only tried when nothing structured answered.
 */
const PROSE_DAMAGE = /\b(?:causing|doing|dealing)\s+(\d+(?:\.\d+)?)\s+damage\b/i;

function parseDamage(lines: readonly string[]): number | undefined {
  for (const line of lines) {
    const m = SLOT_DAMAGE.exec(line);
    if (m) return Number(m[2] ?? m[1]);
  }
  for (const line of lines) {
    const m = PROSE_DAMAGE.exec(line);
    if (m) return Number(m[1]);
  }
  return undefined;
}

/** One spell card's lines, read as numbers. `NO_SPELL_STATS` for a spell with no card at all. */
export function parseSpellStats(lines: readonly string[] | undefined): SpellStats {
  if (!lines?.length) return NO_SPELL_STATS;

  const spellType = labelText(lines, "Spell Type");
  const duration = labelText(lines, "Duration");

  return {
    mana: labelNumber(lines, "Mana"),
    castSec: labelNumber(lines, "Casting Time"),
    recastSec: labelNumber(lines, "Recast Time"),
    range: labelNumber(lines, "Range"),
    damage: parseDamage(lines),
    levels: parseLevels(labelText(lines, "Classes")),
    beneficial: spellType ? /beneficial/i.test(spellType) : undefined,
    instant: duration ? /instant/i.test(duration) : undefined,
  };
}
