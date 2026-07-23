/**
 * log-watcher.ts — tails the active EQ Legends log and emits parsed loot events.
 *
 * Polls the file (500ms, like EQBuddy) and reads only the bytes appended since
 * last time, so it stays cheap on multi-MB logs. Offset tracking is truncation-
 * safe: if the file shrinks (new session / rotation) we reset to the start. In
 * auto mode it follows the most-recently-written eqlog_*.txt, so switching
 * characters "just works". Parsing itself lives in the pure log-parser black box.
 */
import fs from "node:fs";
import path from "node:path";
import { EventEmitter } from "node:events";
import { parseLogLine, parseZoneLine, parseXpLine, parseKillLine, parseLocLine } from "../src/shared/log-parser";
import { createLogger } from "../src/shared/logging";
import type { LootEvent, ZoneEvent, XpEvent, KillEvent, LocEvent, WatcherStatus } from "../src/shared/types";

const log = createLogger("log-watcher");
const POLL_MS = 500;

export interface LogWatcher {
  start(logDir: string, activeLogFile: string): void;
  stop(): void;
  status(): WatcherStatus;
  onLoot(cb: (e: LootEvent) => void): void;
  onZone(cb: (e: ZoneEvent) => void): void;
  onXp(cb: (e: XpEvent) => void): void;
  onKill(cb: (e: KillEvent) => void): void;
  onLoc(cb: (e: LocEvent) => void): void;
  onStatus(cb: (s: WatcherStatus) => void): void;
}

/** Newest eqlog_*.txt in a dir, or a specific file when the user pinned one. */
function resolveTarget(logDir: string, activeLogFile: string): string | null {
  if (activeLogFile) {
    const p = path.isAbsolute(activeLogFile) ? activeLogFile : path.join(logDir, activeLogFile);
    return fs.existsSync(p) ? p : null;
  }
  try {
    const candidates = fs
      .readdirSync(logDir)
      .filter((f) => /^eqlog_.*\.txt$/i.test(f))
      .map((f) => {
        const full = path.join(logDir, f);
        return { full, mtime: fs.statSync(full).mtimeMs };
      });
    if (!candidates.length) return null;
    candidates.sort((a, b) => b.mtime - a.mtime);
    return candidates[0].full;
  } catch {
    return null;
  }
}

export function createLogWatcher(): LogWatcher {
  const bus = new EventEmitter();
  let timer: NodeJS.Timeout | null = null;
  let logDir = "";
  let activeLogFile = "";
  let target: string | null = null;
  let offset = 0;
  let pending = "";
  let busy = false;
  let status: WatcherStatus = { watching: false };

  function setStatus(next: WatcherStatus) {
    if (next.watching === status.watching && next.file === status.file && next.error === status.error) return;
    status = next;
    bus.emit("status", status);
  }

  /**
   * Point at a file. `fromStart` reads it from the top; otherwise we anchor at EOF.
   * We anchor at EOF only for the file that already exists when watching *starts*
   * (so launching mid-session doesn't replay hours of old log). A file that appears
   * *while* watching — a new session, or the sim's fresh log — is read from the top.
   */
  function switchTarget(file: string | null, fromStart = false) {
    target = file;
    pending = "";
    offset = file ? (fromStart ? 0 : safeSize(file)) : 0;
  }

  function safeSize(file: string): number {
    try {
      return fs.statSync(file).size;
    } catch {
      return 0;
    }
  }

  function readNew(file: string, from: number, to: number): string {
    const fd = fs.openSync(file, "r");
    try {
      const buf = Buffer.alloc(to - from);
      fs.readSync(fd, buf, 0, buf.length, from);
      return buf.toString("utf8");
    } finally {
      fs.closeSync(fd);
    }
  }

  function poll() {
    if (busy) return;
    busy = true;
    try {
      // In auto mode, follow whichever eqlog was written most recently.
      if (!activeLogFile) {
        const newest = resolveTarget(logDir, "");
        if (newest && newest !== target) {
          log.debug("following new log", newest);
          switchTarget(newest, true); // appeared while watching → read it fully
        }
      }
      if (!target || !fs.existsSync(target)) {
        setStatus({ watching: false, error: `No log file found in ${logDir}` });
        return;
      }

      const size = safeSize(target);
      if (size < offset) {
        // Truncated or rotated — start over from the top of the file.
        offset = 0;
        pending = "";
      }
      if (size > offset) {
        pending += readNew(target, offset, size);
        offset = size;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? ""; // trailing partial line waits for more bytes
        for (const line of lines) {
          const loot = parseLogLine(line);
          if (loot) {
            bus.emit("loot", loot);
            continue;
          }
          const zone = parseZoneLine(line);
          if (zone) {
            bus.emit("zone", zone);
            continue;
          }
          const xp = parseXpLine(line);
          if (xp) {
            bus.emit("xp", xp);
            continue;
          }
          const kill = parseKillLine(line);
          if (kill) {
            bus.emit("kill", kill);
            continue;
          }
          const loc = parseLocLine(line);
          if (loc) bus.emit("loc", loc);
        }
      }
      setStatus({ watching: true, file: target });
    } catch (e) {
      setStatus({ watching: false, error: (e as Error).message });
    } finally {
      busy = false;
    }
  }

  return {
    start(dir, file) {
      this.stop();
      logDir = dir;
      activeLogFile = file;
      if (!dir || !fs.existsSync(dir)) {
        setStatus({ watching: false, error: dir ? `Log folder not found: ${dir}` : "No log folder set" });
        return;
      }
      switchTarget(resolveTarget(dir, file));
      log.debug("start watching", { dir, file, target });
      timer = setInterval(poll, POLL_MS);
      poll();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      setStatus({ watching: false });
    },
    status: () => status,
    onLoot: (cb) => void bus.on("loot", cb),
    onZone: (cb) => void bus.on("zone", cb),
    onXp: (cb) => void bus.on("xp", cb),
    onKill: (cb) => void bus.on("kill", cb),
    onLoc: (cb) => void bus.on("loc", cb),
    onStatus: (cb) => void bus.on("status", cb),
  };
}
