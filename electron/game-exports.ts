/**
 * game-exports.ts (main) — this character's `/outputfile` dumps: when each was last written, and
 * the newest one's text on request.
 *
 * The game writes them to its install folder, which is the parent of the `Logs` folder holding the
 * log we follow — the same `dirname` `eq-maps.ts` takes to find the map pack. Parsing is the
 * renderer's (`src/shared/game-export-dumps.ts`): a dump is tens of KB, so the text crosses whole.
 */
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import {
  exportCommandFor,
  exportFilePrefix,
  exportFileType,
  exportTypeMatches,
  type GameExportTimes,
} from "../src/shared/game-exports";
import type { GameExportDump } from "../src/shared/types";
import { inventoryTotals, parseInventoryDump } from "../src/shared/game-export-dumps";
import type { InventoryShareRow } from "../src/shared/peers/peer-share";

const log = createLogger("game-exports");

interface DumpFile {
  file: string;
  type: string;
  writtenAt: number;
}

/** Every dump file beside the log's folder that belongs to the log's character. */
function dumpFiles(logFile?: string): DumpFile[] {
  const prefix = exportFilePrefix(logFile);
  if (!logFile || !prefix) return [];
  const dir = path.dirname(path.dirname(logFile));
  try {
    return fs.readdirSync(dir).flatMap((name) => {
      const type = exportFileType(name, prefix);
      if (!type) return [];
      const file = path.join(dir, name);
      // One file vanishing between the listing and the stat (the game rewriting it) skips that file
      // alone — not every dump, which the folder-wide catch below would otherwise do.
      try {
        return [{ file, type, writtenAt: fs.statSync(file).mtimeMs }];
      } catch {
        return [];
      }
    });
  } catch (err) {
    // A missing or unreadable install folder reads as "never exported", which is what the tab says
    // anyway — not worth more than a debug line.
    log.debug("couldn't read the game folder", { dir, err: String(err) });
    return [];
  }
}

/** Each dump type's newest write time for the character `logFile` belongs to; empty when unknown. */
export function readExportTimes(logFile?: string): GameExportTimes {
  const times: GameExportTimes = {};
  for (const { type, writtenAt } of dumpFiles(logFile)) times[type] = Math.max(times[type] ?? 0, writtenAt);
  return times;
}

/**
 * The newest dump for one command (`fileType` as `GAME_EXPORT_COMMANDS` names it), or null. An
 * unknown `fileType` is refused rather than matched loosely — it comes from a renderer.
 */
export function readExport(logFile: string | undefined, fileType: unknown): GameExportDump | null {
  const cmd = typeof fileType === "string" ? exportCommandFor(fileType) : undefined;
  if (!cmd) return null;
  const newest = dumpFiles(logFile)
    .filter((d) => exportTypeMatches(cmd, d.type))
    .sort((a, b) => b.writtenAt - a.writtenAt)[0];
  if (!newest) return null;
  try {
    return { fileName: path.basename(newest.file), writtenAt: newest.writtenAt, text: fs.readFileSync(newest.file, "utf8") };
  } catch (err) {
    log.debug("couldn't read a dump", { file: newest.file, err: String(err) });
    return null;
  }
}

/**
 * Call `onChange` when the newest dump for `fileType` is rewritten — the game gives no other
 * signal, so the folder is checked every `ms`. The first look only records where things stand.
 * Returns a stop function.
 */
export function watchExport(
  getLogFile: () => string | undefined,
  fileType: string,
  onChange: () => void,
  ms = 30_000,
): () => void {
  const cmd = exportCommandFor(fileType);
  const newest = (logFile?: string) => {
    const times = readExportTimes(logFile);
    return Math.max(0, ...Object.entries(times).filter(([type]) => cmd && exportTypeMatches(cmd, type)).map(([, at]) => at));
  };
  let followed = getLogFile();
  let seen = newest(followed);
  const timer = setInterval(() => {
    const logFile = getLogFile();
    const now = newest(logFile);
    // A different log is a different character (or the first one found at startup): their dump is
    // where things stand, not news.
    const quiet = logFile !== followed;
    followed = logFile;
    if (now === seen) return;
    seen = now;
    if (quiet) return;
    log.debug("dump changed", { fileType });
    onChange();
  }, ms);
  timer.unref?.(); // a timer must never be the reason the process stays up
  return () => clearInterval(timer);
}

/**
 * The followed character's inventory as peers see it, when sharing is on: one row per item, totals
 * and places, dated by the dump. Empty when there's no dump.
 */
export function inventoryShareRows(logFile: string | undefined): InventoryShareRow[] {
  const dump = readExport(logFile, "inventory");
  if (!dump) return [];
  const asOf = new Date(dump.writtenAt).toISOString();
  return inventoryTotals(parseInventoryDump(dump.text)).map((t) => ({ item: t.baseName, count: t.count, places: t.places, asOf }));
}
