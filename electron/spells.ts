/**
 * spells.ts — finding the player's `spells_us.txt` and answering questions about a spell.
 *
 * The parsing is a pure black box next door (`src/shared/spell-file.ts`); this is the I/O half:
 * where the file is, when to read it, and how a spell name from the *log* finds its row.
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
import { parseSpellFile, type SpellFacts } from "../src/shared/spell-file";

const log = createLogger("spells");

/** The file's name in the install, and the folders we'll look in relative to the log dir. */
const SPELL_FILE = "spells_us.txt";

export interface SpellCatalog {
  /** Point at the log folder being watched; forgets anything loaded for a previous one. */
  setLogDir(logDir: string): void;
  /**
   * Facts for a spell the log named. `rank` is the roman numeral the cast line carried, if any —
   * passing it is what gets the *ranked* row rather than the base spell's.
   */
  find(spell: string, rank?: string): SpellFacts | undefined;
  /** Is a spell file loaded and non-empty? What the UI asks before promising a mana column. */
  ready(): boolean;
  /** Where the file was found, for the debug log and Settings. */
  file(): string | undefined;
}

/** `<EverQuest>/spells_us.txt` for the log dir we're watching, or undefined. */
export function findSpellFile(logDir: string): string | undefined {
  if (!logDir) return undefined;
  // `logDir` is `<EQ>/Logs`, so the install is its parent — but accept being pointed straight at
  // the install too, for the same reason `findMapsDir` does: a moved Logs folder shouldn't be a
  // dead end.
  const candidates = [
    path.join(path.dirname(logDir), SPELL_FILE),
    path.join(logDir, SPELL_FILE),
  ];
  return candidates.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

export function createSpellCatalog(): SpellCatalog {
  let logDir = "";
  let file: string | undefined;
  /** Null until the first question; a Map (possibly empty) once we've tried. */
  let byName: Map<string, SpellFacts> | null = null;

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
      byName = parseSpellFile(fs.readFileSync(file, "utf8"));
      log.debug(`read ${byName.size} spells from ${file} in ${Date.now() - started}ms`);
    } catch (e) {
      // A missing or unreadable file is a normal state, not an error the player should see
      // ([ADR 0052](../specs/decisions/0052-an-error-goes-to-the-log-not-the-screen.md)).
      log.warn("could not read", file, (e as Error).message);
    }
    return byName;
  }

  return {
    setLogDir(next) {
      const dir = next?.trim() ?? "";
      if (dir === logDir) return;
      logDir = dir;
      byName = null; // a different install may have a different file
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
    ready: () => load().size > 0,
    file: () => {
      load();
      return file;
    },
  };
}
