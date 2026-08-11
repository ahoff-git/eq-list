/**
 * xp-progress.ts — how far into the current level you are.
 *
 * This is the one number the app genuinely cannot read. EQ logs experience only as
 * *gains* ("You gain experience! (1.025%)"), never a total, so "time to level" has no
 * starting point — unless the player tells us once. After that the log carries it:
 * every gain is added, and "You have gained a level!" resets it to zero, so the question
 * is asked at most once per level and self-corrects from then on.
 *
 * Note a level-up is itself a *known* baseline (you are 0% into the new level), so anyone
 * who levels while the app is watching never gets asked at all — the question only comes
 * up for a character who hasn't levelled since the app started keeping track.
 *
 * Persisted in its own small file rather than in settings, for the same reason window
 * bounds are (see `window-state.ts`): it changes constantly, and routing it through the
 * reactive settings store would spam every window (and rebuild the tray) on every kill.
 */
import path from "node:path";
import { EventEmitter } from "node:events";
import { createLogger } from "../src/shared/logging";
import type { XpProgress } from "../src/shared/types";

import { readJson, writeJson } from "./json-store";
const log = createLogger("xp-progress");

/** Gains land often; coalesce the writes. */
const WRITE_DEBOUNCE_MS = 3000;

export interface XpTracker {
  state(): XpProgress;
  /** The player tells us where they are (0–100). Also accepts a level, when known. */
  set(intoLevel: number, level?: number): XpProgress;
  /** An experience gain from the log, in percent of the level. */
  addGain(pct: number): void;
  /** A level-up: the counter starts over, and the log may have named the new level. */
  levelUp(level?: number, at?: string): void;
  onChange(cb: (progress: XpProgress) => void): void;
  flush(): void;
}

const clampPct = (n: number): number => Math.min(99.999, Math.max(0, n));

export function createXpProgress(userDataDir: string, nowIso: () => string = () => new Date().toISOString()): XpTracker {
  const file = path.join(userDataDir, "xp-progress.json");
  const bus = new EventEmitter();
  let timer: NodeJS.Timeout | null = null;
  let state: XpProgress = read();

  function read(): XpProgress {
    // `clampPct(0)` is 0, so an absent or unreadable file validates to "nothing known yet".
    const parsed = readJson<Partial<XpProgress>>(file, {});
    return {
      intoLevel: clampPct(Number(parsed.intoLevel) || 0),
      level: typeof parsed.level === "number" ? parsed.level : undefined,
      statedAt: parsed.statedAt,
      known: !!parsed.known,
    };
  }

  function write(): void {
    timer = null;
    writeJson(file, state, { what: "xp progress" });
  }

  function changed(): XpProgress {
    if (!timer) timer = setTimeout(write, WRITE_DEBOUNCE_MS);
    bus.emit("change", state);
    return state;
  }

  return {
    state: () => state,

    set(intoLevel, level) {
      state = {
        intoLevel: clampPct(intoLevel),
        level: level ?? state.level,
        statedAt: nowIso(),
        known: true,
      };
      log.debug("xp stated by player", state);
      return changed();
    },

    addGain(pct) {
      // Before the player has told us anything there's nothing to add to — tracking
      // gains anyway would silently invent a total from an unknown baseline.
      if (!state.known || !pct) return;
      state = { ...state, intoLevel: clampPct(state.intoLevel + pct) };
      changed();
    },

    levelUp(level, at) {
      // A level-up is self-correcting: whatever drift the estimate had, it's zero now.
      state = {
        intoLevel: 0,
        level: level ?? (state.level !== undefined ? state.level + 1 : undefined),
        statedAt: at ?? nowIso(),
        known: true,
      };
      log.debug("level up", state);
      changed();
    },

    onChange: (cb) => void bus.on("change", cb),

    flush() {
      if (timer) clearTimeout(timer);
      write();
    },
  };
}
