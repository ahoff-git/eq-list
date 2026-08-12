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

const log = createLogger("json-store");

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
 */
export function writeJson(file: string, data: unknown, opts?: { pretty?: boolean; what?: string }): boolean {
  const tmp = `${file}.tmp`;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(data, null, opts?.pretty ? 2 : undefined), "utf8");
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
  opts?: { pretty?: boolean; restart?: boolean },
): Saver {
  let timer: NodeJS.Timeout | null = null;

  function write(): void {
    timer = null;
    writeJson(typeof file === "string" ? file : file(), snapshot(), { what, pretty: opts?.pretty });
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
