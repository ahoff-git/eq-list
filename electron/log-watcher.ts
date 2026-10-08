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
import { isCombatEvent, parseSplitLine } from "../src/shared/parse-line";
import { createUnmatchedLines, type UnmatchedLines } from "../src/shared/unmatched-lines";
import { splitLine } from "../src/shared/log-parser";
import { catchUpState, type CaughtUpState } from "../src/shared/log-catchup";
import { createLogger } from "../src/shared/logging";
import type { LogCursor } from "./log-cursor";
import type { CoinEvent, FactionEvent, GameTimeEvent, LootEvent, LogLine, LoginEvent, PartyEvent, ZoneEvent, XpEvent, KillEvent, LocEvent, LevelEvent, CombatEvent, SightingEvent, WatcherStatus } from "../src/shared/types";

const log = createLogger("log-watcher");
const POLL_MS = 500;
/**
 * The most one `poll()` pass will read and run through `splitLine`/`parseSplitLine`/the event
 * handlers before yielding back to the event loop. Parsing alone measures ~20ms/MB on a real log,
 * and the fan-out to every listener (meter, kill log, HP, alerts) costs more than the parse — so an
 * uncapped read of a whole evening's backlog is a multi-second main-process freeze on the very first
 * poll after a restart (see [ADR 0285](../specs/decisions/0285-a-catch-up-poll-is-capped-and-chained.md)).
 * 1 MiB keeps one pass's total main-thread cost comfortably under the ~100ms a stall starts reading
 * as a freeze rather than a blip, while staying large enough that an ordinary poll (a few new lines
 * every 500ms) never pays the chunking overhead — it reads its whole, tiny gap in one pass exactly as
 * before. When a pass is capped short of the gap's end, `poll` reschedules itself immediately (see
 * `leftoverBacklog` below) instead of waiting out the rest of `POLL_MS`.
 */
const MAX_CATCHUP_BYTES_PER_POLL = 1024 * 1024;

/** What one pass of catching a log up came to — see `onCaughtUp`. */
export interface CaughtUp {
  file: string;
  /** Bytes replayed. Zero when there was no gap (a fresh log, or nothing logged since we stopped). */
  bytes: number;
  /** Timestamp of the last event in the gap, if it had any — how stale the replay is. */
  lastAt?: string;
}

export interface LogWatcher {
  start(logDir: string, activeLogFile: string): void;
  stop(): void;
  status(): WatcherStatus;
  onLoot(cb: (e: LootEvent) => void): void;
  onZone(cb: (e: ZoneEvent) => void): void;
  onXp(cb: (e: XpEvent) => void): void;
  onKill(cb: (e: KillEvent) => void): void;
  onLoc(cb: (e: LocEvent) => void): void;
  onCoin(cb: (e: CoinEvent) => void): void;
  /** A `/time` response — the log stating the hour of day in Norrath. */
  onGameTime(cb: (e: GameTimeEvent) => void): void;
  onCombat(cb: (e: CombatEvent) => void): void;
  onLevel(cb: (e: LevelEvent) => void): void;
  /** You considered or hailed something — so it is in front of you, alive (ADR 0097). */
  onSighting(cb: (e: SightingEvent) => void): void;
  /** A faction-standing change — a stated delta, or a floor/ceiling hit. */
  onFaction(cb: (e: FactionEvent) => void): void;
  /** Your group changing — who the damage meter counts as your side (ADR 0067). */
  onParty(cb: (e: PartyEvent) => void): void;
  /** Logging in — the log's own mark for "a new sitting starts here" (ADR 0054). */
  onLogin(cb: (e: LoginEvent) => void): void;
  /**
   * Every timestamped line, whether or not a parser claimed it — the channel for things the log
   * says but nothing models, like a party invite. Costs nothing to offer: the line is already
   * split by the time the matchers run.
   */
  onLine(cb: (line: LogLine) => void): void;
  onStatus(cb: (s: WatcherStatus) => void): void;
  /**
   * Fired once per `start`, after the gap between where we left off and the end of the log has been
   * read — so a caller can decide what a gap that size means (see `isSameSitting`). Always fired,
   * with `bytes: 0` when there was nothing to catch up on.
   */
  onCaughtUp(cb: (info: CaughtUp) => void): void;
  /**
   * Lines no parser claimed, tallied by shape — the calibration loop behind Settings' debug
   * section. The watcher owns it because it owns the one place every line is already parsed.
   */
  unmatched(): UnmatchedLines;
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

/**
 * `cursor` remembers read positions across restarts. Without one the watcher still works and simply
 * forgets where it was between runs — which is what the tests that don't care use, and what the app
 * did before [ADR 0044](../specs/decisions/0044-the-log-position-outlives-the-app.md).
 */
export function createLogWatcher(cursor?: LogCursor): LogWatcher {
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
  /** Set by `start`, cleared by the first poll that follows it — the pass that reads the gap. */
  let catchingUp: { file: string; bytes: number; lastAt?: string } | null = null;
  /** Monotonic line counter — an event's `logId`, so it can point back at its line. */
  let logId = 0;
  let status: WatcherStatus = { watching: false };
  /**
   * Lines nothing parsed, by shape. Lives for the run rather than per file: a wording we can't
   * read is a fact about the grammar, not about which character produced it.
   */
  const unmatched = createUnmatchedLines();

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
    if (target) remember(target, offset);
    target = file;
    pending = "";
    if (!file) {
      offset = 0;
      return;
    }
    const resume = seen.get(file);
    offset = resume ?? (fromStart ? 0 : safeSize(file));
    // A position past the end means the file was replaced or rotated while we weren't looking, so
    // it says nothing about this file: everything in it is unread, and reading it from the top is
    // both correct and the only option.
    if (offset > safeSize(file)) offset = 0;
    // Starting anywhere but the top means the lines before us are never read — including the two
    // that say where the player is. Recover that state from what we're skipping (and only from
    // there: what comes *after* is a gap we're about to read properly, which is also why this
    // can't run when we're starting at the top — it would emit those lines twice).
    if (offset > 0) catchUp(file, offset);
  }

  /** Record progress — in memory for this run, and on disk so the next run resumes here. */
  function remember(file: string, at: number): void {
    seen.set(file, at);
    cursor?.set(file, at);
  }

  /** How far back to look for the zone line, growing until one turns up. A long camp in one zone
   *  can push it a long way behind the recent combat, and the whole point is to find it. */
  const CATCHUP_WINDOWS = [64 * 1024, 512 * 1024, 4 * 1024 * 1024];

  /**
   * Recover the current zone and position from the tail of a log we're about to follow from its
   * end. Emitted on the ordinary `zone`/`loc` channels, because that state *is* current — the
   * events that are merely history (kills, loot, experience, casts) are not emitted at all.
   */
  function catchUp(file: string, before: number): void {
    const size = Math.min(before, safeSize(file));
    if (!size) return;
    /** The widest pass's reading — the one that saw the most lines, so the best answer we got. */
    let widest: CaughtUpState = {};
    for (const window of CATCHUP_WINDOWS) {
      const from = Math.max(0, size - window);
      const { text } = readNew(file, from, size);
      // A partial first line is junk, so drop it — unless we started at the very beginning.
      const body = from === 0 ? text : text.slice(text.indexOf("\n") + 1);
      const lines = body.split(/\r?\n/).flatMap((raw) => splitLine(raw) ?? []);
      widest = catchUpState(lines);
      if (widest.zone) {
        log.debug("caught up", { file: path.basename(file), zone: widest.zone.zone, loc: !!widest.loc, gameTime: !!widest.gameTime, window });
        bus.emit("zone", widest.zone);
        if (widest.loc) bus.emit("loc", widest.loc);
        if (widest.gameTime) bus.emit("gameTime", widest.gameTime);
        return;
      }
      // That was the whole file, so there simply isn't a zone line to find — no point widening.
      if (from === 0) break;
    }
    // No zone line anywhere we looked, which used to mean giving up entirely on a log big enough to
    // outrun the widest window — dropping a `/loc` (or a `/time`) we had in hand. Either still
    // describes the present with no zone line before it (see `catchUpState`), and it's the same
    // reading the whole-file case has always emitted, so a long log shouldn't be the one case that
    // discards it.
    if (widest.loc || widest.gameTime) {
      log.debug("caught up on position/time only — no zone line found", { file: path.basename(file) });
      if (widest.loc) bus.emit("loc", widest.loc);
      if (widest.gameTime) bus.emit("gameTime", widest.gameTime);
    } else {
      log.debug("no zone line within the catch-up window", { file: path.basename(file) });
    }
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
    // `stop()` clears `timer` and nothing else restores it — a reliable "has watching actually
    // stopped since this call was scheduled" check, needed because a capped pass's own continuation
    // (`setImmediate(poll)` below) isn't cancelled by `stop()` the way `clearInterval` cancels the
    // regular tick. Without this, a `stop()` called mid-catch-up left a straggler chain of `poll()`
    // calls running on their own, re-emitting backlog events and even reviving `status().watching`
    // to `true` with no timer left to ever service it again — confirmed by a direct repro.
    if (!timer) return;
    if (busy) return;
    busy = true;
    // Set the moment this pass reads a capped-short chunk — the only case where more of the
    // current gap is known to remain. Drives both the "poll again immediately" reschedule and the
    // "don't report caughtUp yet" check below, so the two can never disagree about whether the gap
    // is actually finished.
    let leftoverBacklog = false;
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
        // Cap what one pass reads: a fresh gap the size of an evening's play must not be parsed and
        // fanned out in a single uninterruptible tick (see `MAX_CATCHUP_BYTES_PER_POLL`). An ordinary
        // poll's gap is almost always smaller than the cap, so `to` is just `size` and nothing below
        // changes from today's behavior.
        const to = Math.min(size, offset + MAX_CATCHUP_BYTES_PER_POLL);
        const { text, bytesRead } = readNew(target, offset, to);
        pending += text;
        offset += bytesRead;
        if (to < size) leftoverBacklog = true;
        if (catchingUp) catchingUp.bytes += bytesRead;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? ""; // trailing partial line waits for more bytes
        for (const raw of lines) {
          // One pass per line: the timestamp comes off once, the split line goes out as-is (for
          // whoever watches the log's own words), then to the matchers, and the typed event is
          // fanned out by its own `kind`. The id counts every raw line, parsed or not.
          const line = splitLine(raw, ++logId);
          if (!line) continue;
          bus.emit("line", line);
          const event = parseSplitLine(line);
          // A line nothing claimed is the only evidence we get that the grammar has a hole in
          // it. Counting it here — the one place every line passes through already parsed —
          // costs a map lookup and is what makes the gap findable (see `unmatched-lines.ts`).
          if (!event) {
            unmatched.note(line.message);
            continue;
          }
          if (catchingUp) catchingUp.lastAt = event.at;
          bus.emit(event.kind === "loot" ? "loot" : event.kind, event);
          if (isCombatEvent(event)) bus.emit("combat", event);
        }
        // Only now — the lines are ingested, so it's safe to say we've read them. A crash
        // between the two would replay this batch, which is why the write isn't deferred.
        remember(target, offset);
      }
      setStatus({ watching: true, file: target });
    } catch (e) {
      setStatus({ watching: false, error: (e as Error).message });
    } finally {
      busy = false;
      if (leftoverBacklog) {
        // This pass stopped at the cap with bytes of the same gap still unread. Catching up the
        // rest can't wait for the next regular `POLL_MS` tick — that would make a big backlog take
        // many seconds of wall-clock time to clear — so the next chunk is queued for as soon as the
        // event loop is free. `busy` is already false by the time this runs, so it can never collide
        // with the timer's own next tick. `catchingUp` (if set) is deliberately left alone: the gap
        // isn't finished, so it isn't reported yet.
        setImmediate(poll);
      } else if (catchingUp) {
        // The first poll after `start` is the one that reads the gap, across as many capped passes
        // as it took; report it exactly once, now that `offset === size` and nothing is left to
        // read this round — not once per chunk. Reported even when it was empty, so a caller doesn't
        // have to guess whether one is still coming.
        const done = catchingUp;
        catchingUp = null;
        if (done.bytes) log.debug("caught up on gap", done);
        bus.emit("caughtUp", done);
      }
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
      // Where each log stands. A log we have read before resumes from there, so whatever was
      // written while the app was closed is read once, as the news it is (ADR 0044). A log we have
      // never read is pinned at its end, because reading one from the top replays a whole history
      // as if it were happening now (ADR 0030) — and on a first run there is no state to preserve.
      seen.clear();
      for (const existing of existingLogs(dir)) {
        seen.set(existing, cursor?.get(existing) ?? safeSize(existing));
      }
      const resolved = resolveTarget(dir, file);
      // Announce the file BEFORE any of it is parsed: the character's name comes from the filename,
      // and it's what tells the kill log and the meter which rows are yours. The gap is read by the
      // poll below, so getting this out of order would file a whole session under the wrong name.
      if (resolved) setStatus({ watching: true, file: resolved });
      catchingUp = { file: resolved ?? "", bytes: 0 };
      switchTarget(resolved);
      log.debug("start watching", { dir, file, target, from: offset });
      timer = setInterval(poll, POLL_MS);
      poll();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      catchingUp = null; // a start that never got its poll shouldn't report a gap later
      if (target) remember(target, offset); // so the next run picks up exactly here
      setStatus({ watching: false });
    },
    status: () => status,
    onLoot: (cb) => void bus.on("loot", cb),
    onZone: (cb) => void bus.on("zone", cb),
    onXp: (cb) => void bus.on("xp", cb),
    onKill: (cb) => void bus.on("kill", cb),
    onLoc: (cb) => void bus.on("loc", cb),
    onCoin: (cb) => void bus.on("coin", cb),
    onGameTime: (cb) => void bus.on("gameTime", cb),
    onCombat: (cb) => void bus.on("combat", cb),
    onLevel: (cb) => void bus.on("level", cb),
    onSighting: (cb) => void bus.on("sighting", cb),
    onFaction: (cb) => void bus.on("faction", cb),
    onParty: (cb) => void bus.on("party", cb),
    onLogin: (cb) => void bus.on("login", cb),
    onLine: (cb) => void bus.on("line", cb),
    onStatus: (cb) => void bus.on("status", cb),
    onCaughtUp: (cb) => void bus.on("caughtUp", cb),
    unmatched: () => unmatched,
  };
}
