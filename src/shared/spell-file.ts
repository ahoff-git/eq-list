/**
 * spell-file.ts — reading the game's own `spells_us.txt`.
 *
 * The log says what you cast and what it did; it never says what it **cost**. Mana per cast,
 * cast and recast times, and which classes can even learn a spell are all in a file sitting in
 * the player's own install, next to the `maps/` folder we already read
 * ([ADR 0042](../../specs/decisions/0042-only-the-game-s-own-maps.md)). This turns one line of it
 * into facts; `electron/spells.ts` finds the file and looks names up.
 *
 * ## The format, and why these columns
 *
 * Caret-delimited, no header, one spell per line, with a trailing pipe-delimited "effects" blob.
 * The layout is **not** guessed: `SPELL_FORMAT.md` in
 * [Amerzel/eql-info](https://github.com/Amerzel/eql-info) derives it by statistically diffing
 * EQL's file against Live EverQuest's (publicly documented) and the older EQEmu 237-field
 * reference, and establishes that EQL's format *is* Live's with five columns appended. A second
 * project (`eql-log-reader`'s `eql_spell_db.py`) arrived at the same indices independently — the
 * two agree on every column read here, which is the only reason this is worth doing at all.
 *
 * **The stability rule, and it is the whole design.** EQL *inserts* columns by patch: one landed
 * at index 103 in mid-2026 and shifted everything after it. Columns **0–102 have never moved**.
 * Every index below is ≤ 51, deliberately — so a patch that appends or inserts later columns
 * cannot silently change what we read. Nothing here counts columns or validates a total width,
 * for the same reason: a row simply needs to be long enough for the fields we want.
 *
 * **What this deliberately does not do.** The effects blob carries damage/heal magnitudes behind
 * per-effect *formulas*, and applying those formulas is **server-side logic** — the reference
 * implementation everyone uses is EQEmu's classic-era one, which nobody can confirm EQL matches.
 * Both source projects label anything derived from it an estimate. We don't need it: the log
 * already tells us what a spell actually did, measured, on this server. Reading the blob would be
 * trading a fact for a guess, so this stops at the scalar columns — the things the log *can't*
 * see. Buff duration is left out on the same grounds (it's a formula, not a number).
 *
 * Pure: text in, facts out. No I/O, no clock.
 */

/** Class order of the 16 per-class level columns, as the file lays them out. */
export const SPELL_CLASSES = [
  "Warrior",
  "Cleric",
  "Paladin",
  "Ranger",
  "ShadowKnight",
  "Druid",
  "Monk",
  "Bard",
  "Rogue",
  "Shaman",
  "Necromancer",
  "Wizard",
  "Magician",
  "Enchanter",
  "Beastlord",
  "Berserker",
] as const;

/**
 * Column indices. All ≤ 51 on purpose — see the stability rule above. Named rather than inlined
 * so the one place they'd need changing is visible if EQL ever does move an early column.
 */
const IDX = {
  id: 0,
  name: 1,
  castMs: 8,
  recoveryMs: 9,
  recastMs: 10,
  mana: 14,
  /** 0 = detrimental, 1 = beneficial, 2 = beneficial (group only). */
  goodEffect: 28,
  /** First of 16 per-class minimum levels. */
  classes: 36,
} as const;

/** The highest index we read; a row shorter than this can't be a spell we understand. */
const MIN_FIELDS = IDX.classes + SPELL_CLASSES.length;

/** A class level of 255 means "cannot cast this"; 254 means available without a level gate. */
const CANNOT_CAST = 255;
const NO_LEVEL_GATE = 254;

/**
 * The server's level cap. The spell *file* ships levels through 125, inherited wholesale from
 * Live EverQuest, so a name matched without this gate can resolve to a spell no character on this
 * server can hold. eql-info hard-codes the same cap for the same reason.
 */
export const MAX_LEVEL = 50;

export interface SpellFacts {
  id: number;
  /** The spell's name exactly as the file spells it — including any rank. */
  name: string;
  /** Mana per cast. Zero is meaningful (bard songs, some abilities), not missing. */
  mana: number;
  /** Cast time in milliseconds, as the file states it. */
  castMs: number;
  /** The global-ish lockout after casting, milliseconds. */
  recoveryMs: number;
  /** This spell's own reuse timer, milliseconds. Zero for ordinary spells. */
  recastMs: number;
  /** Minimum level per class, only for classes that can cast it at all. */
  levels: Partial<Record<(typeof SPELL_CLASSES)[number], number>>;
  /** A buff/heal rather than something you throw at a mob. */
  beneficial: boolean;
}

/** A number the file states, or 0 — a blank or junk field must never become NaN downstream. */
function num(fields: string[], index: number): number {
  const n = Number(fields[index]);
  return Number.isFinite(n) ? n : 0;
}

/**
 * One line of `spells_us.txt` → facts, or null if the line isn't one (blank, comment, truncated).
 * Never throws: a malformed row in a 74k-line file must cost that row, not the file.
 */
export function parseSpellLine(line: string): SpellFacts | null {
  if (!line || line.startsWith("#")) return null;
  const fields = line.split("^");
  if (fields.length < MIN_FIELDS) return null;
  const name = fields[IDX.name]?.trim();
  const id = Number(fields[IDX.id]);
  if (!name || !Number.isFinite(id)) return null;

  const levels: SpellFacts["levels"] = {};
  SPELL_CLASSES.forEach((cls, i) => {
    const level = num(fields, IDX.classes + i);
    if (level === CANNOT_CAST || level <= 0) return;
    levels[cls] = level === NO_LEVEL_GATE ? 1 : level;
  });

  return {
    id,
    name,
    mana: num(fields, IDX.mana),
    castMs: num(fields, IDX.castMs),
    recoveryMs: num(fields, IDX.recoveryMs),
    recastMs: num(fields, IDX.recastMs),
    levels,
    beneficial: num(fields, IDX.goodEffect) > 0,
  };
}

/** Can any class on this server actually hold this spell? See `MAX_LEVEL`. */
export function isObtainable(spell: SpellFacts): boolean {
  return Object.values(spell.levels).some((level) => level <= MAX_LEVEL);
}

/**
 * Every spell in the file, keyed by lowercased name.
 *
 * **Names are not unique**, which is the one real decision here. The file holds NPC and
 * unreachable-tier versions of spells that share a player spell's name, and taking the wrong row
 * means quoting a mana cost no player ever pays. So a row a **player class can actually cast on
 * this server** always wins; among equals, the first seen wins, the way every other name in this
 * app is remembered. A name with no obtainable row at all is still kept — better a figure from
 * the file we can label than no figure — but it loses to an obtainable one the moment one appears.
 */
export function parseSpellFile(text: string): Map<string, SpellFacts> {
  const byName = new Map<string, SpellFacts>();
  const obtainable = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const spell = parseSpellLine(line);
    if (!spell) continue;
    const key = spell.name.toLowerCase();
    const canHold = isObtainable(spell);
    const have = byName.get(key);
    if (have && (obtainable.has(key) || !canHold)) continue;
    byName.set(key, spell);
    if (canHold) obtainable.add(key);
  }
  return byName;
}
