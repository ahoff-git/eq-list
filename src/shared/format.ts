/**
 * format.ts — turning numbers and timestamps into the strings the panels show.
 *
 * These were copied between components: `clock` existed three times (twice identically, once with
 * seconds), and `mins` existed twice **with the same name and different output** — one dropped the
 * seconds, the other kept them, so the same call read `5m` in one panel and `5m 30s` in another. That's
 * the shape of duplication worth catching: not the wasted lines, but two functions one name apart that
 * quietly disagree.
 *
 * Pure and dependency-free, like `money.ts` next door. Locale formatting is the browser's, so what a
 * time looks like is the user's business, not ours.
 */

/** What an unparseable or missing value shows as — never a blank, so a gap reads as a gap. */
const NOTHING = "—";

/**
 * A timestamp, formatted, or `—` when it isn't one.
 *
 * **The guard is the point.** Four tooltips used to call `new Date(iso).toLocaleString()` straight, which
 * renders the literal string `"Invalid Date"` for a stored timestamp that's missing or corrupt — so the
 * same bad value read as `—` in the list and `Invalid Date` in the tooltip beside it. One guarded core,
 * three shapes over it.
 */
function stamp(iso: string, opts: Intl.DateTimeFormatOptions): string {
  const at = new Date(iso);
  return isNaN(at.getTime()) ? NOTHING : at.toLocaleString(undefined, opts);
}

/**
 * A wall-clock time: `4:12 PM`, or `4:12:30 PM` with `seconds`.
 *
 * The log's own clock counts whole seconds, so the seconds are real when asked for — a damage history
 * wants them (two hits a second apart are two events), a kill list doesn't (a camp is minutes long).
 */
export function clock(iso: string, opts?: { seconds?: boolean }): string {
  return stamp(iso, { hour: "numeric", minute: "2-digit", ...(opts?.seconds ? { second: "2-digit" } : {}) });
}

/** A time with the day beside it — `11 Aug, 4:12 PM` — for a list spanning more than today. */
export function dayTime(iso: string): string {
  return stamp(iso, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The whole timestamp, locale's choice of layout. For a hover that answers "exactly when?". */
export function when(iso: string): string {
  return stamp(iso, {});
}

/**
 * An EQ position as text — `1234, -567`, y first and rounded, the way the game and the wiki both
 * write it.
 *
 * Rounded because every coordinate we show is an *estimate* — a roam centre averaged from kills, a
 * position inferred between two `/loc`s — and a decimal on a figure that carries a `±30` beside it
 * claims a precision nothing here has. Y first is not a preference: it's the order EQ prints, so a
 * player can read it straight into `/waypoint` or compare it with a wiki `Location:` line.
 */
export function locText(loc: { y: number; x: number }): string {
  return `${Math.round(loc.y)}, ${Math.round(loc.x)}`;
}

/**
 * A span of seconds, as long as it needs to be: `45s`, `5m`, or `5m 30s` with `seconds`.
 *
 * Under a minute it's always seconds — `0m` says nothing. Callers pass whole seconds (`durationSec`
 * is rounded where it's measured), so there's no rounding to argue about here.
 */
export function duration(sec: number, opts?: { seconds?: boolean }): string {
  const m = Math.floor(sec / 60);
  if (m <= 0) return `${sec}s`;
  return opts?.seconds ? `${m}m ${sec % 60}s` : `${m}m`;
}

/**
 * A number for reading, or `—` when there's nothing to show.
 *
 * Zero and absence are the same thing in a tally — no damage dealt, nothing healed — and a column of
 * `0`s reads as measurements taken rather than the blanks they are. The rule was written out four times
 * in one table alone.
 */
export function figure(n: number | undefined | null): string {
  return n ? n.toLocaleString() : NOTHING;
}

/**
 * A tally with its noun, pluralized: `count(1, "kill")` → `1 kill`, `count(3, "kill")` → `3 kills`.
 *
 * The rule is one line, and it was written out as `${n} thing${n === 1 ? "" : "s"}` in twenty-odd
 * places — a fact about English restated once per panel, and each restatement a chance to get a
 * count of nothing wrong. Irregular wording passes its own plural: `count(n, "mob is", "mobs are")`.
 */
export function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * How many of how many, when a filter is narrowing a list: `12 of 340 drops`, or plainly
 * `340 drops` when nothing is hidden.
 *
 * The "of" only appears when it means something. A list that always said "340 of 340" would spend
 * its words saying nothing, and one that said "12 drops" while hiding 328 would be a lie of
 * omission — which is why both panels that filter a ledger reached for this shape independently.
 */
export function countOf(shown: number, total: number, singular: string, plural?: string): string {
  const all = count(total, singular, plural);
  return shown === total ? all : `${shown} of ${all}`;
}

/**
 * A fraction as a percentage: `0.372` → `37%`, or `37.2%` with `places: 1`.
 *
 * Takes the **fraction**, not the percentage, so it composes with
 * [`ratio`](./numbers.ts) — `percent(ratio(hits, swings))` — and there's one place where the
 * ×100 happens. It was written inline a dozen times, half as `Math.round(x * 100)` and half as
 * `(x * 100).toFixed(0)`, which are two answers to "what is 0.5 of a percent" living in one app.
 *
 * Zero prints as `0%`: unlike a tally, a measured nothing is a real reading. Only an absent or
 * non-finite value is a gap — which is what an unguarded division used to put on screen as `NaN%`.
 */
export function percent(fraction: number | undefined | null, opts?: { places?: number }): string {
  if (fraction == null || !Number.isFinite(fraction)) return NOTHING;
  return `${(fraction * 100).toFixed(opts?.places ?? 0)}%`;
}
