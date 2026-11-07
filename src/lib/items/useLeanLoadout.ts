"use client";
import { useEffect, useRef, useState } from "react";
import { createPlanCache, planKey } from "@/lib/items/plan-cache";
import type { Lean } from "@/shared/combat/headroom";
import { bisPlan, type BisInputs, type BisPlan } from "@/shared/items/bis-plan";
import type { BisOptions } from "@/shared/items/bis-options";
import { effectiveRun, solveGoalsAsync } from "@/shared/items/bis-goals";
import type { DerivedRate } from "@/shared/items/derived-stats";
import { LEAN_PRESET, leanSwap } from "@/shared/items/lean-loadout";
import { createLogger } from "@/shared/logging";

const log = createLogger("bis");

// Past this component, like the builder's own plans: leaving the Items tab and coming back is a lookup.
const leanCache = createPlanCache<Lean>();

/** What the builder planned from, and the plan it made — the damage-first plan is made from the same pool, beside it. */
export type LeanInputs = Omit<BisInputs, "options" | "weights"> & {
  weights: BisInputs["weights"];
  /** The options the main plan was made under (settled), whose melee model the damage-first plan keeps. */
  options: BisOptions;
  rates: readonly DerivedRate[];
  /** The plan for your goals — the other side of the swap. */
  plan: BisPlan;
};

/**
 * The damage-first plan set against the one for your goals ([ADR 0365](../../../specs/decisions/0365-winning-comfortably-suggests-trading-survivability-for-damage.md)),
 * for the status bar's swing suggestion — or undefined until it is made, and while `inputs` is null.
 *
 * It is the builder's **Melee damage** preset, solved and planned exactly as the goals are (the same search,
 * a plan at a time off the render, aborted when a newer ask supersedes it), and it starts only once the
 * main plan exists, so it never delays what you are looking at. While a newer one is being made the last
 * answer stands, as the page's goal search does — the pill doesn't blink out on every slider tick.
 */
export function useLeanLoadout(inputs: LeanInputs | null): Lean | undefined {
  const [, answered] = useState(0);
  const last = useRef<Lean | undefined>(undefined);
  const key = inputs
    ? planKey([inputs.rows, inputs.inventory, inputs.procSpells, inputs.plan], [inputs.criteria, inputs.weights, inputs.options, inputs.rates, inputs.closedZones && [...inputs.closedZones].sort()])
    : "";

  useEffect(() => {
    if (!inputs || leanCache.peek(key)) return;
    const abort = new AbortController();
    const started = performance.now();
    const { rows, inventory, criteria, weights, closedZones, procSpells, options, rates, plan } = inputs;
    const planFor = (w: BisInputs["weights"], melee: BisOptions["melee"]) => bisPlan({ rows, inventory, criteria, weights: w, closedZones, options: { ...options, melee }, procSpells });
    const run = effectiveRun((w, melee) => {
      const p = planFor(w, melee);
      return { total: p.loadout.total, stats: p.stats.loadout };
    }, rates);
    void solveGoalsAsync({ goals: LEAN_PRESET.goals, sheet: weights, melee: options.melee, rates, run }, abort.signal).then((outcome) => {
      if (!outcome) return log.debug("lean aborted", Math.round(performance.now() - started), "ms in");
      const swap = leanSwap(plan, planFor(outcome.weights, outcome.melee), rates);
      log.debug("lean", { ms: Math.round(performance.now() - started), solves: outcome.solves, swap });
      leanCache.set(key, swap);
      answered((n) => n + 1);
    });
    return () => abort.abort();
    // `key` is everything below by content, and the big inputs by identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const answer = inputs ? leanCache.peek(key) : undefined;
  if (answer || !inputs) last.current = answer;
  return answer ?? (inputs ? last.current : undefined);
}
