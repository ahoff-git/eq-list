/**
 * alert-gate.ts — the one check every tracker's own alert makes before it ever builds a banner.
 *
 * `achievement-tracker.ts`, `goal-tracker.ts`, `spawn-tracker.ts`, `game-clock-tracker.ts` and
 * `buff-tracker.ts` each raise their own kind of alert — a criterion, a milestone, a pop, an alarm, a
 * lapsed buff — and each payload is genuinely different (a `goal`, an `achievement`, a `buff`, plain
 * text). What is *not* different is the one check in front of all of them: the overlay itself is
 * switched off, or it isn't. `raiseIfEnabled` is that check, done once; `build` only ever runs once
 * it has passed, so a caller's own payload-shaping code never has to repeat the settings read whose
 * only other job was answering it.
 *
 * Not named `raiseAlert`: `main.ts` already has one of those — the function that actually moves the
 * alert window to the front and broadcasts it, which is what every tracker's own `raise` callback
 * *is* by the time it reaches here. Two functions that both "raise an alert" but do different halves
 * of it is exactly the kind of same-name-different-thing a reader (or a grep) shouldn't have to
 * untangle.
 */
import type { CastAlertEvent, CastAlertSettings } from "../src/shared/types";

/**
 * Build and raise an alert, but only while the overlay is switched on. `build` sees the settings so
 * it can resolve its own look through `alertStyle(settings, …)`. Returning `undefined` from it skips
 * silently, for a gate that only becomes knowable once `settings` is in hand; a gate that doesn't
 * need `settings` at all — `achievement-tracker.ts`'s `quiet`, `spawn-tracker.ts`'s per-timer
 * `notify` — reads better as its own early return in the caller, before this is ever called.
 */
export function raiseIfEnabled(
  getSettings: () => CastAlertSettings,
  raise: (alert: CastAlertEvent) => void,
  build: (settings: CastAlertSettings) => CastAlertEvent | undefined,
): void {
  const settings = getSettings();
  if (!settings.enabled) return;
  const event = build(settings);
  if (event) raise(event);
}
