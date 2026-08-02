/**
 * log-import.ts — "eat" a log file: digest a whole EverQuest log into the kill log (which
 * feeds mob knowledge — observed drop rates and roam areas), without ever tailing it live.
 *
 * It replays the file through the same pure parser the watcher uses and drives the kill log
 * with the same kill / loot / loc / zone sequence `main.ts` feeds from live events. All the
 * kill-log time math keys off the log's own timestamps (fix age, the loot-to-corpse window),
 * so a fast replay lands the same results as watching the log in real time.
 *
 * Combat/session stats are deliberately left alone: those describe your *live* session, and
 * folding an old night's fights into "this session" would be a lie (history is separate).
 */
import fs from "node:fs";
import { parseLine } from "../src/shared/parse-line";
import type { KillLog } from "./kill-log";

export interface LogImportResult {
  /** Lines read from the file. */
  lines: number;
  /**
   * Kills **newly** recorded (your own and, as spawn evidence, others' in earshot). Lines already
   * known — because the log was eaten before, or watched live — are deduped and not counted, so
   * re-eating a log reports 0.
   */
  kills: number;
  /** Drops **newly** attributed to a corpse (already-folded loot lines are deduped, not counted). */
  drops: number;
}

/**
 * Digest `file` into `killLog`. The caller sets the kill log's player to this log's
 * character first (so your own kills — and your pet's death — are told apart correctly).
 */
export function importLog(file: string, killLog: KillLog): LogImportResult {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let zone: string | null = null;
  let logId = 0;
  let kills = 0;
  let drops = 0;
  for (const raw of lines) {
    // Negative ids mark these as imported, so a KillRecord.logId can't collide with a line
    // number from this run's live tailing.
    const event = parseLine(raw, --logId);
    if (!event) continue;
    switch (event.kind) {
      case "zone":
        zone = event.zone;
        break;
      case "loc":
        killLog.noteLoc(event, zone);
        break;
      case "loot":
        if (killLog.noteLoot(event)) drops++;
        break;
      case "kill":
        if (killLog.record(event.target, event.killer, zone, event.at, event.logId)) kills++;
        break;
    }
  }
  return { lines: lines.length, kills, drops };
}
