/**
 * damage-overlay-tracker.ts — whether the floating damage meter is pinned over the game, and
 * where.
 *
 * This is a UI preference riding along in its own tiny file rather than a fact `combat-stats.ts`
 * knows about, for the same reason `game-clock-tracker.ts` keeps its own `pinned`/`pinAt`: it
 * isn't shared with peers, isn't a `Settings` field anyone edits by hand, and is small enough that
 * folding it into the fight tracker would mix "what happened this fight" (in-memory, reset every
 * pull) with "where the player left a window" (persisted, and indifferent to combat entirely).
 */
import path from "node:path";
import type { DamageOverlayView } from "../src/shared/types";
import { DEFAULT_OVERLAY_PIN_AT } from "../src/shared/damage-overlay";
import { createSaver, readJson } from "./json-store";

const WRITE_DEBOUNCE_MS = 2000;

const clampUnit = (n: number): number => Math.min(1, Math.max(0, n));

interface Stored {
  pinned: boolean;
  pinAt: { fx: number; fy: number };
}

function load(file: string): Stored {
  const stored = readJson<Partial<Stored>>(file, {});
  return {
    pinned: stored.pinned ?? false,
    // Read through the same clamp `setPinPosition` writes through — a hand-edited or corrupted
    // file could otherwise hand back an out-of-[0,1] or partial `{fx}`/`{fy}`, which
    // `DamageMeterOverlay.tsx` would render straight into `left`/`top` percentages.
    pinAt: {
      fx: clampUnit(stored.pinAt?.fx ?? DEFAULT_OVERLAY_PIN_AT.fx),
      fy: clampUnit(stored.pinAt?.fy ?? DEFAULT_OVERLAY_PIN_AT.fy),
    },
  };
}

export interface DamageOverlayTracker {
  view(): DamageOverlayView;
  /** Pin (or unpin) the meter over the game. */
  setPinned(on: boolean): void;
  /** Where the pinned meter sits, as a fraction of the display — set by dragging its grip. */
  setPinPosition(fx: number, fy: number): void;
  onChanged(cb: () => void): void;
  flush(): void;
}

export function createDamageOverlayTracker({ userDataDir }: { userDataDir: string }): DamageOverlayTracker {
  const file = path.join(userDataDir, "damage-overlay.json");
  const state = load(file);
  const saver = createSaver(file, "damage overlay", () => state, WRITE_DEBOUNCE_MS);
  let listener: (() => void) | null = null;

  const changed = () => {
    saver.save();
    listener?.();
  };

  return {
    view: () => ({ pinned: state.pinned, pinAt: state.pinAt }),

    setPinned(on) {
      state.pinned = on;
      changed();
    },

    setPinPosition(fx, fy) {
      state.pinAt = { fx: clampUnit(fx), fy: clampUnit(fy) };
      changed();
    },

    onChanged(cb) {
      listener = cb;
    },

    flush: () => saver.flush(),
  };
}
