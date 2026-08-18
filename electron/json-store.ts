/**
 * json-store.ts — reading and writing the app's little JSON stores on disk.
 *
 * Ten modules under `electron/` keep something in `userData` as JSON, and every one of them had written
 * its own read-with-a-fallback and its own write. That would be untidy; what made it a **bug** is that
 * the two halves diverged. `store.ts` and `log-cursor.ts` write to a temp file and rename over the
 * target, with this reasoning spelled out beside it:
 *
 * > a crash mid-write can't truncate the real file, which `readJson` would otherwise fail to parse and
 * > silently replace with an empty list — losing a hand-built shopping list with no error shown.
 *
 * The other eight wrote straight to the destination. So an interrupted write left a half-written file,
 * the next read threw, the fallback took over, and the store came back **empty with nothing said** — for
 * the kill log (thousands of records, and [ADR 0056](../specs/decisions/0056-a-dropped-record-keeps-what-it-taught.md)
 * says a dropped record must keep what it taught), the loot ledger, the fight history, and the mob
 * observations pooled from peers. Exactly the failure store.ts had already described, on data far harder
 * to rebuild than a shopping list.
 *
 * One reader, one writer, and the writer is atomic. Failure is logged and swallowed: a store that can't
 * be saved shouldn't take the app down, and the caller carries on with what's in memory.
 */

import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { concernById, stampFor, type DataStamp } from "../src/shared/data-provenance";

const log = createLogger("json-store");

/**
 * The build doing the writing, for the stamp every store carries (`data-provenance.ts`). Set once from
 * `app.getVersion()` — this module can't ask Electron for it, being the one piece of store plumbing
 * that the tests construct without an app around them.
 *
 * Blank is fine and means "a build that didn't say": the stamp's `revision` is what's ever compared,
 * and the version is only ever read back by a person looking at a bug report.
 */
let appVersion = "";

/** Tell the store layer which build it is. Called once, at startup, before any store is built. */
export function setAppVersion(version: string): void {
  appVersion = version;
}

/**
 * The provenance to write into a store's file — which rules wrote it, which build, and when.
 *
 * `undefined` for an unregistered id rather than a throw: a store naming a concern that isn't in the
 * table is a wiring mistake worth a warning, and it must not stop the data reaching disk.
 */
function provenanceFor(concern: string): DataStamp | undefined {
  const found = concernById(concern);
  if (!found) {
    log.warn("no such data concern; writing without a stamp:", concern);
    return undefined;
  }
  return stampFor(found, appVersion, new Date().toISOString());
}

/**
 * Parse a JSON file, or hand back `fallback` — for a file that's missing, unreadable, or corrupt.
 *
 * Deliberately quiet about a missing file, which is the ordinary first-run case. A file that exists and
 * *won't* parse is worth a word, since that's the shape data loss takes.
 */
export function readJson<T>(file: string, fallback: T): T {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return fallback; // not there yet — the normal case on a first run
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    log.warn("unreadable, falling back to empty:", file, (e as Error).message);
    return fallback;
  }
}

/**
 * Write JSON **atomically**: create the folder, write `<file>.tmp`, then rename it over the target.
 *
 * `rename` within a directory is atomic on every platform we run on, so a reader sees either the old file
 * or the new one and never a half of either. Returns whether it got there, for a caller that tracks what
 * it last saved.
 *
 * `pretty` for a file a person might open; compact for the big ones (a thousand fights) where the
 * indentation is most of the bytes.
 *
 * `concern` stamps the file with the rules that wrote it (`data-provenance.ts`), which is what lets the
 * app say later that a store predates a change and needs re-reading. Stamped **here**, in the one
 * writer every store shares, rather than by each store remembering to: a store that forgot would look
 * permanently current, and a silently-wrong "up to date" is worse than no flag at all.
 */
export function writeJson(
  file: string,
  data: unknown,
  opts?: { pretty?: boolean; what?: string; concern?: string },
): boolean {
  const tmp = `${file}.tmp`;
  // Merged into the object, not wrapped around it, so every existing reader goes on seeing the shape
  // it always did and an older build reading a newer file just ignores a field it doesn't know.
  // Only for a plain object: an array or a scalar has nowhere to put it, and quietly reshaping a
  // store's file to make room would be a far bigger change than a stamp.
  //
  // **The stamp goes first**, and that is load-bearing rather than tidy. `JSON.stringify` emits keys
  // in insertion order, and `data-health.ts` finds the stamp by reading a **window from the head of
  // the file** — because a real fight history is megabytes and a report about it must not cost
  // megabytes of parsing. Spreading `data` first put the stamp at the end, where that read never
  // reached it, and every large store then reported itself stale for ever. A test pins it.
  const stamp = opts?.concern && data && typeof data === "object" && !Array.isArray(data);
  const rest = stamp ? { ...(data as Record<string, unknown>) } : undefined;
  // A store carrying its own `provenance` must not outrank ours; nothing does today, and relying on
  // that quietly is how the invariant above gets broken by an unrelated change.
  if (rest) delete rest.provenance;
  const stamped = rest ? { provenance: provenanceFor(opts!.concern!), ...rest } : data;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(stamped, null, opts?.pretty ? 2 : undefined), "utf8");
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    log.warn(`could not save ${opts?.what ?? file}:`, (e as Error).message);
    // A tmp file left behind would be rewritten next time, but tidying up keeps userData legible.
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* nothing more to try */
    }
    return false;
  }
}

/** A store's disk half: note that something changed, and force it out when it matters. */
export interface Saver {
  /** Something changed. Writes shortly, coalescing everything else in the same burst. */
  save(): void;
  /** Write now, cancelling any pending write. For quitting, and for "I need this on disk". */
  flush(): void;
}

/**
 * Coalesce a store's writes: a burst of changes becomes one write, `afterMs` after the first of them.
 *
 * Seven stores had this, six of them character for character — a `timer`, a `write` that nulls it, and a
 * `flush` that clears it and writes. Observations arrive in clusters (every hit of a fight, every peer
 * report), so the debounce is real work; the duplication was in the **cancellation**, which is the part
 * that bites. Drop the `timer = null` and the store writes once and never again; drop the `clearTimeout`
 * in `flush` and a write lands after the app has finished quitting, on a state nobody will read back.
 *
 * `snapshot` is called at write time rather than at save time, so it sees the newest state and a burst
 * costs one serialization, not one per change. `file` may be a function for a store whose path isn't
 * known until Electron is ready.
 */
export function createSaver(
  file: string | (() => string),
  what: string,
  snapshot: () => unknown,
  afterMs: number,
  opts?: { pretty?: boolean; restart?: boolean; concern?: string },
): Saver {
  let timer: NodeJS.Timeout | null = null;

  function write(): void {
    timer = null;
    writeJson(typeof file === "string" ? file : file(), snapshot(), {
      what,
      pretty: opts?.pretty,
      // Which body of data this is, so the file records the rules that wrote it. One word per store,
      // because the stamping itself lives in `writeJson`.
      concern: opts?.concern,
    });
  }

  return {
    save() {
      // The one axis these stores genuinely differ on. By default the timer is *not* restarted, so a
      // steady stream of changes still reaches disk every `afterMs` instead of being postponed for ever
      // — right for a log being eaten. `restart` waits for the changes to stop, which is right for a
      // window being dragged: the frames in between are noise and only where it lands is worth keeping.
      if (opts?.restart && timer) clearTimeout(timer);
      else if (timer) return;
      timer = setTimeout(write, afterMs);
    },
    flush() {
      if (timer) clearTimeout(timer);
      write();
    },
  };
}
