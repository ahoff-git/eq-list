/**
 * log-clock.ts — what time it is *in the log*, between lines.
 *
 * Everything the app measures is measured against the log's own timestamps, and that works for as
 * long as something is being logged. A **fight ends in quiet**, and quiet writes no lines: the
 * tracker cannot know a pull is over until the next one starts, because nothing tells it the clock
 * moved (see `combat-stats.ts`'s `settle`).
 *
 * The obvious fix — hand it `Date.now()` — is wrong twice over, and both cases are ones this app
 * actually runs in:
 *
 *   - **A replayed gap.** Everything logged while the app was shut is fed through the live path at
 *     launch ([ADR 0044](../../specs/decisions/0044-the-log-position-outlives-the-app.md)). Those
 *     lines are hours old; the wall clock is now. Settling against it would cut short whatever
 *     fight the replay was in the middle of.
 *   - **The simulator.** `scripts/replay-log.mjs --relative` writes a whole evening in seconds,
 *     keeping the original gaps between lines. Its timestamps are deliberately not the wall clock,
 *     and the whole point of `--relative` is that time-measuring features read the *log's* gaps.
 *
 * So: the log's clock, extrapolated. The last line's timestamp plus however long ago it arrived.
 * While the game is writing live that is `Date.now()` to the second; while a replay is being read
 * it stays anchored to the replay. `now()` is 0 until a line has been seen, which every caller
 * reads as "no idea", because that is what it is.
 *
 * Pure apart from the clock it's handed, which is a parameter for the same reason `nowIso` is one
 * in `combat-stats.ts` — a test can say what time it is.
 */

export interface LogClock {
  /** Fold in a line's timestamp. Anything unparseable is ignored rather than resetting the clock. */
  note(at: string): void;
  /** The log's clock now, in epoch ms — or 0 if no line has been seen yet. */
  now(): number;
}

export function createLogClock(realNow: () => number = () => Date.now()): LogClock {
  /** The newest log timestamp seen, and the reading of `realNow` when it turned up. */
  let at = 0;
  let seen = 0;

  return {
    note(stamp) {
      const ms = Date.parse(stamp);
      if (!Number.isFinite(ms)) return;
      // Newest wins rather than latest-arriving: a log's lines are in order, but the watcher also
      // re-reads a tail to recover the zone, and an older line must not wind the clock back.
      if (ms < at) return;
      at = ms;
      seen = realNow();
    },
    now: () => (at ? at + Math.max(0, realNow() - seen) : 0),
  };
}
