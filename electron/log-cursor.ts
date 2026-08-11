/**
 * log-cursor.ts — how far we have read each log file, remembered across restarts.
 *
 * The watcher pins an unknown log at its end, because reading one from the top replays a whole
 * history as though it were happening now ([ADR 0030](../specs/decisions/0030-history-is-not-news.md)).
 * That rule made the app's state depend on *when it was launched*: everything logged while it wasn't
 * running was gone, so two identical installs disagreed about kills, drops, experience and the loot
 * feed purely by launch order.
 *
 * A remembered position turns "skip the past" into "skip only what we already read". The gap between
 * that position and the end of the file is neither history nor a replay — it is the news we missed,
 * and it gets read exactly once, because the position advances as we read and persists when we stop.
 * See [ADR 0044](../specs/decisions/0044-the-log-position-outlives-the-app.md).
 *
 * Deliberately dumb: byte offsets keyed by file, nothing about what was in them. Whether replaying
 * a gap is *safe* is the watcher's and the sinks' problem, not this file's.
 */
import path from "node:path";

import { readJson, writeJson } from "./json-store";

export interface LogCursor {
  /** Bytes of `file` already consumed, or `undefined` for a log we've never read. */
  get(file: string): number | undefined;
  /** Record progress. Written straight through — see `write` for why that's cheap enough. */
  set(file: string, offset: number): void;
  /** Drop every remembered position (so the next start anchors at EOF, as a first run does). */
  clear(): void;
  /** No-op today; kept so callers can flush on quit without knowing the write policy. */
  flush(): void;
}

interface CursorState {
  version: 1;
  /** Normalized file path → bytes consumed. */
  files: Record<string, number>;
}

/**
 * Log paths are Windows paths, where two spellings are one file — and one file must not become two
 * cursors, or the gap gets read twice. Lower-casing costs nothing on a case-sensitive filesystem
 * beyond an inability to tell `Bob` from `bob`, which EQ character names can't be anyway.
 */
const keyFor = (file: string): string => path.resolve(file).toLowerCase();

export function createLogCursor(userDataDir: string): LogCursor {
  const file = path.join(userDataDir, "log-cursors.json");
  const tmp = `${file}.tmp`;
  let state: CursorState = read();
  /** What's on disk, so an unchanged offset doesn't rewrite the file. */
  let written = JSON.stringify(state);

  function read(): CursorState {
    // No file yet (first run), or one we can't read. Either way we know nothing, and the watcher's
    // fallback — anchor at EOF — is the safe direction: we miss a gap rather than replay a history.
    const parsed = readJson<Partial<CursorState>>(file, {});
    const files: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed.files ?? {})) {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) files[k] = v;
    }
    return { version: 1, files };
  }

  /**
   * Written on every advance rather than debounced, because the window between "we ingested these
   * lines" and "we recorded that we did" is the one window in which a crash causes a *second*
   * ingestion. A poll fires at most twice a second and this file is a few hundred bytes, so the
   * cost of closing that window is nil. Written to a temp file and renamed so a crash mid-write
   * can't leave a half-file that loses every position.
   */
  function write(): void {
    const next = JSON.stringify(state);
    if (next === written) return;
    if (writeJson(file, state, { what: "log positions" })) written = next;
  }

  return {
    get: (f) => state.files[keyFor(f)],

    set(f, offset) {
      const key = keyFor(f);
      if (state.files[key] === offset) return;
      state.files[key] = offset;
      write();
    },

    clear() {
      state = { version: 1, files: {} };
      write();
    },

    flush: write,
  };
}
