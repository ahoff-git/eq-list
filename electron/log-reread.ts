/**
 * log-reread.ts — putting a stale store right by reading the logs again, without being asked.
 *
 * [ADR 0128](../specs/decisions/0128-a-fight-is-re-derived-not-refused.md) made "digest the log
 * again" actually redo a stored fight. This is the other half: a release that changes how a log is
 * read bumps the `combat-history` revision and marks the concern `unattended`, and the next start
 * does the re-reading itself ([ADR 0129](../specs/decisions/0129-a-release-can-ask-for-a-re-read.md)).
 *
 * Three properties, and each is load-bearing rather than tidiness:
 *
 *   - **It reads the sources the history names**, not the log folder. A fight records the file it came
 *     from; those files are the only ones whose re-reading can change anything. Reading whatever else
 *     is lying in the folder would digest other characters' evenings nobody asked about.
 *   - **It yields between files.** `importLog` is a tight synchronous pass — about 1.4 seconds for a
 *     26 MB log, measured — so a player with several characters would otherwise freeze the main
 *     process for the sum of them. One file per turn of the event loop bounds the pause to one file,
 *     and the caller starts it *after* the window has painted, so none of it is on the launch path.
 *   - **It is self-limiting.** Putting the data right re-stamps the file at the current revision, so
 *     the next start finds nothing to do. Nothing here records "we tried"; the data itself is the
 *     record, which is the same reason `log-cursor.ts` keeps a position rather than a flag.
 *
 * A source that has gone (a log deleted, a folder moved) is skipped rather than treated as a failure,
 * and the fights that came from it keep their figures and say so — `StoredFight.unsourced`.
 *
 * **The sources are the *history's*, which bounds what this can do for the loot ledger.** A drop is not
 * stamped with the file it was read from — a `LootEvent` has no room for one and never needed it — so
 * placing drops rides along on the files the fights name
 * ([ADR 0137](../specs/decisions/0137-a-filed-drop-can-still-learn-where-it-was.md)). In practice those
 * are the same logs, because you looted where you fought; a log that recorded drops and no fights at all
 * is the gap, and its drops stay unplaced until somebody eats that file by hand.
 */
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { dataReport } from "./data-health";
import { digestLog } from "./log-import";
import type { CombatHistory } from "./combat-history";
import type { KillLog } from "./kill-log";
import type { LootLog } from "./loot-log";

const log = createLogger("log-reread");

/** What one unattended re-reading came to, for the debug log and whoever wants to say so. */
export interface ReReadReport {
  /** The concerns that asked for it, by id. */
  concerns: string[];
  /** Logs actually read, in the order they were read. */
  files: string[];
  /** Stored fights whose figures were re-derived. */
  refreshed: number;
  /** Fights today's rules found that the history didn't hold. */
  added: number;
  /** Stored fights their log can no longer account for. */
  unsourced: number;
  /**
   * Drops already in the ledger that can now say which zone they came from — what a re-read is worth
   * to the Loot tab ([ADR 0137](../specs/decisions/0137-a-filed-drop-can-still-learn-where-it-was.md)).
   * On a log whose every drop was watched live this is the only figure here that moves.
   */
  placed: number;
  /** Wall time spent, milliseconds — the number that decides whether this stays unattended. */
  ms: number;
}

export interface ReReadDeps {
  userDataDir: string;
  history: CombatHistory;
  killLog: KillLog;
  lootLog?: LootLog;
  /** Where logs live now, for a source recorded under a folder that has since moved. */
  logDir: string;
  /** The character being watched, so the kill log's identity is restored to it afterwards. */
  live: string;
}

/**
 * Which stored data is stale *and* has said the app may fix it itself. Empty is the normal answer —
 * this is only ever non-empty for the one start after an update that changed a parse rule.
 */
export function pendingReReads(userDataDir: string): string[] {
  return dataReport(userDataDir)
    .filter((row) => row.state === "stale" && row.concern.unattended)
    .map((row) => row.concern.id);
}

/**
 * Where a recorded source is *now*. The path a fight stored may name a folder that has since moved —
 * a reinstall, a different drive, or a history carried over from another machine — and the file name
 * is the durable half, exactly as it is for a fight's own identity (ADR 0128). So: the recorded path
 * if it is still there, otherwise the same name in the folder we watch today, otherwise nowhere.
 */
function resolveSource(recorded: string, logDir: string): string | undefined {
  const candidates = [recorded, path.join(logDir, path.basename(recorded))];
  return candidates.find((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

/** One turn of the event loop, so a long re-reading can't hold the main process for its whole run. */
const breathe = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * Do the re-reading, if anything asked for it. Returns null when nothing did — the overwhelmingly
 * common case, and the reason this is cheap to call on every start.
 *
 * Never throws: a re-reading is a repair, and a repair that takes the app down with it is worse than
 * the stale figure it was fixing. A file that won't read is logged and skipped.
 */
export async function reReadLogs(deps: ReReadDeps): Promise<ReReadReport | null> {
  const concerns = pendingReReads(deps.userDataDir);
  if (!concerns.length) return null;

  const recorded = deps.history.sources();
  const sources = [...new Set(recorded.flatMap((r) => resolveSource(r, deps.logDir) ?? []))];
  if (!sources.length) {
    // Nothing to read: the logs are gone, or this history came from somewhere else. The concern stays
    // stale, which is the honest state — and the Settings panel still names the remedy for a person
    // who can point at the right folder.
    log.debug("nothing to re-read", { concerns, recorded: recorded.length });
    return null;
  }

  log.info(`re-reading ${sources.length} log(s) to bring ${concerns.join(", ")} up to date`);
  const started = Date.now();
  const report: ReReadReport = { concerns, files: [], refreshed: 0, added: 0, unsourced: 0, placed: 0, ms: 0 };
  for (const file of sources) {
    await breathe(); // before the work, so the first file is off the caller's tick too
    try {
      const res = digestLog(file, deps.live, deps.killLog, deps.history, deps.lootLog);
      report.files.push(file);
      report.refreshed += res.refreshed;
      report.added += res.fights;
      report.unsourced += res.unsourced;
      report.placed += res.placed;
      log.debug("re-read", {
        file: path.basename(file),
        refreshed: res.refreshed,
        added: res.fights,
        placed: res.placed,
      });
    } catch (e) {
      log.warn("could not re-read", path.basename(file), (e as Error).message);
    }
  }
  report.ms = Date.now() - started;
  // Flushed here rather than left to the debounce: the whole point is that the file carries the
  // current revision *before* anything reads it again, and a start is exactly when it might.
  deps.history.flush();
  deps.killLog.flush();
  deps.lootLog?.flush();
  log.info(
    `re-read ${report.files.length} log(s) in ${report.ms}ms: ${report.refreshed} fights redone, ` +
      `${report.added} added, ${report.placed} drops placed`,
  );
  return report;
}
