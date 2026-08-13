/**
 * alert-queue.ts — holds the alerts that asked to wait, and lets the log call them off.
 *
 * The "when" decision is [alert-schedule.ts](../src/shared/alert-schedule.ts), pure and tested; this
 * is the timer that carries it out plus the small amount of state that comes with holding something:
 * what's still waiting, so that
 *
 *   - a **death** drops the cues it makes pointless ("recast the mez" from a corpse),
 *   - a **line** drops the cues its own words cancel ("the mob is dead, stop reminding me"),
 *   - a **second match** restarts, queues alongside, or is ignored, as that watch asked,
 *   - and switching alerts off drops the lot.
 *
 * An alert with no delay — every watch, until one asks otherwise — is raised straight through with
 * no timer created at all, so the common path is exactly what it was before cues existed.
 *
 * A cue in flight belongs to the moment it matched: it keeps the payload it was scheduled with, and
 * editing or deleting the watch afterwards doesn't reach it. That's the same call `alertStyle`
 * already makes about a style — an alert reports what was true when the log said it. The one thing
 * read *late* is the cancelling words, which have to be, since the whole point is to notice
 * something that hasn't happened yet.
 */
import { alertCue, formatDelayMs, usableCancels } from "../src/shared/alert-schedule";
import { conditionMatches, type WatchSubject } from "../src/shared/watch-conditions";
import { createLogger } from "../src/shared/logging";
import type { CastAlertEvent, CastWatch, WatchCondition } from "../src/shared/types";

const log = createLogger("alert-queue");

/**
 * The timer pair cues are scheduled on. Injectable for one reason: a test of the 8-minute cue
 * shouldn't take 8 minutes.
 */
export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const NODE_TIMERS: Timers = {
  set: (fn, ms) => {
    const timer = setTimeout(fn, ms);
    // A cue must never be the reason the process is still up after the user asked it to quit.
    timer.unref?.();
    return timer;
  },
  clear: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

/** The parts of a watch a cue needs. Anything else about it was resolved into the alert already. */
export type CueWatch = Pick<
  CastWatch,
  "id" | "delay" | "repeat" | "retrigger" | "cancelOnDeath" | "cancelWhen"
>;

export interface AlertQueue {
  /** Raise this alert now, or hold it as long as its watch asked. */
  schedule(alert: CastAlertEvent, watch: CueWatch): void;
  /** The player died — drop the cues that were about the fight they were in. */
  noteDeath(): void;
  /** A line arrived — drop the cues whose own `cancelWhen` says this is the end of them. */
  noteLine(subject: WatchSubject): void;
  /** Is anything waiting on a line to cancel it? Lets the caller skip building a subject per line. */
  watchesLines(): boolean;
  /** Drop everything waiting (alerts were switched off, so there's nothing left to say). */
  clear(): void;
  /** How many cues are waiting. For the debug log, and for tests to see the holding happen. */
  pending(): number;
}

/** One alert being held: its timer, what would call it off, and how many firings are still owed. */
interface PendingCue {
  /** The watch that raised it, so a second match can find its own cue and restart it. */
  watchId: string;
  handle: unknown;
  cancelOnDeath: boolean;
  cancelWhen: WatchCondition[];
  /** Firings still to come after the next one. Counted down rather than up, so 0 ends it. */
  left: number;
  delayMs: number;
  alert: CastAlertEvent;
}

export function createAlertQueue(
  raise: (alert: CastAlertEvent) => void,
  timers: Timers = NODE_TIMERS,
): AlertQueue {
  const waiting = new Set<PendingCue>();

  const drop = (cue: PendingCue) => {
    timers.clear(cue.handle);
    waiting.delete(cue);
  };

  /** Say it, then re-arm if this cue still owes firings — a repeat is one alert that keeps coming back. */
  const fire = (cue: PendingCue) => {
    if (cue.left > 0) {
      cue.left -= 1;
      cue.handle = timers.set(() => fire(cue), cue.delayMs);
    } else {
      // Forgotten *before* it speaks, so `pending()` is right by the time the banner is up.
      waiting.delete(cue);
    }
    raise(cue.alert);
  };

  const arm = (cue: PendingCue) => {
    cue.handle = timers.set(() => fire(cue), cue.delayMs);
    waiting.add(cue);
  };

  /** Drop every cue the predicate claims, and say so once. Copied first: dropping mutates the set. */
  const dropWhere = (why: string, claims: (cue: PendingCue) => boolean) => {
    const doomed = [...waiting].filter(claims);
    if (!doomed.length) return;
    doomed.forEach(drop);
    log.debug(why, { cancelled: doomed.length, waiting: waiting.size });
  };

  return {
    schedule(alert, watch) {
      const cue = alertCue(watch);
      if (!cue.delayMs) {
        raise(alert);
        return;
      }
      // A second match of a watch that's already waiting: whichever of these the watch asked for,
      // it happens *before* the new cue is armed, so "restart" can't briefly hold two.
      const already = [...waiting].filter((c) => c.watchId === watch.id);
      if (already.length && cue.retrigger !== "queue") {
        if (cue.retrigger === "ignore") {
          log.debug("cue already waiting, second match ignored", { watch: watch.id });
          return;
        }
        already.forEach(drop);
      }
      arm({
        watchId: watch.id,
        handle: null,
        cancelOnDeath: cue.cancelOnDeath,
        cancelWhen: usableCancels(watch),
        left: cue.repeat,
        delayMs: cue.delayMs,
        alert,
      });
      log.debug("alert held as a cue", {
        spell: alert.spell,
        due: formatDelayMs(cue.delayMs),
        repeat: cue.repeat,
        cancelOnDeath: cue.cancelOnDeath,
        waiting: waiting.size,
      });
    },
    noteDeath() {
      dropWhere("death cancelled short cues", (cue) => cue.cancelOnDeath);
    },
    noteLine(subject) {
      // Any one of them ends it: several cancelling lines are alternatives ("it died" / "I re-cast
      // it"), never a checklist. `conditionMatches` rather than `conditionHolds`, so an inverted
      // condition can't turn into "cancel on the next line that isn't this".
      dropWhere("a line cancelled a waiting cue", (cue) =>
        cue.cancelWhen.some((c) => conditionMatches(c, subject)),
      );
    },
    watchesLines: () => [...waiting].some((cue) => cue.cancelWhen.length > 0),
    clear() {
      dropWhere("dropping every waiting cue", () => true);
    },
    pending: () => waiting.size,
  };
}
