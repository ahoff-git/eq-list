/**
 * ui-state.ts — the panel settings a window remembers, kept where the *app* can find them.
 *
 * These have always lived in `localStorage`, which is the obvious place for them and works
 * perfectly — right up until you notice that **`localStorage` belongs to an origin, not to the app**.
 * A packaged launch serves the renderer from `app://local` and a development one from
 * `http://localhost:3000`, so the two keep entirely separate copies: value weights typed into one are
 * simply not there in the other, which reads exactly like "my settings don't survive a restart".
 * (The same split would bite a change of dev port, or a move off the custom scheme.)
 *
 * So the renderer still writes `localStorage` — it is synchronous, it is what the first paint reads,
 * and it costs nothing — but the value is mirrored here as well, and **here wins on load**. One JSON
 * file in `userData`, beside every other thing the app remembers.
 *
 * Deliberately untyped and unopinionated: it is a key/value box for the renderer's own state, and it
 * has no business knowing what a "criteria" or a "weight" is. What it does know is that a renderer
 * bug must not be able to fill the disk, hence the caps below.
 */
import path from "node:path";
import { createSaver, readJson } from "./json-store";
import { createLogger } from "../src/shared/logging";

const log = createLogger("ui-state");

/** Longest key we'll store. Keys are constants from `storageKeys.ts`; this is a guard, not a limit. */
const MAX_KEY = 120;
/** Largest single value. The Items tab's criteria — every zone ticked — is about 6 KB. */
const MAX_VALUE_BYTES = 256 * 1024;
/** Most keys we'll hold. There are around twenty. */
const MAX_KEYS = 200;
/** Panel settings change in bursts (a drag, a burst of typing); only where it lands is worth keeping. */
const SAVE_AFTER_MS = 400;

export interface UiState {
  /** Everything held, for a window warming up. */
  all(): Record<string, unknown>;
  /** One value, or `undefined` for a key nothing has stored. */
  get(key: string): unknown;
  /** Remember a value. Debounced to disk; in memory at once. */
  set(key: string, value: unknown): void;
  /** Write now — for quitting. */
  flush(): void;
}

export function createUiState(userDataDir: string): UiState {
  const file = path.join(userDataDir, "ui-state.json");
  const held: Record<string, unknown> = { ...readJson<Record<string, unknown>>(file, {}) };
  // Not ours, and re-reading it as a setting would put it back on disk as one.
  delete held.provenance;

  const saver = createSaver(file, "panel settings", () => held, SAVE_AFTER_MS, { restart: true });

  return {
    all: () => ({ ...held }),
    get: (key) => held[key],

    set(key, value) {
      if (typeof key !== "string" || !key || key.length > MAX_KEY) return;
      if (value === undefined || value === null) {
        if (!(key in held)) return;
        delete held[key];
        saver.save();
        return;
      }
      let json: string;
      try {
        json = JSON.stringify(value);
      } catch {
        return; // not serializable, so it was never going to survive a restart anyway
      }
      if (json.length > MAX_VALUE_BYTES) {
        log.warn("panel setting too large to keep:", key, json.length);
        return;
      }
      if (!(key in held) && Object.keys(held).length >= MAX_KEYS) {
        log.warn("too many panel settings; ignoring", key);
        return;
      }
      // Store the parsed copy rather than the caller's object: it crossed IPC, so it is already a
      // plain value, and this keeps `all()` cheap to serialize.
      const next = JSON.parse(json) as unknown;
      if (JSON.stringify(held[key]) === json) return; // no change, no write
      held[key] = next;
      saver.save();
    },

    flush: () => saver.flush(),
  };
}
