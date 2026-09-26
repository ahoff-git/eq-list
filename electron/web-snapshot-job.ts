/**
 * web-snapshot-job.ts — keeps `public/data` refreshed on the same cadence a Windows Scheduled Task
 * used to (ADR 0278), but now driven entirely by the app's own lifecycle rather than the OS clock.
 *
 * The task ran `npm run web:snapshot` on a fixed 6-hour timer regardless of whether the app was
 * open, which meant a console window (and a node/electron process fetching better-sqlite3's own
 * prebuild) could appear at any time, even with the app fully closed. This replaces it: nothing
 * runs unless the app is already open, and a run missed while it was closed is caught up **once**
 * the next time it opens, rather than repeated for every interval that passed while shut.
 *
 * `createWebSnapshotJob` is the scheduling/catch-up logic alone — `now`, its timers, and `runExport`
 * are all injectable, so `web-snapshot-job.test.ts` exercises a multi-day timeline in milliseconds
 * with no real worker thread involved. `runWebSnapshotExport` is the real `runExport`: it spawns
 * `web-snapshot-worker.ts` on its own worker thread rather than running inline on the main process
 * — see that file's doc comment for why.
 */
import path from "node:path";
import { Worker } from "node:worker_threads";
import { createLogger } from "../src/shared/logging";
import { readJson, writeJson } from "./json-store";
import { realClearTimeout, realTimeout } from "./ticker";

const log = createLogger("web-snapshot-job");

/** Matches the Windows Scheduled Task's own repetition interval this replaces. */
export const WEB_SNAPSHOT_INTERVAL_MS = 6 * 60 * 60 * 1000;

const WORKER_TIMEOUT_MS = 5 * 60 * 1000;

export interface RunWebSnapshotExportOptions {
  userDataDir: string;
  /** The live app database's file — the worker opens its own read-only connection to it. */
  dbFile: string;
  /** Where the snapshot is written (same default the CLI uses: `public/data` under the repo). */
  outDir: string;
  /** The configured EverQuest log folder, read fresh on every run since it's a live setting. */
  logDir: () => string | undefined;
  /** Absolute path to the compiled `web-snapshot-worker.js`. */
  workerPath: string;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

/** Spawns `web-snapshot-worker.ts`, waits for it to finish, and never rejects — a failed export is
 *  logged and simply skipped; it must not take the scheduler down with it. */
export function runWebSnapshotExport({
  userDataDir,
  dbFile,
  outDir,
  logDir,
  workerPath,
  setTimeout: setAfter = realTimeout,
  clearTimeout: clearAfter = realClearTimeout,
}: RunWebSnapshotExportOptions): Promise<void> {
  return new Promise((resolve) => {
    const w = new Worker(workerPath, { workerData: { userDataDir, dbFile, outDir, logDir: logDir() } });
    let settled = false;
    const watchdog = setAfter(() => {
      if (settled) return;
      settled = true;
      log.warn("refresh timed out — discarding the worker");
      void w.terminate().catch(() => {});
      resolve();
    }, WORKER_TIMEOUT_MS);
    function finish(error?: string): void {
      if (settled) return;
      settled = true;
      clearAfter(watchdog);
      if (error) log.warn("refresh failed:", error);
      void w.terminate().catch(() => {});
      resolve();
    }
    w.on("message", (msg: { progress?: string; done?: boolean; error?: string }) => {
      if (msg.progress) log.debug(msg.progress);
      else if (msg.done) finish(msg.error);
    });
    w.on("error", (e) => finish(e.message));
  });
}

interface WebSnapshotJobCommonDeps {
  /** Where `web-snapshot-state.json` (the last-run timestamp) lives. */
  userDataDir: string;
  intervalMs?: number;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export type WebSnapshotJobDeps =
  | (WebSnapshotJobCommonDeps & {
      /** Runs one export and resolves once it's settled — never rejects. Overrides
       *  `runWebSnapshotExport` to exercise the scheduling/catch-up logic alone, with no real
       *  worker thread (see `web-snapshot-job.test.ts`). */
      runExport: () => Promise<void>;
    })
  | (WebSnapshotJobCommonDeps & Omit<RunWebSnapshotExportOptions, "userDataDir">);

export interface WebSnapshotJob {
  /** Catches up once if overdue, then keeps rescheduling itself every interval while the app is open. */
  start(): void;
  /** Stop rescheduling and abandon any in-flight run — the app is quitting. */
  dispose(): void;
}

export function createWebSnapshotJob(deps: WebSnapshotJobDeps): WebSnapshotJob {
  const {
    userDataDir,
    intervalMs = WEB_SNAPSHOT_INTERVAL_MS,
    now = Date.now,
    setTimeout: setAfter = realTimeout,
    clearTimeout: clearAfter = realClearTimeout,
  } = deps;
  const run = "runExport" in deps ? deps.runExport : () => runWebSnapshotExport(deps);
  const stateFile = path.join(userDataDir, "web-snapshot-state.json");
  let scheduleTimer: unknown = null;
  let running = false;
  let disposed = false;

  function lastRunAt(): number {
    const state = readJson<{ lastRunAt?: number }>(stateFile, {});
    return typeof state.lastRunAt === "number" ? state.lastRunAt : 0;
  }

  function recordRun(at: number): void {
    writeJson(stateFile, { lastRunAt: at }, { what: "web snapshot state" });
  }

  function runOnce(): void {
    if (running) return; // a run is already in flight — should be unreachable, kept as a safety net
    running = true;
    void run().finally(() => {
      running = false;
      recordRun(now());
    });
  }

  function scheduleNext(delayMs: number): void {
    if (disposed) return;
    clearAfter(scheduleTimer);
    scheduleTimer = setAfter(() => {
      runOnce();
      scheduleNext(intervalMs);
    }, delayMs);
  }

  return {
    start() {
      // "Never run" reads as `lastRunAt() === 0`, which is overdue by construction — same catch-up
      // path as a run that was merely missed while the app was closed.
      const elapsed = now() - lastRunAt();
      if (elapsed >= intervalMs) {
        runOnce();
        scheduleNext(intervalMs);
      } else {
        scheduleNext(intervalMs - elapsed);
      }
    },
    dispose() {
      disposed = true;
      clearAfter(scheduleTimer);
    },
  };
}
