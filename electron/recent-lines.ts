/**
 * recent-lines.ts — the last few thousand log lines, kept so a rule can be tested against them.
 *
 * Testing an alert rule against the game means playing until the thing happens, which for "a named
 * pops" is an evening. The lines have already gone past, though, so keeping a window of them turns
 * "wait and see" into an answer now (`dryRun` in `watch-check.ts`).
 *
 * A ring, not a log: this is a **debugging aid, not a record**, so it doesn't touch disk, doesn't
 * survive a restart, and forgets the oldest line without ceremony. `loot-log.ts` is what a kept
 * record looks like, and none of that machinery is wanted here.
 *
 * The cap is on **lines** rather than bytes because that's the unit the answer is quoted in — "no
 * match in the last 2000 lines" is a statement a player can weigh, where megabytes are not.
 */
import type { LogLine } from "../src/shared/types";

/**
 * How many lines to keep. A busy raid writes a few thousand lines an hour, so this is roughly the
 * last half-hour of real play — enough that a fade or a named's death is likely to be in it, small
 * enough (a few hundred KB) to hand to a renderer over IPC without thinking about it.
 */
export const RECENT_LINES = 2000;

/**
 * How much slack to let build up before trimming: at twice the cap, the oldest half goes in one cut.
 *
 * The alternative — dropping one line per line added — is a shift of the whole array on every one of
 * several thousand lines a minute, on the same thread as the watcher's poll. This makes the trim
 * amortised, at the cost of holding at most twice what we promise, which nobody can observe (`all`
 * never returns more than the cap).
 */
const SLACK = 2;

export interface RecentLines {
  add(line: LogLine): void;
  /** Oldest first, as the log wrote them. Optionally just the newest `count`. */
  all(count?: number): LogLine[];
  clear(): void;
  size(): number;
}

export function createRecentLines(cap: number = RECENT_LINES): RecentLines {
  let lines: LogLine[] = [];
  return {
    add(line) {
      lines.push(line);
      if (lines.length >= cap * SLACK) lines = lines.slice(-cap);
    },
    all: (count) => lines.slice(-(count ?? cap)),
    clear() {
      lines = [];
    },
    size: () => Math.min(lines.length, cap),
  };
}
