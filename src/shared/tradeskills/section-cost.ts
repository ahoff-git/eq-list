/**
 * What finishing a guide section costs — the steps still ahead of you, priced as one run of skill
 * points rather than added up step by step (ADR 0304).
 *
 * Adding steps up double-counts, because a section often lists **alternatives**: Brewing's "1 to 31:
 * Short Beer" beside "1 to 151: Skull Ale", Baking's Wedding Cake and Birthday Cake over the same
 * span. So the total is built point by point: each skill point ahead is bought with the cheapest step
 * that covers it, at that point's combines (one at least; your pace's ceiling at most). A step chosen
 * for any point also brings its one-off purchases ("Buy 3 File Mold") once.
 *
 * A step with no price can't be chosen; points only unpriced steps cover are counted and named, so
 * "≈ 40–110pp" never quietly means "≈ 40–110pp for the half we could price".
 */
import type { Copper } from "../money";
import { RATE_BANDS, type Range } from "./step-cost";
import type { SkillSpan, StepCost, StepNeed, WikiPrice } from "./tradeskill-types";

/** One step as the section sees it: the part still ahead of you, and what it costs. */
export interface CostedStep {
  span: SkillSpan;
  /** Copper per combine, when anything about the step is priced. */
  perCombine?: Copper;
  /** Its one-off purchases, priced. */
  fixed: Copper;
  /** Materials it uses that have no price. */
  unpriced: readonly string[];
}

export interface SectionCost {
  cost: Range;
  /** Skill points ahead that a priced step covers. */
  pricedPoints: number;
  /** Skill points ahead that only unpriced steps cover. */
  unpricedPoints: number;
  /** Materials with no price among the steps chosen — the cost is a floor where these appear. */
  unpriced: string[];
  combines: Range;
}

/**
 * A step as the section reads it, from the part of its span still ahead and what the generator stored:
 * its per-combine cost, its whole-step purchases priced once, and what has no price.
 */
export function costedStep(
  span: SkillSpan,
  needs: readonly StepNeed[] | undefined,
  cost: StepCost | undefined | null,
  prices: Readonly<Record<string, WikiPrice>>,
): CostedStep {
  const totals = (needs ?? []).filter((n) => n.total);
  const fixed = totals.reduce((sum, n) => sum + (prices[n.name]?.copper ?? 0) * n.qty, 0);
  const unpriced = [...(cost?.unpriced ?? []), ...totals.filter((n) => !prices[n.name]).map((n) => n.name)];
  // A step that is all whole-step buys ("Buy 3 File Mold, 100 Small Piece of Ore") spends nothing per
  // combine — `stepCost` has no per-combine figure for it because there's nothing to price, not
  // because a price is missing. Unpriced, its priced buys would never reach the total.
  const allBought = totals.length > 0 && totals.length === (needs ?? []).length;
  return { span, perCombine: cost?.copper ?? (allBought ? 0 : undefined), fixed, unpriced };
}

/** Combines a point at the ceiling, at skill `p` and your pace. Unrounded: it's summed over points. */
function ceilingAt(p: number, factor: number): number {
  return (RATE_BANDS.find((b) => p < b.below) ?? RATE_BANDS[RATE_BANDS.length - 1]).rate * factor;
}

/** The section's cost to finish. `undefined` when no step ahead of you has a span. */
export function sectionCost(steps: readonly CostedStep[], factor = 1): SectionCost | undefined {
  const live = steps.filter((s) => s.span.to > s.span.from);
  if (!live.length) return undefined;
  const lo = Math.min(...live.map((s) => s.span.from));
  const hi = Math.max(...live.map((s) => s.span.to));
  let low = 0;
  let high = 0;
  let combinesLow = 0;
  let combinesHigh = 0;
  let pricedPoints = 0;
  let unpricedPoints = 0;
  const chosen = new Set<CostedStep>();
  for (let p = lo; p < hi; p++) {
    const covering = live.filter((s) => s.span.from <= p && p < s.span.to);
    if (!covering.length) continue;
    const ceiling = ceilingAt(p, factor);
    combinesLow += 1;
    combinesHigh += ceiling;
    const priced = covering.filter((s) => s.perCombine !== undefined);
    if (!priced.length) {
      unpricedPoints++;
      continue;
    }
    const best = priced.reduce((a, b) => (b.perCombine! < a.perCombine! ? b : a));
    chosen.add(best);
    pricedPoints++;
    low += best.perCombine!;
    high += best.perCombine! * ceiling;
  }
  const fixed = [...chosen].reduce((sum, s) => sum + s.fixed, 0);
  const unpriced = [...new Set([...chosen].flatMap((s) => s.unpriced))];
  return {
    cost: { low: Math.round(low + fixed), high: Math.round(high + fixed) },
    pricedPoints,
    unpricedPoints,
    unpriced,
    combines: { low: combinesLow, high: Math.ceil(combinesHigh) },
  };
}
