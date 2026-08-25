/**
 * duration.ts — a length of time, as a person types it and as we print it back.
 *
 * One syntax, stated once: compound parts that add up (`1m30s` and `1m 30s` alike), a bare number
 * meaning seconds, and text we can't read **refused** rather than guessed at. What differs between
 * the features that ask is not the syntax but the **contract** — which units make sense and how long
 * is too long — so those are the arguments, and there is no second parser to drift from this one.
 *
 * Two callers, deliberately far apart in what they'll accept
 * ([ADR 0135](../../specs/decisions/0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)):
 * an **alert cue** takes seconds and minutes and clamps at thirty of them, because a cue that waits
 * an hour is not what anyone asking for one wanted; a **spawn timer** takes hours and days, because
 * a respawn is measured in hours and a raid lockout in days. Reusing the cue's parser for the timer
 * is exactly the bug this file exists to have prevented: a typed `4h` refused as unreadable and a
 * typed `240m` silently saved as 30m.
 *
 * `formatDuration` is the **inverse** — lossless, so whatever a field shows can be typed straight
 * back into it. That is its whole job, and why it isn't `formatInterval` next door in
 * `spawn-timers.ts`: that one rounds to whole minutes because a *figure* nobody camps to the second
 * reads better that way, which is the right call for something you read and the wrong one for
 * something you edit.
 */

/** How long each unit is. The letters are the syntax, so this table is also the grammar. */
export const UNIT_SECONDS = { d: 86400, h: 3600, m: 60, s: 1 } as const;

export type DurationUnit = keyof typeof UNIT_SECONDS;

/** Longest first, which is the order a duration is written and printed in. */
const ORDER: DurationUnit[] = ["d", "h", "m", "s"];

/** One part of a duration: `25`, `25s`, `8m`, `1.5m`, `4h`. A bare number is seconds. */
const PART_RE = /^(\d+(?:\.\d+)?)([a-z])?$/;

/**
 * Seconds from typed text — `0` for blank ("no wait at all"), `null` for text we couldn't read.
 *
 * `units` is what this caller accepts: a unit outside it is *unreadable* rather than converted, so a
 * feature that can't honour hours says so instead of quietly dropping the `h`. `max` clamps rather
 * than refuses, because a number too big is a number the player still meant — the opposite call from
 * unreadable text, where guessing would put a figure nobody typed somewhere it outranks observation.
 */
export function parseDuration(
  text: string | null | undefined,
  { units, max }: { units: DurationUnit[]; max: number },
): number | null {
  const compact = (text ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!compact) return 0;
  const parts = compact.match(/\d+(?:\.\d+)?[a-z]?/g);
  // Anything left over once the parts are removed is text we didn't understand — `8 minutes` is not
  // eight minutes with a comment after it, it's a sentence, and reading it as `8m` would be a guess.
  if (!parts || parts.join("") !== compact) return null;
  let seconds = 0;
  for (const part of parts) {
    const m = PART_RE.exec(part);
    if (!m) return null;
    const unit = (m[2] ?? "s") as DurationUnit;
    if (!units.includes(unit)) return null;
    seconds += Number(m[1]) * UNIT_SECONDS[unit];
  }
  if (!Number.isFinite(seconds)) return null;
  return Math.min(Math.round(seconds), max);
}

/**
 * Seconds as the shortest text that reads back the same way — `""`, `45s`, `1m 30s`, `3d 4h 22m`.
 *
 * Lossless to the second and zero parts omitted, so it round-trips through `parseDuration` for any
 * caller whose units cover the value. A caller whose ceiling excludes a unit can never be handed a
 * value that prints one.
 */
export function formatDuration(seconds: number): string {
  let rest = Math.max(0, Math.round(seconds));
  if (!rest) return "";
  const parts: string[] = [];
  for (const unit of ORDER) {
    const size = UNIT_SECONDS[unit];
    const n = Math.floor(rest / size);
    if (n) parts.push(`${n}${unit}`);
    rest -= n * size;
  }
  return parts.join(" ");
}
