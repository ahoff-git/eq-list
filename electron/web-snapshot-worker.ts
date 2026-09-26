/**
 * web-snapshot-worker.ts — runs `buildWebSnapshot` off the main thread (same reasoning as ADR 0246's
 * `kill-observations-worker.ts`): the maps section alone can be ~215 MB, and copying that
 * synchronously on the thread every window's IPC and hotkeys share would stall the app mid-session.
 *
 * One-shot per message rather than `background-cache-worker.ts`'s long-lived cache refresh —
 * `web-snapshot-job.ts` spawns a fresh worker for each scheduled run and terminates it once the
 * result (or a failure) comes back.
 */
import { parentPort, workerData } from "node:worker_threads";
import Database from "better-sqlite3";
import { buildWebSnapshot } from "./web-snapshot";

interface WebSnapshotWorkerData {
  userDataDir: string | null;
  /** The db file to open a fresh read-only connection to — null exactly when `userDataDir` is (see
   *  `BuildWebSnapshotOptions`). Safe alongside the main process's own connection under WAL mode
   *  (`sqlite-store.ts`). */
  dbFile: string | null;
  outDir: string;
  logDir?: string;
}

const { userDataDir, dbFile, outDir, logDir } = workerData as WebSnapshotWorkerData;
const db = dbFile ? new Database(dbFile, { readonly: true }) : null;

try {
  const manifest = buildWebSnapshot({
    userDataDir,
    db,
    outDir,
    logDir,
    onProgress: (line) => parentPort?.postMessage({ progress: line }),
  });
  parentPort?.postMessage({ done: true, manifest });
} catch (e) {
  parentPort?.postMessage({ done: true, error: (e as Error).message });
} finally {
  db?.close();
}
