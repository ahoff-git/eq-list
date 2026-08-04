/**
 * What the log's tail says is true **now**, for an app that just started.
 *
 * The watcher deliberately anchors at the end of an existing log and never replays it: a line that
 * already happened is history, not news, and replaying it re-records every kill, re-counts the
 * experience and fires an alert for every spell you were ever cast at
 * ([ADR 0030](../../specs/decisions/0030-history-is-not-news.md)). The cost was that starting the
 * app mid-session left it not knowing *where you are* — the map had no zone, and every "here" panel
 * had nothing to scope to, until you happened to zone again.
 *
 * State and news are different things, and only two lines carry state: the zone you entered, and
 * your last `/loc`. Both describe the present rather than an event to react to, so they can be
 * recovered without replaying anything. Nothing else is: no kills, no loot, no experience, no casts.
 *
 * Pure, so what counts as recoverable state is decided in one tested place.
 */

import { parseLoc, parseZone } from "./log-parser";
import type { LocEvent, LogLine, ZoneEvent } from "./types";

/** The state a tail implies. Either may be absent — the tail may simply not reach back far enough. */
export interface CaughtUpState {
  zone?: ZoneEvent;
  loc?: LocEvent;
}

/**
 * Read state out of log lines, oldest first.
 *
 * A zone line **clears any position** read before it: a `/loc` from the zone you just left would
 * otherwise be plotted on the map of the zone you're in, which is worse than having no dot at all.
 * A position with no zone line before it is kept — no zoning happened within the tail, so it's a
 * fix for wherever you already were.
 */
/**
 * How recent the end of a replayed gap has to be for it to count as the sitting you're still in.
 *
 * Longer than restarting the app (or it recovering from a crash), shorter than any break you'd
 * describe as "later" — five minutes is comfortably both, and nothing about it needs to be precise:
 * it only decides whether the *live meter* keeps its running totals. Fights either side of the line
 * are recorded in history regardless.
 */
export const SAME_SITTING_MS = 5 * 60_000;

/**
 * Does a gap ending at `lastAt` belong to the session in progress?
 *
 * Restart the app mid-camp and the answer is yes: the meter carrying on is the whole point of not
 * changing between restarts. Come back the next evening and the answer is no — last night's fights
 * are history, and folding them into "this session" would misreport every rate on the panel.
 * An absent or unreadable timestamp means we can't claim continuity, so we don't.
 */
export function isSameSitting(lastAt: string | undefined, now: number = Date.now()): boolean {
  if (!lastAt) return false;
  const t = new Date(lastAt).getTime();
  return !Number.isNaN(t) && now - t <= SAME_SITTING_MS;
}

export function catchUpState(lines: LogLine[]): CaughtUpState {
  const state: CaughtUpState = {};
  for (const line of lines) {
    const zone = parseZone(line);
    if (zone) {
      state.zone = zone;
      state.loc = undefined;
      continue;
    }
    const loc = parseLoc(line);
    if (loc) state.loc = loc;
  }
  return state;
}
