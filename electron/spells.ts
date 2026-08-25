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
 * `spellRank()` keeps it. The file lists each rank as its own spell with its own cost, so the
 * ranked name is the exact answer and the base name is the fallback — ask for both, prefer the
 * former. That's what makes a per-rank mana figure real rather than an estimate scaled by a
 * rule of thumb.
 *
 * **When it isn't there.** Every answer is `undefined` and nothing else changes — the same way a
 * missing map pack leaves the map blank rather than breaking the window. A player on a custom
 * install, or one who moved their logs, simply doesn't get mana figures.
 */
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { parseSpellCatalog, type SpellFacts } from "../src/shared/spell-file";
import {
  buildBuffLexicon,
  parseSpellStringFile,
  NO_LEXICON,
  type BuffLexicon,
} from "../src/shared/spell-strings";

const log = createLogger("spells");

/** The files' names in the install, and the folders we'll look in relative to the log dir. */
const SPELL_FILE = "spells_us.txt";
/**
 * Its sibling: the same spells' *sentences*. A separate file rather than more columns, which is
 * convenient — it means the sentence index can be built (and paid for) only when something asks
 * about a fade, without touching the mana path at all.
 */
const STRING_FILE = "spells_us_str.txt";

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
  /** Is a spell file loaded and non-empty? What the UI asks before promising a mana column. */
  ready(): boolean;
  /** Where the file was found, for the debug log and Settings. */
  file(): string | undefined;
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

  return {
    setLogDir(next) {
      const dir = next?.trim() ?? "";
      if (dir === logDir) return;
      logDir = dir;
      byName = null; // a different install may have a different file
      byId = null;
      buffLexicon = null;
      file = undefined;
    },
    find(spell, rank) {
      const spells = load();
      if (!spells.size || !spell) return undefined;
      const base = spell.trim().toLowerCase();
      // The ranked row is the exact answer; the base name is what a damage line gives us.
      if (rank) {
        const ranked = spells.get(`${base} ${rank.trim().toLowerCase()}`);
        if (ranked) return ranked;
      }
      return spells.get(base);
    },
    lexicon: () => loadLexicon(),
    ready: () => load().size > 0,
    file: () => {
      load();
      return file;
    },
  };
}
