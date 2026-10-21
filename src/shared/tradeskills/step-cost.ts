/**
 * How many combines a guide step takes, how much of each material that is, and what it costs — an
 * estimate, stated as a range, from what the generator stored on the step (`step-plan.ts`).
 *
 * **Combines.** A combine raises a skill by at most one point, so a step across N points takes **at
 * least N combines** — a hard floor, not a guess. The ceiling is a guess, and grounded in the only
 * measurements there are, the guides' own:
 *
 * - Blacksmithing, at 370 STR: 41 combines for 68→92 (1.7 a point), 23 for 92→102 (2.3), 30 for
 *   102→115 (2.3); "about 50" metal bits for 1→21 (2.5).
 * - Tailoring, at 451 WIS: "approximately 234 combines" for 158→190 (7.3 a point).
 *
 * So `RATE_BANDS` puts the ceiling at 2.5 combines a point below 150 and 7.5 above, each the worst
 * the guides measured in that band. Lower INT/WIS/STR than those characters had will run past it;
 * the floor never moves.
 *
 * **Materials.** Each per-combine material times the combine range — a failed combine uses its
 * materials up too. A "Buy 3 File Mold" count is the whole step's and isn't multiplied.
 *
 * **Cost.** The step's per-combine cost (`StepCost`) times the combine range, plus the priced
 * whole-step purchases. Partial when anything in it has no price, and it says what.
 */
import type { Copper } from "../money";
import { formatCoins } from "../money";
import type { SkillSpan, StepCost, StepNeed, WikiPrice } from "./tradeskill-types";

/** Combines per skill point at the top of each band — the worst the guides measured there. */
export const RATE_BANDS: readonly { below: number; rate: number }[] = [
  { below: 150, rate: 2.5 },
  { below: Infinity, rate: 7.5 },
];

export interface Range {
  low: number;
  high: number;
}

/**
 * The fewest combines a span can take, and the most the measured rates suggest — scaled by `factor`,
 * how much slower (or faster) than the guides' characters you have actually been (`rateFactor`).
 */
export function combineRange(span: SkillSpan, factor = 1): Range {
  const points = Math.max(0, span.to - span.from);
  let high = 0;
  let at = span.from;
  for (const band of RATE_BANDS) {
    if (at >= span.to) break;
    const end = Math.min(span.to, band.below);
    if (end > at) {
      high += (end - at) * band.rate * factor;
      at = end;
    }
  }
  return { low: points, high: Math.max(points, Math.ceil(high)) };
}

export interface MaterialEstimate {
  name: string;
  /** How many, across the step. `low === high` for a whole-step purchase. */
  qty: Range;
  /** One of it, when the wiki prices it. */
  each?: Copper;
  /** Any one of these does instead (`StepNeed.alternatives`) — so holdings of them count too. */
  alternatives?: string[];
}

export interface StepEstimate {
  combines: Range;
  materials: MaterialEstimate[];
  /** The step's cost in copper, when anything in it is priced. */
  cost?: Range;
  /** Present when the cost leaves something out: those materials have no price on the wiki. */
  unpriced?: string[];
  /** How the per-combine figure was arrived at (`StepCost.how`), for the hover. */
  how?: StepCost["how"];
  /** The page a whole-combine cost came from. */
  source?: string;
}

/**
 * The estimate for one step. `undefined` without a span — a bullet with no skill range is an
 * instruction, not something repeated until it stops skilling up.
 */
export function estimateStep(
  span: SkillSpan | undefined | null,
  needs: readonly StepNeed[] | undefined,
  cost: StepCost | undefined | null,
  prices: Readonly<Record<string, WikiPrice>>,
  factor = 1,
): StepEstimate | undefined {
  if (!span || span.to <= span.from) return undefined;
  const combines = combineRange(span, factor);
  const materials = (needs ?? []).map((n): MaterialEstimate => {
    const qty = n.total ? { low: n.qty, high: n.qty } : { low: n.qty * combines.low, high: n.qty * combines.high };
    const each = prices[n.name]?.copper;
    const choice = n.alternatives?.length ? { alternatives: n.alternatives } : {};
    return each === undefined ? { name: n.name, qty, ...choice } : { name: n.name, qty, each, ...choice };
  });

  // Whole-step purchases are bought once, whatever the combine count.
  const totals = (needs ?? []).filter((n) => n.total);
  const fixed = totals.reduce((sum, n) => sum + (prices[n.name]?.copper ?? 0) * n.qty, 0);
  const unpriced = [...(cost?.unpriced ?? []), ...totals.filter((n) => !prices[n.name]).map((n) => n.name)];

  const out: StepEstimate = { combines, materials };
  if (cost || fixed > 0) {
    const per = cost?.copper ?? 0;
    out.cost = { low: per * combines.low + fixed, high: per * combines.high + fixed };
    if (cost) out.how = cost.how;
    if (cost?.source) out.source = cost.source;
  }
  if (out.cost && unpriced.length) out.unpriced = unpriced;
  return out;
}

/** "12–30", or "12" when both ends agree. */
export function rangeText(r: Range): string {
  return r.low === r.high ? `${r.low}` : `${r.low}–${r.high}`;
}

/**
 * Coin rounded the way the guides write it: platinum with a decimal under 100, whole platinum above,
 * and exact coin under one platinum ("5g 3s"). An estimate's precision shouldn't outrun its inputs.
 */
export function roughCoins(copper: Copper): string {
  if (copper < 1000) return formatCoins(copper);
  const pp = copper / 1000;
  return pp < 100 ? `${Number(pp.toFixed(1))}pp` : `${Math.round(pp).toLocaleString("en-US")}pp`;
}

/** A cost range in rough coin: "8.8pp–22.1pp". */
export function costText(r: Range): string {
  return r.low === r.high ? roughCoins(r.low) : `${roughCoins(r.low)}–${roughCoins(r.high)}`;
}

// ─── You, against the guide ─────────────────────────────────────────────────────────────────────

/**
 * Where a step stands for someone at `skill`:
 * - `done` — the step's recipe is trivial for you; it would raise nothing;
 * - `current` — you are inside it; `remaining` is the part still ahead;
 * - `ahead` — you haven't reached it;
 * - `unknown` — your log hasn't stated this skill.
 */
export type StepPlace =
  | { at: "done" }
  | { at: "current"; remaining: SkillSpan }
  | { at: "ahead" }
  | { at: "unknown" };

export function placeStep(span: SkillSpan | undefined | null, skill: number | undefined): StepPlace {
  if (skill === undefined || !span) return { at: "unknown" };
  if (skill >= span.to) return { at: "done" };
  if (skill >= span.from) return { at: "current", remaining: { from: skill, to: span.to } };
  return { at: "ahead" };
}

/**
 * How your measured pace compares with the model's over the same skills: 1 is the guides' pace,
 * 2 is twice the combines a point. `undefined` without enough skill-ups to mean anything.
 *
 * A ratio rather than your raw rate, because your rate was measured over *your* span: Blacksmithing
 * 2→60 says nothing directly about 150+, where everyone slows down — but if you ran at the guides'
 * pace below 150 you'll likely run at their pace above it too, and if you ran at twice it, twice.
 */
export function rateFactor(measured: { combines: number; points: number; from: number; to: number } | undefined, minPoints: number): number | undefined {
  if (!measured || measured.points < minPoints || measured.to <= measured.from) return undefined;
  const yours = measured.combines / measured.points;
  const model = combineRange({ from: measured.from, to: measured.to }).high / (measured.to - measured.from);
  return model > 0 ? yours / model : undefined;
}
