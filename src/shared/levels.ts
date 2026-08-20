/**
 * levels.ts — what level a mob is, when the honest answer is "somewhere between".
 *
 * Almost every other figure this app infers has one true value it is circling: your maximum hit
 * points, a respawn timer, a drop rate. **A mob's level does not.** "a gnoll pup" is not level 5;
 * the gnoll pups in that camp are levels 4 to 6, and the wiki writes exactly that — `Level: 33-37`,
 * `Level: 9 - 11`. So the thing being estimated is a *range*, and the arithmetic runs the opposite
 * way to everything in `estimates.ts`: a level you have actually seen is inside the range by
 * definition, so evidence **widens** the bounds (`widen`) rather than tightening them.
 *
 * Everything else about a mushy figure still applies unchanged, and that is the argument for
 * `estimates.ts` holding rules rather than helpers:
 *
 *   - a bound still only moves one way — outward, here — so an implausible observation is still
 *     **discarded rather than clamped**, since a single bad level would widen the range for good;
 *   - the **sample count is part of the figure**: "level 12" from one consider and "12–17" from
 *     forty are not the same claim, and a reader shown only the numbers can't tell;
 *   - sources that disagree are **reported, not resolved** — a wiki range and an observed one that
 *     don't overlap are two claims about different servers, patches or difficulty tiers, and
 *     picking a winner would throw away the interesting half.
 *
 * Pure and DOM-free. It knows nothing about where a level was read; the parser hands it a number.
 */
import { plausible, widen, type Plausible } from "./estimates";

/**
 * What a level may be before it stops being a level.
 *
 * Wide on purpose. The point is to reject something that could only be a misparse or a lie — a
 * negative, a zero, a number with four digits in it — not to encode a level cap this app has no
 * business knowing. A cap that turned out to be wrong (a raised one, an unusual mob) would silently
 * discard real observations, which is a far worse failure than admitting an absurd one and having a
 * person notice it.
 */
export const LEVEL_PLAUSIBLE: Plausible = { min: 1, max: 200 };

/** The levels one mob has been seen at: the span, and how many sightings are behind it. */
export interface LevelRange {
  /** Lowest level seen. */
  low: number;
  /** Highest level seen. */
  high: number;
  /** Considers behind it. One is a data point; forty is a range. */
  samples: number;
}

/**
 * Fold one observed level into a range.
 *
 * Returns the range **unchanged** when the level is implausible, so a caller can assign the result
 * unconditionally without a bad reading ever reaching the bounds. `undefined` in is the first
 * sighting; `undefined` out means there was nothing worth recording.
 */
export function observeLevel(range: LevelRange | undefined, level: number): LevelRange | undefined {
  if (!plausible(level, LEVEL_PLAUSIBLE)) return range;
  return {
    low: widen(range?.low, level, "lower"),
    high: widen(range?.high, level, "upper"),
    samples: (range?.samples ?? 0) + 1,
  };
}

/**
 * Pool two observers' ranges.
 *
 * Addition for the samples and coverage for the bounds — the same shape as pooling drop counts, and
 * for the same reason: six players' considers of the same camp describe its spread better than one
 * player's, and a range that covers both is the only answer that can't exclude a level somebody
 * actually saw. It is also why a **peer's** range is worth having even though it can't be checked:
 * the worst a wrong one can do is make a range too wide, which reads as "we're not sure", not as a
 * confident wrong number.
 */
export function mergeLevels(a: LevelRange | undefined, b: LevelRange | undefined): LevelRange | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    low: Math.min(a.low, b.low),
    high: Math.max(a.high, b.high),
    samples: a.samples + b.samples,
  };
}

/** A range in words: one level, or a span. */
export function levelText(range: LevelRange): string {
  return range.low === range.high ? `${range.low}` : `${range.low}–${range.high}`;
}

/**
 * How much to say about a range, given how little may be behind it.
 *
 * A single consider tells you a level that mob *can* be and nothing whatever about the spread, so it
 * must not be shown as a range — the hedge belongs in the wording, not in a footnote nobody reads.
 */
export function levelWhy(range: LevelRange): string {
  if (range.samples <= 1) return `Seen at level ${range.low} once — its range could be wider.`;
  if (range.low === range.high) return `Seen at level ${range.low}, ${range.samples} times.`;
  return `Seen between levels ${range.low} and ${range.high}, over ${range.samples} considers.`;
}

/** A claimed range, as the wiki states it. Both ends, even when the page gives one number. */
export interface LevelClaim {
  low: number;
  high: number;
}

/**
 * The wiki's own wording for a mob's level, as it appears on a mob page's stat card.
 *
 * Three shapes on real pages — `Level: 30`, `Level: 33-37`, `Level: 9 - 11` — which is a hyphen with
 * or without spaces, and a single number meaning a range of one. The card is kept as free text
 * (`parseMobCard` keeps "Label: value" rows verbatim), so this reads it back rather than the page
 * being parsed twice.
 *
 * Both ends are vetted before either is believed: a page that says `Level: 0` or `Level: 1-9999` is
 * a page nobody should be reconciled against, and a half-plausible claim is no claim.
 */
export function parseLevelClaim(text: string): LevelClaim | undefined {
  const m = /\blevels?\s*:\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?/i.exec(text);
  if (!m) return undefined;
  const low = Number(m[1]);
  const high = m[2] === undefined ? low : Number(m[2]);
  if (!plausible(low, LEVEL_PLAUSIBLE) || !plausible(high, LEVEL_PLAUSIBLE)) return undefined;
  // A page that writes its range backwards is describing the same span; nothing else can be meant.
  return low <= high ? { low, high } : { low: high, high: low };
}

/**
 * Do an observed range and a claimed one describe the same mob?
 *
 * **Overlap, not equality**, and deliberately generous: our range is built from however many
 * considers happened to be typed, so it is almost always narrower than the truth, and demanding it
 * match the wiki's would flag every mob nobody has conned forty times. What is worth flagging is the
 * case where the two ranges do not touch at all — that is not a small sample, it's a disagreement
 * about which mob this is, or about which server the wiki was describing.
 *
 * Reported, never resolved (`estimates.ts` rule 5): which one is wrong is a fact about a patch this
 * app did not attend.
 */
export function levelsAgree(observed: LevelRange, claimed: LevelClaim): boolean {
  return observed.low <= claimed.high && claimed.low <= observed.high;
}
