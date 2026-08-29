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
 * see. Buff duration is left out on the same grounds (it's a formula, not a number) — but the
 * formula's **id** is read, because one yes/no question of it needs no arithmetic and answers
 * something EQL players are bitten by daily: see `PERMANENT_FORMULAS`.
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
  /**
   * Which formula turns a level into a duration. A *number naming a rule*, not a number of
   * anything — see `PERMANENT_FORMULAS` for the one thing we read it for.
   */
  durationFormula: 11,
  /** The formula's cap or fixed figure, in ticks (6 seconds each). Meaningless without the formula. */
  durationTicks: 12,
  mana: 14,
  /** 0 = detrimental, 1 = beneficial, 2 = beneficial (group only). */
  goodEffect: 28,
  /** First of 16 per-class minimum levels. */
  classes: 36,
} as const;

/**
 * The duration formulas that mean **this buff does not expire**.
 *
 * ADR 0080 left duration alone on the grounds that it is "a formula, not a number", and that is still
 * the right call for *computing* one: applying the formula table is server-side logic, the only
 * reference implementations are EQEmu's classic-era ones, and the level a formula needs is a level
 * this log will not state (EQL levels are per class and the level line names none — see
 * [ideas.md](../../specs/ideas.md)). None of that applies to reading the formula *id* and asking one
 * yes/no question of it, which needs no arithmetic and no level at all.
 *
 * **And that question is worth asking, because EQL is not classic EQ.** A large set of classic short
 * self-buffs are `Duration: Permanent` here, so anything that treats them as timed is simply wrong —
 * the trap [todo.md](../../specs/todo.md) recorded from **eql-alerts**, which ships a hand-built list
 * of them (`samples/eql_permanent_buffs.json`) to strip their countdowns and silence their alerts.
 *
 * Checked against a live install, and the borrowed list is reproduced exactly: Yaulp, Yaulp II and
 * Yaulp III are formula 50 while **Yaulp IV is formula 8 with 4 ticks** — the precise split that list
 * calls out — and so are Divine Might, Divine Purpose, Lich, Elemental Armor, Greater Wolf Form, Grim
 * Aura, Deadeye, Firefist and Shielding. Every name on it, from the game's own file. So we don't
 * borrow the list; the player's install states it, which is
 * [ADR 0025](../../specs/decisions/0025-observation-over-the-wiki.md)'s argument on a source that is
 * this game rather than an older one.
 *
 * `51` joins it as the aura form of the same claim — up until you take it down or leave — for the one
 * reason that matters to a reader: neither will ever expire on a clock.
 */
export const PERMANENT_FORMULAS = new Set([50, 51]);

/**
 * The duration formula that means **there is no duration**: it happens, and it is over.
 *
 * The counterpart to `PERMANENT_FORMULAS` at the other end, and read with the same restraint — the
 * formula id, never the formula. Zero is not a rule that yields a small number; it is the file's way
 * of saying the spell has no lasting effect, and it holds a third of the obtainable beneficial
 * spells: every direct heal, every gate and port, cancel, bind, feign, shrink.
 */
export const INSTANT_FORMULA = 0;

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
  /**
   * **This effect does not run out.** Read from the duration formula rather than computed from it —
   * see `PERMANENT_FORMULAS` for why that one question is answerable when the duration itself isn't,
   * and why on this server it is the difference between a useful reminder and a lie.
   *
   * It does not mean the effect can't *end*: a permanent buff is still dispelled, still lost on
   * death, and still gone when you log out. It means nothing will ever end it on a clock.
   */
  permanent: boolean;
  /**
   * **This spell has no duration at all** — duration formula `0`, which in this file always comes
   * with `0` ticks (checked: not one obtainable beneficial spell has formula 0 and ticks above it).
   *
   * A direct heal, a gate, a bind, a cancel: something that *happens* and is then over. Read for the
   * same reason `permanent` is, and with the same restraint — the formula **id** answers a yes/no
   * question with no arithmetic and no caster level, which is the thing ADR 0080 said we could not
   * compute.
   *
   * It matters because a beneficial spell with a landing sentence looks exactly like a buff to
   * anything watching the log: `Light Healing` announces itself landing on a group-mate and then
   * never ends, so it goes "up" and stays up for ever
   * ([ADR 0157](../../specs/decisions/0157-an-instant-spell-is-not-a-buff.md)).
   */
  instant: boolean;
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
    permanent: PERMANENT_FORMULAS.has(num(fields, IDX.durationFormula)),
    instant: num(fields, IDX.durationFormula) === INSTANT_FORMULA,
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
  return parseSpellCatalog(text).byName;
}

/**
 * The same parse, indexed **both** ways.
 *
 * `byName` is what a log line needs: it says "Shock of Lightning VI" and never an id, and the
 * collision rule above is what makes that answerable. `byId` is what the *sibling* file needs —
 * `spells_us_str.txt` keys its sentences by spell index — and it is deliberately unfiltered: the
 * collision rule exists to pick one row per *name*, and applying it to ids would throw away rows
 * that have a sentence of their own to contribute. An id is unique; there is nothing to resolve.
 *
 * One pass for both, because the file is 38 MB and reading it twice to answer two questions about
 * the same rows would be the single most expensive thing this app does
 * ([ADR 0080](../../specs/decisions/0080-the-game-s-own-spell-file.md) measured 400 ms).
 */
export function parseSpellCatalog(text: string): {
  byName: Map<string, SpellFacts>;
  byId: Map<number, SpellFacts>;
} {
  const byName = new Map<string, SpellFacts>();
  const byId = new Map<number, SpellFacts>();
  const obtainable = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const spell = parseSpellLine(line);
    if (!spell) continue;
    byId.set(spell.id, spell);
    const key = spell.name.toLowerCase();
    const canHold = isObtainable(spell);
    const have = byName.get(key);
    if (have && (obtainable.has(key) || !canHold)) continue;
    byName.set(key, spell);
    if (canHold) obtainable.add(key);
  }
  return { byName, byId };
}
