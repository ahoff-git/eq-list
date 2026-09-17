/**
 * background-cache.ts — keep a synchronous, always-correct read warm without recomputing it on
 * the thread every window's IPC shares.
 *
 * Extracted from `kill-log.ts`'s `observations()` (ADR 0246) once it became clear the same shape
 * would fit other stores too (ADR 0247) — `combat-history.ts`'s `zones()`/`bests()`/`sessions()`
 * and `loot-log.ts`'s `prices()` both build on this same factory now. The pattern: a value that's
 * expensive to compute from a table with no cap on its size, read often enough (a kill, a fight
 * ending, a hit landing) that recomputing it inline on every read would tax the main process on a
 * schedule that only gets worse as a character's history grows.
 *
 * **The contract never changes for callers.** `get()` is still synchronous and still always
 * correct, whether or not a background refresh has had time to answer yet: it trusts its cache
 * only while confirmed to reflect the latest `markChanged()`, and recomputes right there otherwise.
 * A same-process caller with no realistic delay before it (every test that exercises one of these)
 * always finds the cache not-yet-confirmed and gets a synchronously fresh answer — this was true of
 * `kill-log.test.ts` before the split and stays true of anything built on this. In production the
 * background worker usually wins the race (see `refreshDebounceMs`), so the expensive path is rare.
 *
 * **A worker failure degrades to exactly the pre-worker behavior** — always computing synchronously
 * — never a crash and never a new failure mode; see `discardWorker`, mirroring `ocr.ts`'s own.
 *
 * **`dbFile: null`** (an in-memory database — every test that constructs one of these stores over
 * `:memory:`) disables the background half outright: a second `:memory:` connection is a distinct,
 * empty database, not a view onto the first, so a worker could only ever answer wrong. `get()`
 * covers this correctly on its own by always taking the synchronous path.
 */
import path from "node:path";
import { Worker } from "node:worker_threads";
import { createLogger } from "../src/shared/logging";
import { withTimeout } from "../src/shared/deadline";
import { coalesce } from "./coalesce";

const log = createLogger("background-cache");

const WORKER_PATH = path.join(__dirname, "background-cache-worker.js");

const DEFAULT_REFRESH_DEBOUNCE_MS = 300;
const DEFAULT_WORKER_TIMEOUT_MS = 30_000;

export interface BackgroundCacheOptions<T> {
  /** Names this cache in a background-failure log line — pick something a person recognizes. */
  label: string;
  /**
   * Computed synchronously, on the calling thread — used to seed the cache once at construction
   * and as the correctness-guaranteeing fallback whenever no background result has been confirmed
   * fresh yet. Almost always a thin wrapper around the same exported function `modulePath`/
   * `exportName` name, called against the caller's own live connection.
   */
  computeSync: () => T;
  /**
   * The database file a worker should open its own read-only connection to — `null` when there
   * isn't a real one to share (an in-memory database; see the module doc). Disables the background
   * half only; `get()` stays correct either way.
   */
  dbFile: string | null;
  /** Absolute path to the *compiled* module (its `.js`, not its `.ts`) whose `exportName` export is
   *  a `(db: Database) => T` function — the same one `computeSync` calls directly. */
  modulePath: string;
  exportName: string;
  /** How long to let a burst of `markChanged()` calls settle before asking the worker to recompute.
   *  Keep this shorter than whatever delay exists before a renderer re-reads after the same change,
   *  so the worker has a real head start on the read it exists to spare. Default 300ms. */
  refreshDebounceMs?: number;
  /** How long to wait on the worker before giving up on it for this round and discarding it — a
   *  wedged worker must not wedge every refresh after it forever. Default 30s. */
  workerTimeoutMs?: number;
}

export interface BackgroundCache<T> {
  /** The last confirmed-fresh value, or a synchronous recompute if nothing has confirmed one since
   *  the last `markChanged()`. Never blocks on the worker. */
  get(): T;
  /** Call after any mutation the computed value depends on. Schedules a debounced background
   *  refresh; `get()` stays exact in the meantime via its own synchronous fallback. */
  markChanged(): void;
  /** Fires once a *background* refresh actually lands a fresher value — never for a merely
   *  synchronous one inside `get()`. One listener, matching every tracker's own `onChanged`
   *  convention in this codebase (`json-store.ts`'s `createChangeNotifier`) — `main.ts` is the one
   *  place anything ever needs to hear it. */
  onRefreshed(cb: () => void): void;
}

export function createBackgroundCache<T>(opts: BackgroundCacheOptions<T>): BackgroundCache<T> {
  const refreshDebounceMs = opts.refreshDebounceMs ?? DEFAULT_REFRESH_DEBOUNCE_MS;
  const workerTimeoutMs = opts.workerTimeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS;

  let cache: T = opts.computeSync();
  /** Which `markChanged()` generation `cache` actually reflects. */
  let cacheVersion = 0;
  let version = 0;

  let worker: Worker | null = null;
  let pending: { resolve: (v: T) => void; reject: (e: Error) => void } | null = null;
  let listener: (() => void) | null = null;

  function getWorker(): Worker {
    if (!worker) {
      const w = new Worker(WORKER_PATH, {
        workerData: { dbFile: opts.dbFile, modulePath: opts.modulePath, exportName: opts.exportName },
      });
      w.on("message", (msg: { result?: T; error?: string }) => {
        const p = pending;
        pending = null;
        if (msg.error) p?.reject(new Error(msg.error));
        else p?.resolve(msg.result as T);
      });
      w.on("error", (e) => {
        pending?.reject(e as Error);
        pending = null;
        discardWorker();
      });
      // A background convenience only — never a reason by itself to keep the app alive.
      w.unref();
      worker = w;
    }
    return worker;
  }

  /**
   * Forget the current worker and tear it down in the background — mirrors `ocr.ts`'s own
   * `discardWorker`: a wedged or crashed worker does not come back on its own, and every later
   * refresh would inherit the wedge and fail too. `get()` keeps answering correctly regardless
   * (its synchronous fallback never depends on the worker); this only affects whether *later* reads
   * get to skip paying for that fallback.
   */
  function discardWorker(): void {
    const dying = worker;
    worker = null;
    pending = null;
    void dying?.terminate().catch(() => {});
  }

  function recomputeInBackground(): Promise<T> {
    return new Promise((resolve, reject) => {
      pending = { resolve, reject };
      getWorker().postMessage("recompute");
    });
  }

  /**
   * The debounced trailing edge of every `markChanged()`: recompute off the main thread, then
   * adopt the result — unless `version` has already moved on since this particular refresh started,
   * in which case it answers a question that's no longer current, and the *next* trigger (already
   * implied by whatever bumped `version` again) will supersede it properly.
   */
  function refreshInBackground(): void {
    const startVersion = version;
    void withTimeout(recomputeInBackground(), workerTimeoutMs, `${opts.label} recompute`)
      .then((result) => {
        if (startVersion !== version) return; // superseded before it finished
        cache = result;
        cacheVersion = startVersion;
        listener?.();
      })
      .catch((e) => {
        log.warn(`${opts.label}: background recompute failed:`, (e as Error).message);
        discardWorker();
      });
  }

  const scheduleRefresh =
    opts.dbFile !== null
      ? coalesce(refreshDebounceMs, refreshInBackground)
      : () => {}; // no database file to share with a worker; get() always falls back correctly

  return {
    get() {
      if (cacheVersion !== version) {
        cache = opts.computeSync();
        cacheVersion = version;
      }
      return cache;
    },
    markChanged() {
      version++;
      scheduleRefresh();
    },
    onRefreshed(cb) {
      listener = cb;
    },
  };
}
