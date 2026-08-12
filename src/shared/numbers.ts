/**
 * numbers.ts — the two bits of arithmetic this app writes over and over.
 *
 * Neither is clever. Both were written out by hand more than twenty times, in three different
 * spellings, and that's the problem: `Math.round(x * 100) / 100` is the kind of line you read past
 * without checking, so a `* 100) / 10` typo is invisible, and the guard in front of a division is
 * either there or it isn't. Named once, a call site says what it *means* — a rate to one decimal —
 * instead of showing the trick that produces it.
 *
 * Pure and dependency-free, so the main process, the renderer and the scripts all use the same one.
 * Strings are [format.ts](./format.ts)'s job; these return numbers.
 */

/**
 * `n` rounded to `places` decimals.
 *
 * Stored numbers are rounded at the point they're computed rather than where they're shown, so a
 * `dps` in the fight history and the same `dps` in a tooltip can't disagree — and so the JSON on disk
 * doesn't carry sixteen digits of float noise.
 */
export function round(n: number, places = 0): number {
  const scale = 10 ** places;
  return Math.round(n * scale) / scale;
}

/**
 * `part / whole`, rounded to `places` — **0 when there's nothing to divide by.**
 *
 * The guard is the whole reason this exists. Every rate here has a denominator that can legitimately
 * be zero (no kills yet, no swings yet, a fight that lasted no measurable time), and `Infinity` or
 * `NaN` reaching a panel shows up as blank or `NaN%` rather than as the "nothing measured yet" it
 * actually is. Zero is the honest reading: a rate over no observations is no rate.
 *
 * When zero would be a *lie* — when it must read as "we never measured this" — use `over`.
 *
 * `places` is optional and **nothing is rounded without it**: a share of a fight is a fraction, and a
 * default of "whole numbers" would quietly turn every one of them into 0 or 1.
 */
export function ratio(part: number, whole: number, places?: number): number {
  if (!whole) return 0;
  const quotient = part / whole;
  return places === undefined ? quotient : round(quotient, places);
}

/**
 * `part / whole`, or `undefined` when there's nothing to divide by.
 *
 * The other reading of an empty denominator: a share of a total nobody knows isn't 0%, it's unknown,
 * and the caller renders it as a gap. The damage tree needs this — damage on your own side isn't in
 * the fight total, so a node made of it has no share of the fight rather than a zero one.
 */
export function over(part: number, whole: number | undefined): number | undefined {
  return whole ? part / whole : undefined;
}
