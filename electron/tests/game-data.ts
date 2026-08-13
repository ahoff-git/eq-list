/**
 * game-data.ts — an opt-in handle on a **real** EverQuest Legends install, for tests.
 *
 * ## Why this exists
 *
 * Most of what this app reads is the player's own: their log (which carries their character's name,
 * and other people's chat), and their game install (tens of megabytes of Daybreak's data). None of
 * it can be committed — the log for privacy, the install because it isn't ours to redistribute —
 * so the shipped fixtures are small and, for `spells_us.txt`, **synthetic**: built to a documented
 * layout rather than copied from a file.
 *
 * That leaves a real gap. A synthetic fixture proves we read *the format we think exists*; it
 * cannot prove the format. The one time that gap was closed by hand, the live file turned out to
 * have **173 columns where the reference documented 171** — harmless, because nothing validates a
 * width, but exactly the kind of drift a synthetic fixture will never notice
 * ([ADR 0080](../../specs/decisions/0080-the-game-s-own-spell-file.md)).
 *
 * So: point this at an install and the `*.live.test.ts` files check our reading against the real
 * thing. Don't, and they skip. Nothing else changes, and nothing about your machine is committed.
 *
 * ## Pointing it at an install
 *
 * Either set the environment variable, once, however your shell does that:
 *
 *     EQL_GAME_DIR="…/Installed Games/EverQuest Legends"   npm test
 *
 * …or drop the path into `fixtures/local-game-dir.txt`, which is **gitignored**. One line, no
 * quoting, no format. The env var wins when both are present, so a one-off run can override the
 * file without editing it.
 *
 * ## The rule these tests follow
 *
 * **Assert game data, never your data.** A spell's name and mana cost are Daybreak's facts, the
 * same for every player, and safe to write down. Your install path, your character names and
 * anything out of your log are not — so nothing here puts the resolved path in a test name, an
 * assertion message, or console output. If a live test fails, it says *what* disagreed, not where
 * the file was.
 */
import fs from "node:fs";
import path from "node:path";

/** Where a machine-local path may be written instead of setting an env var. Gitignored. */
const LOCAL_POINTER = path.join(__dirname, "../../../fixtures/local-game-dir.txt");

/** The env var, named like the app's other opt-in switches (`EQL_DEBUG`). */
const ENV_VAR = "EQL_GAME_DIR";

/** What a caller shows when there's no install to test against — deliberately path-free. */
export const NO_GAME_DIR =
  `no game install configured — set ${ENV_VAR} or write a path into fixtures/local-game-dir.txt ` +
  `(see electron/tests/game-data.ts)`;

/** Trim, unquote and drop a comment line — the pointer file is hand-edited, so be forgiving. */
function readPointer(): string | undefined {
  try {
    const line = fs
      .readFileSync(LOCAL_POINTER, "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith("#"));
    return line?.replace(/^["']|["']$/g, "");
  } catch {
    return undefined;
  }
}

/**
 * The configured install, or undefined. Verified to be a directory that actually holds game data,
 * so a stale pointer reads as "not configured" rather than failing every live test with ENOENT.
 */
export function gameDir(): string | undefined {
  const configured = (process.env[ENV_VAR] || readPointer())?.trim();
  if (!configured) return undefined;
  try {
    if (!fs.statSync(configured).isDirectory()) return undefined;
  } catch {
    return undefined;
  }
  // An install is only useful here if it has the files we'd read; anything else is a wrong path.
  return fs.existsSync(path.join(configured, "spells_us.txt")) ? configured : undefined;
}

/**
 * `{ skip }` options for `node:test`, so a live test declares itself skipped rather than passing
 * vacuously. Spread it: `test("…", liveOnly(), () => { … })`.
 */
export function liveOnly(): { skip?: string } {
  return gameDir() ? {} : { skip: NO_GAME_DIR };
}

/** Absolute path to a file in the install. Only call inside a test that isn't skipped. */
export function gameFile(name: string): string {
  const dir = gameDir();
  if (!dir) throw new Error(NO_GAME_DIR);
  return path.join(dir, name);
}
