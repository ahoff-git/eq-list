/**
 * background-cache-worker.ts — the one worker thread every `createBackgroundCache` (below,
 * `background-cache.ts`) spawns, whichever store is using it.
 *
 * Generic on purpose: rather than one hand-written worker file per store (the first version of
 * this, `kill-observations-worker.ts`, was exactly that — see ADR 0246), every background cache
 * points this same compiled script at whichever module and export actually computes its answer.
 * `modulePath`/`exportName` name a plain `(db: Database) => T` function — pure with respect to the
 * connection it's handed, so it works identically whether that connection belongs to the main
 * process or, as here, to this worker's own read-only one.
 */
import { parentPort, workerData } from "node:worker_threads";
import Database from "better-sqlite3";

interface BackgroundCacheWorkerData {
  dbFile: string;
  modulePath: string;
  exportName: string;
}

const { dbFile, modulePath, exportName } = workerData as BackgroundCacheWorkerData;
// Read-only: this connection only ever answers a "recompute" message, never writes, and never
// needs to — every mutation still goes through the main process's own connection. Safe alongside
// it under WAL mode, which `sqlite-store.ts` already turns on for exactly this kind of concurrent
// read.
const db = new Database(dbFile, { readonly: true });

// eslint-disable-next-line @typescript-eslint/no-require-imports -- the one place a compute
// function is loaded by name rather than a static import, so this file can stay the same for
// every store that wants a background cache instead of growing a new worker per store.
const compute = (require(modulePath) as Record<string, (db: Database.Database) => unknown>)[exportName];

parentPort?.on("message", (msg: unknown) => {
  if (msg !== "recompute") return;
  try {
    const result = compute(db);
    parentPort!.postMessage({ result });
  } catch (e) {
    parentPort!.postMessage({ error: (e as Error).message });
  }
});
