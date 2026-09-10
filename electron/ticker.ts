/**
 * ticker.ts — the default `setInterval`/`clearInterval` a sweep uses when a test hasn't supplied
 * its own.
 *
 * Three trackers (`game-clock-tracker.ts`, `goal-tracker.ts`, `spawn-tracker.ts`) sweep on a plain
 * interval and each wrote the same pair of defaults for it — real timers, unref'd so a countdown is
 * never the reason the process stays up after a quit, with the seam left open for a test to inject
 * a fake clock instead and run an 8-hour goal or a night-long respawn in milliseconds.
 */

/** The real `setInterval`, unref'd. */
export function realInterval(fn: () => void, ms: number): unknown {
  const t = setInterval(fn, ms);
  t.unref?.();
  return t;
}

/** The real `clearInterval`. */
export function realClearInterval(handle: unknown): void {
  clearInterval(handle as NodeJS.Timeout);
}
