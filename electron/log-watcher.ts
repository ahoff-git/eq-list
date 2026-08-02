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
import { parseLine } from "../src/shared/parse-line";
import { createLogger } from "../src/shared/logging";
import type { LootEvent, ZoneEvent, XpEvent, KillEvent, LocEvent, LevelEvent, CombatEvent, WatcherStatus } from "../src/shared/types";

const log = createLogger("log-watcher");
const POLL_MS = 500;

/**
 * Event kinds that make up the combat stream. They're emitted under their own kind *and*
 * as "combat", so the damage meter can take one subscription while anything interested in
 * a single kind (a death, say) can still have just that.
 */
const COMBAT_KINDS = new Set(["damage", "miss", "heal", "cast", "spell-outcome", "death", "buff-faded"]);

export interface LogWatcher {
  start(logDir: string, activeLogFile: string): void;
  stop(): void;
  status(): WatcherStatus;
  onLoot(cb: (e: LootEvent) => void): void;
  onZone(cb: (e: ZoneEvent) => void): void;
  onXp(cb: (e: XpEvent) => void): void;
  onKill(cb: (e: KillEvent) => void): void;
  onLoc(cb: (e: LocEvent) => void): void;
  onCombat(cb: (e: CombatEvent) => void): void;
  onLevel(cb: (e: LevelEvent) => void): void;
  onStatus(cb: (s: WatcherStatus) => void): void;
}

/** Every eqlog_*.txt currently in a dir, absolute. */
function existingLogs(logDir: string): string[] {
  try {
    return fs
      .readdirSync(logDir)
      .filter((f) => /^eqlog_.*\.txt$/i.test(f))
      .map((f) => path.join(logDir, f));
  } catch {
    return [];
  }
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
  /** How far we had read each file we've followed, so switching back doesn't replay it. */
  const seen = new Map<string, number>();
  let pending = "";
  let busy = false;
  /** Monotonic line counter — an event's `logId`, so it can point back at its line. */
  let logId = 0;
  let status: WatcherStatus = { watching: false };

  function setStatus(next: WatcherStatus) {
    if (next.watching === status.watching && next.file === status.file && next.error === status.error) return;
    status = next;
    bus.emit("status", status);
  }

  /**
   * Point at a file. `fromStart` reads it from the top; otherwise we anchor at EOF.
   *
   * Only a log that genuinely **appeared** after watching began is read from the top — a new
   * session, or the sim's fresh log. Every log that already existed is anchored at its end,
   * whether or not it was the one we started on: switching to another character mid-session
   * otherwise replays their entire history as if it were happening now, which re-records
   * every kill, re-counts the experience, re-matches the loot against the shopping list and
   * fires an alert for every spell they were ever cast at. Measured at 120 phantom kills.
   *
   * A file we have already followed resumes exactly where we left off, whatever `fromStart`
   * says — the same argument, for the case where we've read part of it.
   */
  function switchTarget(file: string | null, fromStart = false) {
    if (target) seen.set(target, offset);
    target = file;
    pending = "";
    if (!file) {
      offset = 0;
      return;
    }
    const resume = seen.get(file);
    offset = resume ?? (fromStart ? 0 : safeSize(file));
  }

  function safeSize(file: string): number {
    try {
      return fs.statSync(file).size;
    } catch {
      return 0;
    }
  }

  // Returns the decoded text AND the byte count actually read: a short read (fewer bytes
  // than requested) must not decode the zero-filled tail as NUL characters, nor let the
  // caller advance the offset past bytes it never saw.
  function readNew(file: string, from: number, to: number): { text: string; bytesRead: number } {
    const fd = fs.openSync(file, "r");
    try {
      const buf = Buffer.alloc(to - from);
      const bytesRead = fs.readSync(fd, buf, 0, buf.length, from);
      return { text: buf.toString("utf8", 0, bytesRead), bytesRead };
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
          // Announce the new file (→ main sets the player from its name) BEFORE parsing its
          // backlog, so the new character's kills/damage aren't attributed to the old one.
          setStatus({ watching: true, file: newest });
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
        const { text, bytesRead } = readNew(target, offset, size);
        pending += text;
        offset += bytesRead;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? ""; // trailing partial line waits for more bytes
        for (const line of lines) {
          // One pass per line: the dispatcher splits the timestamp once and hands the
          // result to each matcher, then we fan the typed event out by its own `kind`.
          const event = parseLine(line, ++logId);
          if (!event) continue;
          bus.emit(event.kind === "loot" ? "loot" : event.kind, event);
          if (COMBAT_KINDS.has(event.kind)) bus.emit("combat", event);
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
      // Every log already on disk is history, not news — pin each at its current end so that
      // switching characters later follows the new writing rather than replaying the past.
      seen.clear();
      for (const existing of existingLogs(dir)) seen.set(existing, safeSize(existing));
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
    onCombat: (cb) => void bus.on("combat", cb),
    onLevel: (cb) => void bus.on("level", cb),
    onStatus: (cb) => void bus.on("status", cb),
  };
}
