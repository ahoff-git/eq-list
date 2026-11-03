/**
 * bis-goals.ts — "2k HP and 100 AC, then the most melee damage" as sliders, not a weight sheet.
 *
 * The loadout builder ranks by weights, and weights are the wrong language for a quick ask: nobody
 * knows what an HP point is "worth". A goal says it the way a player thinks, per stat:
 *   - **priority** (0–100%): how much of the plan's drive goes into this stat, where 100% is the whole
 *     of what the best possible loadout for it alone could reach — so HP in the thousands and AC in the
 *     hundreds are comparable without anyone doing arithmetic;
 *   - **floor**: "at least this much" — an absolute number, or a percent of the most any loadout from
 *     the pool could reach ("near max mana" is 95%).
 *
 * This module turns goals into the ordinary weights the solver already understands, so the exact
 * assignment (`bis.ts`) is untouched. Floors are found by raising a stat's boost until the plan it
 * produces reaches the floor, then bisecting back down so no more is given up than needed.
 *
 * It never calls the solver itself: the caller hands in `run`, so this is pure and testable with a toy.
 * Every number it works with is read off the real plan, effective totals included (STA's HP, INT's mana).
 */
import { foldDerivedWeights, type DerivedRate } from "./derived-stats";
import { effectiveStats, type LoadoutStats } from "./loadout-stats";
import { STATS, type StatKey } from "./item-stats";
import type { StatWeights } from "./item-search";
import type { MeleeWeights } from "./melee";

/** Melee swing damage is a goal too — it isn't a stat on a card, but it's what "max melee damage" means. */
export type GoalKey = StatKey | "swing";

/** An absolute floor, or a percent (0–100) of the most the pool could reach. */
export type GoalTarget = { pct: number } | { min: number };

export interface StatGoal {
  /** 0–100: how much this stat drives the plan. Absent or 0 — it only matters if it has a floor. */
  priority?: number;
  /** "At least this much." Not available for `swing`, which has no total to hold. */
  floor?: GoalTarget;
}

export type BisGoals = Partial<Record<GoalKey, StatGoal>>;

export const NO_GOALS: BisGoals = {};

const STAT_KEYS: ReadonlySet<string> = new Set(STATS.map((s) => s.key));
const isGoalKey = (k: string): k is GoalKey => k === "swing" || STAT_KEYS.has(k);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Stored goals made whole: unknown stats, out-of-range numbers and empty goals are dropped. */
export function normalizeGoals(stored: unknown): BisGoals {
  const out: BisGoals = {};
  if (!stored || typeof stored !== "object") return out;
  for (const [key, raw] of Object.entries(stored as Record<string, unknown>)) {
    if (!isGoalKey(key) || !raw || typeof raw !== "object") continue;
    const g = raw as { priority?: unknown; floor?: unknown };
    const goal: StatGoal = {};
    if (typeof g.priority === "number" && g.priority > 0) goal.priority = clamp(Math.round(g.priority), 0, 100);
    const f = g.floor as { pct?: unknown; min?: unknown } | undefined;
    if (key !== "swing" && f && typeof f === "object") {
      if (typeof f.pct === "number" && f.pct > 0) goal.floor = { pct: clamp(Math.round(f.pct), 0, 100) };
      else if (typeof f.min === "number" && f.min > 0) goal.floor = { min: Math.round(f.min) };
    }
    if (goal.priority || goal.floor) out[key] = goal;
  }
  return out;
}

export const goalCount = (goals: BisGoals): number => Object.keys(goals).length;

/** The goals with one stat's changed — an empty goal removes the stat. */
export function withGoal(goals: BisGoals, key: GoalKey, change: Partial<StatGoal> | null): BisGoals {
  const next = { ...goals };
  const merged = change === null ? {} : { ...goals[key], ...change };
  const cleaned = normalizeGoals({ [key]: merged })[key];
  if (cleaned) next[key] = cleaned;
  else delete next[key];
  return next;
}

/** One-tap starting points. Each *replaces* the goals — the sliders refine from there. */
export interface GoalPreset {
  id: string;
  label: string;
  hint: string;
  goals: BisGoals;
}

export const GOAL_PRESETS: readonly GoalPreset[] = [
  { id: "tank", label: "Tank", hint: "HP and AC first", goals: { hp: { priority: 100 }, ac: { priority: 80 } } },
  { id: "melee", label: "Melee damage", hint: "The hardest swing, HP and AC kept respectable", goals: { swing: { priority: 100 }, hp: { floor: { pct: 70 } }, ac: { floor: { pct: 70 } } } },
  { id: "caster", label: "Caster", hint: "Mana first, HP kept respectable", goals: { mana: { priority: 100 }, hp: { floor: { pct: 70 } } } },
  { id: "tank-mana", label: "Tank, full mana", hint: "As tanky as possible while keeping 95% of the most mana", goals: { hp: { priority: 100 }, ac: { priority: 80 }, mana: { floor: { pct: 95 } } } },
];

// ── The solve ──

/** What one plan came to: its value under the weights it was given, and its stats (HP, mana, AC effective). */
export interface GoalRun {
  total: number;
  stats: LoadoutStats;
}

/** Plan a loadout under these weights and report it. The caller's one hook into the real solver. */
export type RunPlan = (weights: StatWeights, melee: MeleeWeights) => GoalRun;

export interface GoalInputs {
  goals: BisGoals;
  /** The player's own weight sheet, already folded with `rates` — the part of the ask that isn't a goal. */
  sheet: StatWeights;
  melee: MeleeWeights;
  rates: readonly DerivedRate[];
  run: RunPlan;
}

/** How one stat's goal came out. */
export interface GoalRow {
  key: GoalKey;
  /** The most any loadout from the pool reaches in this stat — what a percent floor and the slider are measured against. */
  max: number;
  /** The floor in stat points, held to what's reachable. */
  floor?: number;
  /** What the plan reaches (absent for `swing`). */
  got?: number;
  met: boolean;
  /** The floor asked for more than any loadout could give, so it was held to the max. */
  unreachable: boolean;
}

export interface GoalOutcome {
  /** The weights and melee weights to plan with — the player's own, untouched, when there are no goals. */
  weights: StatWeights;
  melee: MeleeWeights;
  rows: GoalRow[];
  /** Plans made, for the log. */
  solves: number;
}

/** A component's alone-value at its maximum is scaled to this, so rounding to 2 places never eats a weight. */
const UNIT = 10_000;
/** The boost a floor first gets, and the most it may reach (past this the stat already outweighs everything). */
const FIRST_BOOST = 0.25;
const MAX_BOOST = 1_024;
const SEARCH_ROUNDS = 14;
const REFINE_ROUNDS = 4;

interface Component {
  key: GoalKey | "sheet";
  weights: StatWeights;
  melee: MeleeWeights;
  /** Best value this component alone reaches, and its stat — the yardstick it is scaled by. */
  norm: number;
  max: number;
}

/** Each distinct plan is made once; `plan` hands control back after making a new one, so a caller can stop between. */
const memoized = (run: RunPlan) => {
  const seen = new Map<string, GoalRun>();
  return {
    *plan(w: StatWeights, m: MeleeWeights): Generator<void, GoalRun> {
      const key = JSON.stringify([w, m]);
      const known = seen.get(key);
      if (known) return known;
      const r = run(w, m);
      seen.set(key, r);
      yield;
      return r;
    },
    count: () => seen.size,
  };
};

const noMelee = (m: MeleeWeights): MeleeWeights => ({ ...m, damage: 0, procs: 0 });

/**
 * The search itself, as a generator that yields after every plan it makes — one body, driven to the
 * end at once by `solveGoals` or a plan at a time by `solveGoalsAsync`, which can stop between them.
 */
function* goalSearch(input: GoalInputs): Generator<void, GoalOutcome> {
  const { goals, sheet, melee, rates } = input;
  if (!goalCount(goals)) return { weights: sheet, melee, rows: [], solves: 0 };
  const planned = memoized(input.run);
  const total = (r: GoalRun, key: GoalKey) => (key === "swing" ? 0 : r.stats[key] ?? 0);

  // Each thing asked for, measured alone: what the best loadout for it is worth and reaches.
  const alone = function* (key: GoalKey | "sheet"): Generator<void, Component | undefined> {
    const weights = key === "sheet" ? sheet : key === "swing" ? {} : foldDerivedWeights({ [key]: 1 }, rates);
    const m = key === "sheet" ? melee : key === "swing" ? { ...noMelee(melee), damage: 1 } : noMelee(melee);
    const r = yield* planned.plan(weights, m);
    return r.total > 0 ? { key, weights, melee: m, norm: r.total, max: key === "sheet" ? r.total : total(r, key) } : undefined;
  };
  const sheetUsed = Object.keys(sheet).length > 0 || melee.damage !== 0 || melee.procs !== 0;
  const components = new Map<GoalKey | "sheet", Component>();
  for (const key of [...(sheetUsed ? (["sheet"] as const) : []), ...(Object.keys(goals) as GoalKey[])]) {
    const c = yield* alone(key);
    if (c) components.set(key, c);
  }

  // Floors, in stat points, held to what the pool can give.
  const floors = new Map<GoalKey, { want: number; max: number; unreachable: boolean }>();
  for (const [key, goal] of Object.entries(goals) as [GoalKey, StatGoal][]) {
    const c = components.get(key);
    if (!goal.floor || !c || key === "swing") continue;
    const asked = "pct" in goal.floor ? (goal.floor.pct / 100) * c.max : goal.floor.min;
    if (asked > 0) floors.set(key, { want: Math.min(asked, c.max), max: c.max, unreachable: asked > c.max + 0.5 });
  }

  // The plan under the sheet and priorities, plus a boost on each stat held to a floor.
  const blend = function* (boost: ReadonlyMap<GoalKey, number>): Generator<void, GoalRun & { weights: StatWeights; melee: MeleeWeights }> {
    const weights: StatWeights = {};
    const m: MeleeWeights = { ...melee, damage: 0, procs: 0 };
    for (const c of components.values()) {
      const coef = c.key === "sheet" ? 1 : (goals[c.key]?.priority ?? 0) / 100 + (boost.get(c.key) ?? 0);
      const scale = (coef * UNIT) / c.norm;
      if (!scale) continue;
      for (const [k, w] of Object.entries(c.weights) as [StatKey, number][]) weights[k] = (weights[k] ?? 0) + w * scale;
      m.damage += c.melee.damage * scale;
      m.procs += c.melee.procs * scale;
    }
    return { weights, melee: m, ...(yield* planned.plan(weights, m)) };
  };
  const unmet = (r: GoalRun) => [...floors].filter(([key, f]) => total(r, key) < f.want - 0.5).map(([key]) => key);

  // Raise the boost on whatever is still short until every floor holds…
  const boost = new Map<GoalKey, number>();
  let result = yield* blend(boost);
  for (let round = 0; round < SEARCH_ROUNDS; round++) {
    const short = unmet(result).filter((key) => (boost.get(key) ?? 0) < MAX_BOOST);
    if (!short.length) break;
    for (const key of short) boost.set(key, Math.min(MAX_BOOST, (boost.get(key) ?? 0) * 2 || FIRST_BOOST));
    result = yield* blend(boost);
  }
  // …then take back what wasn't needed, so a floor costs the objective as little as it can.
  if (!unmet(result).length) {
    for (const key of boost.keys()) {
      let hi = boost.get(key)!;
      let lo = hi > FIRST_BOOST ? hi / 2 : 0;
      for (let i = 0; i < REFINE_ROUNDS; i++) {
        const mid = (lo + hi) / 2;
        boost.set(key, mid);
        if (unmet(yield* blend(boost)).length) lo = mid;
        else hi = mid;
      }
      boost.set(key, hi);
    }
    result = yield* blend(boost);
  }

  const rows: GoalRow[] = (Object.keys(goals) as GoalKey[]).flatMap((key): GoalRow[] => {
    const c = components.get(key);
    // Nothing in the pool gives it: still a row, so the goal can say so instead of sitting silent.
    if (!c) return key === "swing" ? [] : [{ key, max: 0, got: 0, met: !goals[key]?.floor, unreachable: !!goals[key]?.floor }];
    const f = floors.get(key);
    const got = key === "swing" ? undefined : total(result, key);
    return [{ key, max: c.max, floor: f?.want, got, met: !f || got! >= f.want - 0.5, unreachable: f?.unreachable ?? false }];
  });
  return { weights: result.weights, melee: result.melee, rows, solves: planned.count() };
}

/** Every goal solved in one go — for tests and anything that can afford to wait. */
export function solveGoals(input: GoalInputs): GoalOutcome {
  const search = goalSearch(input);
  for (let step = search.next(); ; step = search.next()) if (step.done) return step.value;
}

/**
 * The same search, giving the thread back between plans so the page stays alive, and stopping the
 * moment `signal` aborts — a newer ask has made this one's answer worthless. Resolves `undefined` if
 * stopped.
 */
export async function solveGoalsAsync(input: GoalInputs, signal: AbortSignal): Promise<GoalOutcome | undefined> {
  const search = goalSearch(input);
  for (let step = search.next(); ; step = search.next()) {
    if (step.done) return step.value;
    await new Promise<void>((resume) => setTimeout(resume, 0));
    if (signal.aborted) return undefined;
  }
}

/**
 * Wrap the plan's report so `solveGoals` reads effective totals: HP, mana and AC with what attributes
 * add (`effectiveStats`), the same numbers the Stats section shows.
 */
export function effectiveRun(plan: (weights: StatWeights, melee: MeleeWeights) => { total: number; stats: LoadoutStats }, rates: readonly DerivedRate[]): RunPlan {
  return (w, m) => {
    const r = plan(w, m);
    return { total: r.total, stats: effectiveStats(r.stats, rates).total };
  };
}

