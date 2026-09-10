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
import { clampPinAt, loadPinFields, type PinFields } from "../src/shared/game-clock";
import { createChangeNotifier, createSaver, readJson } from "./json-store";

const WRITE_DEBOUNCE_MS = 2000;

type Stored = PinFields;

function load(file: string): Stored {
  return loadPinFields(readJson<Partial<Stored>>(file, {}), DEFAULT_OVERLAY_PIN_AT);
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
  const notifier = createChangeNotifier(saver);

  return {
    view: () => ({ pinned: state.pinned, pinAt: state.pinAt }),

    setPinned(on) {
      state.pinned = on;
      notifier.changed();
    },

    setPinPosition(fx, fy) {
      state.pinAt = clampPinAt(fx, fy);
      notifier.changed();
    },

    onChanged: notifier.onChanged,

    flush: () => saver.flush(),
  };
}
