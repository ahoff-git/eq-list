/**
 * alert-schedule.ts — *when* a matched watch's alert should fire, and whether dying cancels it.
 *
 * [cast-alerts.ts](./cast-alerts.ts) answers "does this line concern me?"; this answers "and when
 * do I want to hear about it?". Kept apart because they're different questions with different
 * inputs: matching reads a log event against the whole watch list, scheduling reads one field of
 * the watch that already matched.
 *
 * An alert with no delay is a **warning** — "dispel, now" — and is the only thing watches could do
 * until now. Give a watch a delay and the same match becomes a **cue**: match your mez and sound 25
 * seconds later to mean "recast it", match a placeholder's death and sound at 8 minutes to mean
 * "it's back". That is the whole timer feature, borrowed from EQBuddy's `AlertDelaySeconds`, for the
 * price of one field — no timer subsystem and no spell catalog, because the watch list already says
 * what the player cares about.
 *
 * Two rules come with it, both learned the hard way over there:
 *
 *   - **Only the alert waits.** Everything else a matched line feeds — the meter, the kill log, the
 *     ledger — is updated the moment the line is read, or the app is lying about what it saw. This
 *     module is therefore reached *after* all of that, and delays nothing but the banner.
 *   - **A death cancels a short cue, not a long one.** "Recast mez" is noise once you're dead, but
 *     dying doesn't change when a mob pops. The split is the delay's own length
 *     (`COMBAT_CUE_WITHIN_SECONDS`) unless the watch says otherwise outright: a cue due inside a
 *     minute belongs to the fight you were in.
 *
 * Three more things a cue can say, all of which only mean anything once there *is* a wait: whether a
 * second match **restarts** it (a re-mez) or **queues** another (a second placeholder), how many
 * times it should **repeat** itself, and — in the watch, checked by the queue — what words should
 * **call it off**. The one rule this file enforces about the combination is that a repeat must be
 * stoppable, because a repeat nothing can end is the only setting here that could ruin an evening.
 *
 * No I/O, no state, no timers — the scheduling itself is `electron/alert-queue.ts`.
 */
import { formatDuration, parseDuration } from "./duration";
import type { CastWatch, WatchCondition } from "./types";

/** Unit conversions, named so a bare `1000` never has to be recognised for what it is. */
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

/**
 * The longest cue we'll hold, matching EQBuddy's cap. Long enough for any respawn a player would
 * cue by hand, short enough that a mistyped "300" (five minutes) can't sit there all evening. A
 * longer request is clamped rather than refused: firing *immediately* is the one outcome nobody
 * asking for a delay wants.
 */
export const MAX_DELAY_SECONDS = 30 * SECONDS_PER_MINUTE;

/**
 * A cue due within this long is a **combat cue** — a prompt about the fight you're in, which your
 * own death makes pointless (see `alertCue`). A minute is the honest line between the two kinds:
 * recast timers are tens of seconds, spawn timers are minutes.
 */
export const COMBAT_CUE_WITHIN_SECONDS = SECONDS_PER_MINUTE;

/** How many times over a watch may repeat itself. A runaway repeat is the one setting that could
 * make the overlay unusable, so the number is bounded rather than trusted. */
export const MAX_REPEAT = 20;

/**
 * A watch's delay in whole seconds — `0` for "fire now", `null` for text we can't read.
 *
 * The syntax itself is `parseDuration`'s, shared with the spawn timers' own field
 * ([ADR 0135](../../specs/decisions/0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md));
 * what belongs to a *cue* is the contract around it. **Seconds and minutes only**, so `5h` is
 * unreadable here rather than clamped down to something the player didn't ask for, and clamped to
 * `MAX_DELAY_SECONDS` — a cue is a thing the app means to say soon, and a timer measured in hours is
 * a fact about the world that belongs in `spawn-tracker.ts` instead.
 *
 * The watch stores what the player typed rather than a number, so the field can be corrected
 * mid-typing and "8m" still reads as "8m" when they come back to it. That makes this the one place
 * that knows a cue's *limits*, and the reason it's exported: Settings marks an unreadable delay by
 * asking the same question the scheduler will.
 */
export function parseDelay(text: string | null | undefined): number | null {
  return parseDuration(text, { units: ["s", "m"], max: MAX_DELAY_SECONDS });
}

/** Seconds as the shortest thing that reads back the same way — `""`, `45s`, `8m`, `1m 30s`. */
export const formatDelay = formatDuration;

/**
 * The same, from milliseconds — for the queue, which thinks in the units a timer takes. Here rather
 * than a division at the call site, so nothing outside this file has to know the factor.
 */
export function formatDelayMs(ms: number): string {
  return formatDelay(Math.round(ms / MS_PER_SECOND));
}

/**
 * The cancelling rows that can actually cancel: not blank, and not inverted.
 *
 * One definition because three places need the same answer and they must agree — the queue carries
 * these, `alertCue` counts them when deciding whether a repeat is safe, and the checker reports the
 * ones it dropped. An inverted cancel is refused rather than honoured: "stop unless the line says X"
 * would end the cue on the very next line (see `alert-queue.noteLine`).
 */
export function usableCancels(watch: Pick<CastWatch, "cancelWhen">): WatchCondition[] {
  return (watch.cancelWhen ?? []).filter((c) => !!c.text.trim() && !c.exclude);
}

/** Everything about *when* a matched watch speaks, and what stops it. */
export interface AlertCue {
  /** Milliseconds to hold the alert. `0` means raise it now, which is every watch by default. */
  delayMs: number;
  /** Drop this cue if the player dies. Always false with no wait — nothing to cancel. */
  cancelOnDeath: boolean;
  /** How many *extra* firings follow the first, one `delayMs` apart. 0 for almost every watch. */
  repeat: number;
  /** What a second match does while this one is still waiting (see `CastWatch.retrigger`). */
  retrigger: "restart" | "queue" | "ignore";
  /** Whether anything at all can stop this cue early — false makes a repeat worth refusing. */
  stoppable: boolean;
}

/**
 * The cue a watch asks for. Unreadable delay text fires immediately: a missed alert is the worse
 * failure of the two, which is the same call `matchCast` makes about an unparseable timestamp — and
 * Settings has already flagged the field, so the player isn't left guessing.
 *
 * A **repeat with no way to stop it** is refused here rather than in the UI, because it is the one
 * combination that can make the overlay unusable and the rule belongs with the other timing rules:
 * something has to be able to end it — a cancelling line, or a death that will cancel it.
 */
export function alertCue(
  watch: Pick<CastWatch, "delay" | "repeat" | "retrigger" | "cancelOnDeath" | "cancelWhen">,
): AlertCue {
  const seconds = parseDelay(watch.delay) ?? 0;
  const delayMs = seconds * MS_PER_SECOND;
  const cancelOnDeath = seconds > 0 && diesWithYou(watch.cancelOnDeath, seconds);
  const stoppable = cancelOnDeath || usableCancels(watch).length > 0;
  return {
    delayMs,
    cancelOnDeath,
    repeat: delayMs && stoppable ? Math.min(Math.max(Math.trunc(watch.repeat ?? 0), 0), MAX_REPEAT) : 0,
    retrigger: watch.retrigger ?? "restart",
    stoppable,
  };
}

/**
 * Does this cue die with you? `auto` reads it off the delay's own length — a cue due inside a minute
 * is about the fight you were in, and "recast it" is noise from a corpse, while a spawn timer doesn't
 * care that you died. The other two are for the cue the rule of thumb gets wrong.
 */
function diesWithYou(choice: CastWatch["cancelOnDeath"], seconds: number): boolean {
  if (choice === "always") return true;
  if (choice === "never") return false;
  return seconds <= COMBAT_CUE_WITHIN_SECONDS;
}
