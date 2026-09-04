/**
 * game-clock.ts — the passage of time in Norrath, and nothing about how it reached us.
 *
 * `/time` only ever states an hour, once ("Game Time: Monday, October 23, 3175 - 6 PM") — never a
 * minute, and never a stream. A running clock is therefore extrapolated from the last hour it
 * reported and the game's own pace: documented as **20 game minutes per real minute** (so a 24-hour
 * game day takes 72 real minutes), carried by every EQ time reference
 * (wiki.project1999.com/Time, eqlwiki.com/Time). That figure is a *starting guess*, not a promise —
 * a fan server can and does run its own pace — so `DEFAULT_RATE` is only ever where a fresh install
 * starts. `learnRate` is what nudges it toward whatever this server actually runs, live, from how
 * far apart consecutive `/time` readings really turn out to be ([ADR 0188](../../specs/decisions/0188-the-clocks-pace-calibrates-itself.md)).
 *
 * Pure and stateless, like `log-clock.ts`: a test moves the "now" that drives it, and a caller (the
 * tracker) is the only thing that remembers the last reading and the currently learned rate.
 */

/** Game minutes per real millisecond — the documented 20-per-real-minute pace, and nothing more
 *  than a fresh install's starting guess (see the file header, and `learnRate`). */
export const DEFAULT_RATE = 20 / 60_000;

/** How far the learned rate may drift from the default before something has clearly gone wrong —
 *  a hard floor and ceiling around it (a quarter to 4×), so one freak sample can't send the clock
 *  running backwards or absurdly fast even before enough evidence has accumulated to trust it. */
const MIN_RATE = DEFAULT_RATE / 4;
const MAX_RATE = DEFAULT_RATE * 4;

/**
 * The gap between two consecutive `/time` readings worth learning from at all, in real ms.
 *
 * Below `MIN_LEARN_GAP_MS`, the hour's own truncation (up to 59 minutes either reading could be off
 * by) swamps the signal — two readings 7 seconds apart implying a rate 4000% off the default says
 * nothing about the server's pace, only that both readings landed in the same narrow slice of luck.
 * Above `MAX_LEARN_GAP_MS`, the two readings are more likely two different sittings than one
 * coherent stretch of play worth learning a pace from — restarting the app, logging off overnight,
 * or the log simply going quiet for a while.
 */
const MIN_LEARN_GAP_MS = 5_000;
const MAX_LEARN_GAP_MS = 60 * 60_000;

/** Keep a number inside `[lo, hi]`. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Minutes in a full game day (24 game hours). */
export const GAME_DAY_MINUTES = 24 * 60;

/** Classic EverQuest day/night split: dark from 6 PM to 6 AM, light the other half. */
const NIGHT_START_MINUTE = 18 * 60;
const DAY_START_MINUTE = 6 * 60;

/** The last `/time` reading: the hour it reported (0-23), and the real moment (ms) it said so. */
export interface GameClockAnchor {
  hour: number;
  sampledAtMs: number;
}

/** "6 PM" → 18, "12 AM" → 0, "12 PM" → 12. `hour12` is 1-12. */
export function to24Hour(hour12: number, ampm: "AM" | "PM"): number {
  const h = hour12 % 12; // 12 o'clock is hour 0 of its half
  return ampm === "PM" ? h + 12 : h;
}

/** Always in range, whatever's handed in — the one place the day wraps. */
function wrapMinutes(minutes: number): number {
  return ((minutes % GAME_DAY_MINUTES) + GAME_DAY_MINUTES) % GAME_DAY_MINUTES;
}

/**
 * Carry a known minute-of-day forward by `elapsedRealMs`, at `rate` game-minutes per real ms
 * (defaulting to the documented pace). Not clamped to whole minutes: a smooth, ticking clock is the
 * point of extrapolating rather than just re-showing the last hour `/time` reported.
 *
 * The one function both the tracker (from its `/time` anchor, at whatever rate it has learned) and a
 * renderer (from a `view()` it already fetched — `rate` included — plus its own elapsed time since)
 * use to move the clock forward. That's what lets a window tick the display locally, without asking
 * main again every second, while still reading the same clock either side of the IPC boundary.
 */
export function advanceGameMinutes(minutes: number, elapsedRealMs: number, rate: number = DEFAULT_RATE): number {
  return wrapMinutes(minutes + elapsedRealMs * rate);
}

/**
 * Minutes since game-midnight, right now — the anchor's hour, carried forward to `nowMs` at `rate`.
 *
 * `/time` truncates to the hour ("6 PM" could be anywhere from 6:00 to 6:59), so this starts
 * extrapolating from that hour's **midpoint** (`:30`) rather than its start
 * ([ADR 0187](../../specs/decisions/0187-the-clock-anchors-on-the-hours-midpoint.md)). A `:00`
 * anchor is a *guaranteed* lag of up to 59 minutes that never corrects itself before the next
 * reading; `:30` is the estimate that minimizes expected error given nothing narrower than the hour
 * to go on — at most 30 minutes off, in either direction, averaging zero.
 */
export function currentGameMinutes(anchor: GameClockAnchor, nowMs: number, rate: number = DEFAULT_RATE): number {
  return advanceGameMinutes(anchor.hour * 60 + 30, nowMs - anchor.sampledAtMs, rate);
}

/**
 * The game-minutes-per-real-ms pace this **pair** of readings implies, given the rate already
 * trusted going in — or null when the gap between them is too short or too long to say anything
 * reliable (`MIN_LEARN_GAP_MS` / `MAX_LEARN_GAP_MS`).
 *
 * `/time` only ever gives the *hour*, never the date, so a gap of more than 12 game-hours can't be
 * told apart from a shorter one that wrapped the other way by the hour alone — "3 AM" an hour after
 * "2 PM" almost certainly means the day rolled over, not that the clock ran backwards 11 hours.
 * `priorRate` is what resolves that: rather than always assuming the *shortest* possible gap, this
 * picks whichever whole number of game-days, added on top of the reported hour-of-day difference,
 * lands closest to what the prior rate already predicted for `elapsedRealMs`. A rate that's already
 * roughly right can disambiguate a much longer gap than the bare hour ever could; a badly wrong prior
 * could misread one, which is exactly why a single sample is never trusted very far — see
 * `learnRate`'s weighting.
 */
export function impliedRate(priorRate: number, prevHour: number, nextHour: number, elapsedRealMs: number): number | null {
  if (elapsedRealMs < MIN_LEARN_GAP_MS || elapsedRealMs > MAX_LEARN_GAP_MS) return null;
  const expected = elapsedRealMs * priorRate;
  const withinDay = wrapMinutes(nextHour * 60 - prevHour * 60); // 0..1439, the hour alone's own guess
  const days = Math.round((expected - withinDay) / GAME_DAY_MINUTES);
  const gameMinutes = withinDay + days * GAME_DAY_MINUTES;
  if (gameMinutes <= 0) return null; // never learn from an apparently backwards clock
  return gameMinutes / elapsedRealMs;
}

/**
 * Nudge the learned pace toward what this pair of readings implies — live, off the same comparison
 * `game-clock-tracker.ts` already logs for every `/time` line, now actually informing the next guess
 * instead of only reporting the gap ([ADR 0188](../../specs/decisions/0188-the-clocks-pace-calibrates-itself.md)).
 *
 * Weighted by how much real time separates the two readings: a gap of a few seconds is nearly pure
 * truncation noise and moves the estimate almost nothing, where the longest gap this trusts at all
 * can pull it halfway to what that one reading implied. That's deliberately not "all the way" — a
 * handful of consistent, reasonably-spaced readings converge in a session or two, rather than one
 * unlucky sample lurching the pace somewhere it doesn't belong. (A real one: four `/time` calls
 * fifteen seconds apart once showed the hour rolling over — technically a 12-minute-gap-sized
 * disagreement with the prior rate, but at `MIN_WEIGHT` it barely nudges anything, which is the
 * point.) Returns `priorRate` unchanged whenever `impliedRate` has nothing to say.
 */
const MIN_WEIGHT = 0.005;
const MAX_WEIGHT = 0.5;

export function learnRate(priorRate: number, prevHour: number, nextHour: number, elapsedRealMs: number): number {
  const implied = impliedRate(priorRate, prevHour, nextHour, elapsedRealMs);
  if (implied === null) return priorRate;
  const weight = clamp(elapsedRealMs / MAX_LEARN_GAP_MS, MIN_WEIGHT, MAX_WEIGHT);
  return clamp(priorRate + weight * (implied - priorRate), MIN_RATE, MAX_RATE);
}

/** Is it daylight at this minute of the game day? Classic split: dark 6 PM–6 AM, light the rest. */
export function isDaytime(minutes: number): boolean {
  const m = wrapMinutes(minutes);
  return m >= DAY_START_MINUTE && m < NIGHT_START_MINUTE;
}

/** "6:42 PM" — the game's own idiom, never the 24-hour clock nothing in EQ ever shows. */
export function formatGameClock(minutes: number): string {
  const total = Math.floor(wrapMinutes(minutes));
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const ampm = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * The shortest signed gap from `from` to `to`, in minutes, wrapping at the day boundary — how far
 * off (and which direction) one minute-of-day reading is from another. Always in `(-720, 720]`, so
 * "23:58 vs 00:02" reads as **+4**, not -1436.
 */
export function minuteDelta(from: number, to: number): number {
  const raw = wrapMinutes(to - from);
  return raw > GAME_DAY_MINUTES / 2 ? raw - GAME_DAY_MINUTES : raw;
}

/** Did the clock pass through `target` going from `prev` to `cur`? Handles the midnight wrap. */
export function crossedMinute(prev: number, cur: number, target: number): boolean {
  if (cur === prev) return false;
  if (cur > prev) return target > prev && target <= cur;
  return target > prev || target <= cur; // wrapped past midnight between the two readings
}

const CLOCK_INPUT_RE = /^(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])?$/;

/**
 * A player-typed time of day ("8pm", "8:30 PM", "20:00") → minutes since game-midnight, or null for
 * anything unreadable. Loose on purpose: an alarm is typed once and read back a hundred times, so the
 * box takes whatever shape a player naturally types rather than insisting on one.
 */
export function parseGameClockTime(input: string): number | null {
  const m = input.trim().match(CLOCK_INPUT_RE);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  if (minute > 59) return null;
  const ampm = m[3]?.toUpperCase() as "AM" | "PM" | undefined;
  if (ampm) {
    if (hour < 1 || hour > 12) return null;
    hour = to24Hour(hour, ampm);
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}
