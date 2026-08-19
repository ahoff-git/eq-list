/**
 * estimates.ts — the rules for a number the app **worked out** rather than read.
 *
 * Most of what this app knows, it inferred from a log that was never meant to tell it. A drop rate
 * from a handful of kills, a maximum hit-point total from what you survived, a respawn from the gaps
 * between two deaths — none of these is a fact the game states, and every one of them is a guess
 * with a shape. Three features arrived at that shape independently, which is why it is written down
 * here rather than a fourth time:
 *
 *   - [hp-estimate.ts](../../electron/hp-estimate.ts) — `atLeast` from damage you survived,
 *     `atMost` from what killed you, a `stated` figure that outranks both, a sample count, and
 *     **levelling** throwing the observations away
 *     ([ADR 0018](../../specs/decisions/0018-inferred-max-hit-points.md),
 *     [ADR 0031](../../specs/decisions/0031-an-inferred-bound-must-be-able-to-fall.md)).
 *   - [spawn-timers.ts](./spawn-timers.ts) — an upper bound from kill gaps and sightings, a lower
 *     bound from "it's not up yet", a typed figure that outranks both, a sample count, and a
 *     **difficulty change** throwing the observations away (ADRs 0092–0099).
 *   - [drop-truth.ts](./drop-truth.ts) — a rate that only leads once the sample is big enough, and
 *     says which source is speaking either way
 *     ([ADR 0025](../../specs/decisions/0025-observation-over-the-wiki.md)).
 *
 * The same five rules run through all three, and each is a *decision* rather than arithmetic —
 * which is why they are named functions with the reasoning attached rather than inline expressions:
 *
 *   1. **A bound only moves one way.** Evidence tightens it; nothing loosens it. Which means...
 *   2. **...an implausible observation is discarded, never clamped.** Against a figure that only
 *      moves one way, a clamped value is a wrong answer you can never take back, where a discarded
 *      one costs nothing but itself.
 *   3. **What the player said outranks what we worked out** — and never destroys it, so clearing an
 *      override restores the inference rather than leaving a blank.
 *   4. **A sample size is part of the figure.** "1 for 1" and "40 of 120" are not the same claim,
 *      and a display that shows them identically is lying by omission.
 *   5. **Sources that disagree are reported, not resolved.** Where two ends of the evidence cross,
 *      one is wrong — and which one is usually a fact about an evening the app did not attend.
 *
 * **Everything here works on plain numbers**, deliberately. Each caller already stores its evidence
 * in the shape its own domain wants — `atLeast`/`atMost` as bare fields, a sighting as
 * `{seconds, count}` — and a shared *record* type would have forced all of them to migrate what is
 * on disk to gain rules they can have for free. The rules are the reusable part; the bookkeeping
 * around them is nobody else's business.
 *
 * Pure, unit-agnostic, no clock. Hit points, seconds and copper are all just numbers here.
 */

/** Which way an observation constrains the truth. */
export type BoundSide =
  /** The truth is **at most** this. More evidence can only push it down. */
  | "upper"
  /** The truth is **at least** this. More evidence can only push it up. */
  | "lower";

/** What an observation has to fall inside to be worth keeping at all. */
export interface Plausible {
  min: number;
  max: number;
}

/**
 * Is this observation worth believing at all?
 *
 * The counterpart to `tighten`, and the reason it exists: a bound that only moves one way can never
 * recover from a bad value, so the check has to happen *before* the ratchet rather than being
 * corrected after it. Callers **discard** what fails — clamping would invent a number and then make
 * it permanent, which is the worst of both.
 */
export function plausible(value: number, range: Plausible): boolean {
  return Number.isFinite(value) && value >= range.min && value <= range.max;
}

/**
 * Fold an observation into a bound, keeping whichever is tighter.
 *
 * `undefined` means "nothing known yet", so the first observation is simply taken. Nothing here
 * checks plausibility — that is `plausible`'s job, and keeping them apart is what stops a caller
 * quietly ratcheting on a value it never vetted.
 */
export function tighten(current: number | undefined, next: number, side: BoundSide): number {
  if (current === undefined) return next;
  return side === "upper" ? Math.min(current, next) : Math.max(current, next);
}

/**
 * Have the two ends of the evidence crossed? Then one of them is wrong: the truth cannot be both at
 * most `upper` and at least `lower`.
 *
 * Callers are expected to **report** this rather than resolve it. Which side is wrong is usually a
 * judgement about something the app did not witness, and picking would mean silently discarding a
 * real observation — so the honest move is to say so and let the person who was there decide.
 */
export function contradicts(upper: number | undefined, lower: number | undefined): boolean {
  return upper !== undefined && lower !== undefined && lower >= upper;
}

/**
 * Does one source disagree with *itself* — its loosest observation far off its tightest?
 *
 * Not the same as `contradicts`, and the difference matters: crossing bounds means something is
 * **wrong**, while a wide spread means the figure is **soft**. A tight cluster is several
 * independent observations agreeing; a wide one means the tightest is probably still nowhere near
 * the truth, and a reader who is shown only the tightest will trust it far too much.
 */
export function disagrees(tightest: number, loosest: number | undefined, ratio: number): boolean {
  return loosest !== undefined && loosest > tightest * ratio;
}

/** How much a figure from this many observations is worth. */
export type Confidence =
  /** Nothing to go on. */
  | "none"
  /** One or two — a hint, and it must not be shown as a figure. */
  | "thin"
  /** Enough to lead with, still worth hedging. */
  | "fair"
  /** Enough that the sample is no longer the interesting part. */
  | "solid";

/**
 * Where a sample stops being an anecdote, and where it stops being worth hedging.
 *
 * Two numbers rather than one because the questions differ: "may this figure lead?" and "may it be
 * stated plainly?" `drop-truth.ts` has held exactly this pair (15 to lead, 25 to call a wiki claim
 * suspicious) since [ADR 0025](../../specs/decisions/0025-observation-over-the-wiki.md), and mob
 * knowledge a similar one (dim under 15, solid past 50).
 */
export interface SampleScale {
  /** At or above this, the figure may lead. */
  fair: number;
  /** At or above this, the sample size is no longer the interesting part. */
  solid: number;
}

/** How much to believe a figure resting on `samples` observations. */
export function confidenceOf(samples: number, scale: SampleScale): Confidence {
  if (samples <= 0) return "none";
  if (samples >= scale.solid) return "solid";
  return samples >= scale.fair ? "fair" : "thin";
}

/** A figure and whether the player supplied it — the answer `settle` gives. */
export interface Settled {
  value: number;
  /** True when this is what the player said, rather than what we worked out. */
  stated: boolean;
}

/**
 * Which figure to act on: what the player told us, or failing that what we inferred.
 *
 * A stated value wins outright and **nothing observed may overwrite it** — the rule EQBuddy keeps a
 * whole file for, and the one every inference here has needed. Just as important is what this does
 * *not* do: it takes the inference as an argument rather than replacing it, so a caller that keeps
 * both can clear an override and get its inference back rather than a blank
 * ([ADR 0056](../../specs/decisions/0056-a-dropped-record-keeps-what-it-taught.md)).
 *
 * A non-positive or unreadable stated value is treated as absent. Every quantity this app infers is
 * a magnitude — hit points, seconds, coin — and zero is how a cleared field arrives, not a claim.
 */
export function settle(stated: number | undefined, inferred: number | undefined): Settled | undefined {
  if (stated !== undefined && Number.isFinite(stated) && stated > 0) return { value: stated, stated: true };
  return inferred === undefined ? undefined : { value: inferred, stated: false };
}

/** One source's claim about a number, for `tightestOf`. */
export interface Claim<S> {
  value: number;
  /** Whatever the caller calls this source — it is passed through untouched. */
  source: S;
}

/**
 * The tightest claim among several sources, keeping **which source it was**.
 *
 * The provenance is the point. Two sources agreeing on 9 minutes is not the same as one guessing it,
 * and a reader has to be able to tell "seen up three times" from "from three kill gaps" because they
 * are worth different amounts. Ties go to the **first** claim given, so a caller orders its sources
 * by how much it trusts them and gets that for free.
 */
export function tightestOf<S>(claims: (Claim<S> | undefined)[], side: BoundSide = "upper"): Claim<S> | undefined {
  let best: Claim<S> | undefined;
  for (const claim of claims) {
    if (!claim) continue;
    if (!best) {
      best = claim;
      continue;
    }
    const better = side === "upper" ? claim.value < best.value : claim.value > best.value;
    if (better) best = claim;
  }
  return best;
}
