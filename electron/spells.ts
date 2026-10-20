/**
 * spells.ts — finding the player's spell files and answering questions about a spell.
 *
 * The parsing is two pure black boxes next door — `src/shared/spell-file.ts` for the facts and
 * `src/shared/spell-strings.ts` for the sentences — and this is the I/O half for both: where the
 * files are, when to read them, and how a spell name (or a whole sentence) from the *log* finds its
 * row.
 *
 * **Two files, two lazinesses.** `spells_us.txt` answers "what did that cost"; `spells_us_str.txt`
 * answers "which spell was that sentence about", which is what makes a nameless fade attributable
 * (see the string module's header). They are loaded independently, because a session that watches
 * buffs and never opens the damage meter should not read 38 MB, and one that does the reverse should
 * not read 5 MB. The sentence index does need the facts file, though — the join to it is the gate
 * that keeps out-of-era spells from claiming a player's own sentence.
 *
 * **Where.** Beside `maps/`, in the game install — which we already locate as the parent of the
 * folder we tail, exactly the way `eq-maps.ts` does. Same install, same assumption, one more file.
 *
 * **When.** Lazily, once, on the first question asked. It's ~74k lines and perhaps 30 MB, and the
 * overwhelming majority of sessions never ask — so paying for it at startup would be paying for it
 * mostly for nothing, and [todo](../specs/todo.md)'s "a replayed gap is read and parsed in one
 * tick" is already the app's startup budget problem. Reloaded when the log folder changes, since
 * that's the only signal that the install under us might have.
 *
 * **How a name matches.** The log writes a spell's **rank** in the cast line ("Shock of Lightning
 * VI") and the base name everywhere it does something, which is why `spellName()` strips it and
 * `spellRank()` keeps it. For a spell, that numeral is its **upgrade level** (0–10), which the
 * server applies at runtime: the file has no `Shock of Lightning VI` row, so the base row is levelled
 * by `spell-upgrade.ts` (ADR 0312). A ranked row is still the answer where it is the real thing — an
 * AA's ranks (`Harm Touch III`) are rows of their own — but not where it is an unrelated row that
 * happens to share the name (`Guard VI`, a free NPC spell, against the 80-mana Guard you cast).
 *
 * **When it isn't there.** Every answer is `undefined` and nothing else changes — the same way a
 * missing map pack leaves the map blank rather than breaking the window. A player on a custom
 * install, or one who moved their logs, simply doesn't get mana figures.
 */
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { parseSpellCatalog, type SpellFacts } from "../src/shared/spells/spell-file";
import { parseSpellCategoryNames, spellCategory, type SpellCategory } from "../src/shared/spells/spell-categories";
import { levelledFacts, rankLevel, spellLevelRule } from "../src/shared/spells/spell-upgrade";
import {
  buildBuffLexicon,
  parseSpellStringFile,
  NO_LEXICON,
  type BuffLexicon,
} from "../src/shared/spells/spell-strings";

const log = createLogger("spells");

/** The files' names in the install, and the folders we'll look in relative to the log dir. */
const SPELL_FILE = "spells_us.txt";
/**
 * Its sibling: the same spells' *sentences*. A separate file rather than more columns, which is
 * convenient — it means the sentence index can be built (and paid for) only when something asks
 * about a fade, without touching the mana path at all.
 */
const STRING_FILE = "spells_us_str.txt";
/**
 * The client's string table, for the one slice of it a spell needs: its category names
 * (`spell-categories.ts`). Read only when something asks what *kind* of spell this is.
 */
const DBSTR_FILE = "dbstr_us.txt";

export interface SpellCatalog {
  /** Point at the log folder being watched; forgets anything loaded for a previous one. */
  setLogDir(logDir: string): void;
  /**
   * Facts for a spell the log named. `rank` is the roman numeral the cast line carried, if any —
   * passing it is what gets the *ranked* row rather than the base spell's.
   */
  find(spell: string, rank?: string): SpellFacts | undefined;
  /**
   * The sentences a buff writes on your screen, read back to the spells that write them
   * (`spells_us_str.txt`). `NO_LEXICON` when that file isn't there, so a caller has one shape to
   * handle rather than a null check per question.
   */
  lexicon(): BuffLexicon;
  /**
   * Where the game's spellbook files a spell — `Utility Detrimental › Charm`. Undefined when the
   * spell, the file, or `dbstr_us.txt` isn't there.
   */
  category(spell: string): SpellCategory | undefined;
  /** Is a spell file loaded and non-empty? What the UI asks before promising a mana column. */
  ready(): boolean;
  /** Where the file was found, for the debug log and Settings. */
  file(): string | undefined;
}

/**
 * A spell name with the differences between the wiki's spelling and the file's folded away. The
 * file writes *some* apostrophes as backticks (Wrath of Al`Kabor, but Al`Kabor's Aura), so no
 * one-way swap gets there; folding both sides does. And the wiki tags a page that shares its name
 * with an item `(Spell)`. Only for matching a wiki title — the log already writes the file's
 * spelling, so `find` itself needs none of this.
 */
function foldSpellName(name: string): string {
  return name.trim().toLowerCase().replace(/\s*\(spell\)$/, "").replace(/[`’]/g, "'");
}

/** `<EverQuest>/<name>` for the log dir we're watching, or undefined. */
function findGameFile(logDir: string, name: string): string | undefined {
  if (!logDir) return undefined;
  // `logDir` is `<EQ>/Logs`, so the install is its parent — but accept being pointed straight at
  // the install too, for the same reason `findMapsDir` does: a moved Logs folder shouldn't be a
  // dead end.
  const candidates = [path.join(path.dirname(logDir), name), path.join(logDir, name)];
  return candidates.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

/** `<EverQuest>/spells_us.txt` for the log dir we're watching, or undefined. */
export function findSpellFile(logDir: string): string | undefined {
  return findGameFile(logDir, SPELL_FILE);
}

/** Its sibling, `spells_us_str.txt` — the sentences, keyed by the same spell ids. */
export function findSpellStringFile(logDir: string): string | undefined {
  return findGameFile(logDir, STRING_FILE);
}

export function createSpellCatalog(): SpellCatalog {
  let logDir = "";
  let file: string | undefined;
  /** Null until the first question; a Map (possibly empty) once we've tried. */
  let byName: Map<string, SpellFacts> | null = null;
  /** Kept from the same parse, for the string file to join against. Discarded once it has. */
  let byId: Map<number, SpellFacts> | null = null;
  /**
   * Null until the first question about a *sentence*, which is a separate laziness from the one
   * above. Most sessions ask about mana and never about a fade, and this is a second file to read.
   */
  let buffLexicon: BuffLexicon | null = null;
  /** Null until the first question about a category — a third file, so a third laziness. */
  let categoryNames: Map<number, string> | null = null;
  /** `byName` re-keyed by `foldSpellName`, built only when a wiki title misses as written. */
  let byFold: Map<string, SpellFacts> | null = null;

  function load(): Map<string, SpellFacts> {
    if (byName) return byName;
    byName = new Map();
    file = findSpellFile(logDir);
    if (!file) {
      log.debug("no spells_us.txt beside", logDir || "(no log dir)");
      return byName;
    }
    try {
      const started = Date.now();
      const catalog = parseSpellCatalog(fs.readFileSync(file, "utf8"));
      byName = catalog.byName;
      byId = catalog.byId;
      log.debug(`read ${byName.size} spells from ${file} in ${Date.now() - started}ms`);
    } catch (e) {
      // A missing or unreadable file is a normal state, not an error the player should see
      // ([ADR 0052](../specs/decisions/0052-an-error-goes-to-the-log-not-the-screen.md)).
      log.warn("could not read", file, (e as Error).message);
    }
    return byName;
  }

  /**
   * The sentence index, built on first ask.
   *
   * It needs `spells_us.txt` loaded first — the join is what gates the index down to spells a
   * character here can hold, which is the whole reason it is ~5k entries rather than ~28k. Without
   * that file there is nothing to gate against, so we deliberately build **nothing** rather than an
   * ungated index: an ungated one would hand a player's own sentence to an out-of-era spell of the
   * same name, which is the collision `parseSpellCatalog` exists to avoid.
   */
  function loadLexicon(): BuffLexicon {
    if (buffLexicon) return buffLexicon;
    buffLexicon = NO_LEXICON;
    load();
    if (!byId?.size) return buffLexicon;
    const strFile = findSpellStringFile(logDir);
    if (!strFile) {
      log.debug("no spells_us_str.txt beside", logDir || "(no log dir)");
      return buffLexicon;
    }
    try {
      const started = Date.now();
      const strings = parseSpellStringFile(fs.readFileSync(strFile, "utf8"));
      buffLexicon = buildBuffLexicon(strings, byId);
      log.debug(
        `read ${strings.size} spell strings from ${strFile} in ${Date.now() - started}ms;` +
          ` ${buffLexicon.size} obtainable buffs indexed`,
      );
    } catch (e) {
      log.warn("could not read", strFile, (e as Error).message);
    }
    return buffLexicon;
  }

  function loadCategoryNames(): Map<number, string> {
    if (categoryNames) return categoryNames;
    categoryNames = new Map();
    const dbstr = findGameFile(logDir, DBSTR_FILE);
    if (!dbstr) {
      log.debug("no", DBSTR_FILE, "beside", logDir || "(no log dir)");
      return categoryNames;
    }
    try {
      categoryNames = parseSpellCategoryNames(fs.readFileSync(dbstr, "utf8"));
      log.debug(`read ${categoryNames.size} spell category names from ${dbstr}`);
    } catch (e) {
      log.warn("could not read", dbstr, (e as Error).message);
    }
    return categoryNames;
  }

  /** A wiki title's row when it isn't spelled the file's way — see `foldSpellName`. */
  function findFolded(title: string): SpellFacts | undefined {
    if (!byFold) {
      byFold = new Map();
      // `byName` has already resolved shared names to the row a player can hold; first fold wins.
      for (const facts of load().values()) {
        const key = foldSpellName(facts.name);
        if (!byFold.has(key)) byFold.set(key, facts);
      }
    }
    return byFold.get(foldSpellName(title));
  }

  /** The spell's own row at an upgrade level — the file's base row with the level's rule applied. */
  function levelled(row: SpellFacts, rank: string): SpellFacts {
    return levelledFacts(row, spellLevelRule(spellCategory(row, loadCategoryNames())), rankLevel(rank));
  }

  function find(spell: string, rank?: string): SpellFacts | undefined {
    const spells = load();
    if (!spells.size || !spell) return undefined;
    const base = spell.trim().toLowerCase();
    const baseRow = spells.get(base);
    if (!rank) return baseRow;
    const ranked = spells.get(`${base} ${rank.trim().toLowerCase()}`);
    if (ranked && rankedRowIsTheSpell(baseRow, ranked)) return ranked;
    return baseRow ? levelled(baseRow, rank) : ranked;
  }

  return {
    setLogDir(next) {
      const dir = next?.trim() ?? "";
      if (dir === logDir) return;
      logDir = dir;
      byName = null; // a different install may have a different file
      byId = null;
      buffLexicon = null;
      categoryNames = null;
      byFold = null;
      file = undefined;
    },
    find,
    lexicon: () => loadLexicon(),
    category(spell) {
      const facts = find(spell) ?? findFolded(spell);
      return facts ? spellCategory(facts, loadCategoryNames()) : undefined;
    },
    ready: () => load().size > 0,
    file: () => {
      load();
      return file;
    },
  };
}

/**
 * Is `Name II` in the file really this spell at rank II? Only when the base isn't a spell a player
 * casts (an AA, whose ranks are rows of their own), or when the ranked row is one too, filed in the
 * same spellbook category — a classic sequel like `Burnout II`. Otherwise it is a stranger sharing
 * the name: 56 castable families collide this way, `Guard VI` and `Savage Spirit III` among them.
 */
export function rankedRowIsTheSpell(baseRow: SpellFacts | undefined, ranked: SpellFacts): boolean {
  const castable = (row: SpellFacts) => Object.keys(row.levels).length > 0;
  if (!baseRow || !castable(baseRow)) return true;
  return castable(ranked) && ranked.categoryId === baseRow.categoryId;
}
