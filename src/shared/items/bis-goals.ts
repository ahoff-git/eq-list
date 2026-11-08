/**
 * bis-goals.ts — "2k HP and 100 AC, then the most melee damage" as sliders, not a weight sheet.
 *
 * The loadout builder ranks by weights, and weights are the wrong language for a quick ask: nobody
 * knows what an HP point is "worth". A goal says it the way a player thinks, per stat:
 *   - **priority** (0–100%): how much of the plan's drive goes into this stat, where 100% is the whole
 *     of what the best possible loadout for it alone could reach — so HP in the thousands and AC in the
 *     hundreds are comparable without anyone doing arithmetic;
 *   - **floor**: "at least this much" — an absolute number, or a percent of the most any loadout from
 *     the pool could reach ("near max mana" is 95%). A floor can also be *enough*: held to, and then the
 *     stat stops counting, so a Wizard's 6k mana doesn't become 8k at the cost of their survivability.
 *
 * This module turns goals into the ordinary weights the solver already understands, so the exact
 * assignment (`bis.ts`) is untouched. Floors are found by raising a stat's boost until the plan it
 * produces reaches the floor, then bisecting back down so no more is given up than needed.
 *
 * It never calls the solver itself: the caller hands in `run`, so this is pure and testable with a toy.
 * Every number it works with is read off the real plan, effective totals included (STA's HP, INT's mana).
 * A floor and the figures reported against it are in the game's own numbers: given the character's `base`
 * beyond gear, the gear is only asked for what the base leaves (ADR 0366).
 */
import { foldDerivedWeights, withoutDerivedWeight, type DerivedRate } from "./derived-stats";
import { effectiveStats, type LoadoutStats } from "./loadout-stats";
import { STATS, type StatKey } from "./item-stats";
import type { StatWeights } from "./item-search";
import type { MeleeWeights } from "./melee";
import { ATTRIBUTES } from "./character-base";
import { isCalibrated, type Calibration, type StatTotals } from "./stat-base";

/**
 * Melee swing damage is a goal too — it isn't a stat on a card, but it's what "max melee damage" means.
 * So is `rest`, "everything else that would help": a priority only, spread over the survival stats that
 * no other goal has spoken for (ADR 0359).
 */
export type GoalKey = StatKey | "swing" | "rest";
/** The goals that are one thing to plan for alone — `rest` is a share of several. */
type SingleGoal = StatKey | "swing";

/** Goals that are only a priority: nothing to hold a floor under. */
export const priorityOnly = (key: GoalKey): key is "swing" | "rest" => key === "swing" || key === "rest";

/** An absolute floor, or a percent (0–100) of the most the pool could reach. */
export type GoalTarget = { pct: number } | { min: number };

export interface StatGoal {
  /** 0–100: how much this stat drives the plan. Absent or 0 — it only matters if it has a floor. */
  priority?: number;
  /** "At least this much." Not available for `swing` or `rest`, which have no total to hold. */
  floor?: GoalTarget;
  /**
   * The floor is a requirement, not an objective (ADR 0359): past it the stat counts for nothing — not its
   * priority, not its weight on your sheet — so the plan spends what's left on everything else. Only
   * meaningful with a floor; without one there is nothing to stop at.
   */
  enough?: true;
}

export type BisGoals = Partial<Record<GoalKey, StatGoal>>;

export const NO_GOALS: BisGoals = {};

const STAT_KEYS: ReadonlySet<string> = new Set(STATS.map((s) => s.key));
const isGoalKey = (k: string): k is GoalKey => k === "swing" || k === "rest" || STAT_KEYS.has(k);
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Stored goals made whole: unknown stats, out-of-range numbers and empty goals are dropped. */
export function normalizeGoals(stored: unknown): BisGoals {
  const out: BisGoals = {};
  if (!stored || typeof stored !== "object") return out;
  for (const [key, raw] of Object.entries(stored as Record<string, unknown>)) {
    if (!isGoalKey(key) || !raw || typeof raw !== "object") continue;
    const g = raw as { priority?: unknown; floor?: unknown; enough?: unknown };
    const goal: StatGoal = {};
    if (typeof g.priority === "number" && g.priority > 0) goal.priority = clamp(Math.round(g.priority), 0, 100);
    const f = g.floor as { pct?: unknown; min?: unknown } | undefined;
    if (!priorityOnly(key) && f && typeof f === "object") {
      if (typeof f.pct === "number" && f.pct > 0) goal.floor = { pct: clamp(Math.round(f.pct), 0, 100) };
      else if (typeof f.min === "number" && f.min > 0) goal.floor = { min: Math.round(f.min) };
    }
    // Stopping at a floor that isn't there means nothing, so clearing the floor clears the stop with it.
    if (g.enough === true && goal.floor) goal.enough = true;
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

/**
 * Goals whose stat is partly made of attributes (HP from STA, mana from INT/WIS) but that have no rate
 * to fold — no class is ticked, so nothing says which attributes feed the pool. The plan still runs, on
 * the printed HP/mana alone, which is why the page says so rather than letting it look complete.
 */
export function goalsWithoutPools(goals: BisGoals, rates: readonly DerivedRate[]): GoalKey[] {
  return (["hp", "mana"] as const).filter((key) => goals[key] && !rates.some((r) => r.to === key));
}

/**
 * Floors on a stat the character starts with some of — an attribute, or a pool attributes buy — when no
 * race is known (no rate has a base). The floor is in the game's numbers, but only gear can be counted
 * toward it, so the page says to tick a race rather than let a short total pass for the game's. A pool
 * the player has typed the game's figure for is covered already: that figure holds the base too.
 */
export function goalsWithoutBase(goals: BisGoals, rates: readonly DerivedRate[], calibration: Calibration = {}): StatKey[] {
  if (rates.some((r) => r.base !== undefined)) return [];
  const starts = (key: StatKey) => (isCalibrated(key) && !calibration[key]) || (ATTRIBUTES as readonly string[]).includes(key);
  return (Object.keys(goals) as GoalKey[]).filter((key): key is StatKey => !priorityOnly(key) && starts(key) && !!goals[key]?.floor);
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
  /**
   * What the character has beyond gear (`stat-base.ts`, ADR 0366). A floor is in the game's own numbers,
   * so the gear is asked only for what the base leaves — and `GoalRow` reports the whole.
   */
  base?: StatTotals;
}

/** How one stat's goal came out — in the game's own numbers, the base beyond gear included. */
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
  /** How much of `max` and `got` is the character's own, not gear's — absent when none is counted. */
  base?: number;
}

export interface GoalOutcome {
  /** The weights and melee weights to plan with — the player's own, untouched, when there are no goals. */
  weights: StatWeights;
  melee: MeleeWeights;
  rows: GoalRow[];
  /**
   * Does anything beyond the floors steer the plan — your sheet, a priority, melee damage? When not, the
   * floors are met and everything past them is a tie the solver breaks arbitrarily, which the page says.
   */
  driven: boolean;
  /** Plans made, for the log. */
  solves: number;
}

/** A component's alone-value at its maximum is scaled to this, so rounding to 2 places never eats a weight. */
const UNIT = 10_000;
/** The boost a floor first gets, and the most it may reach (past this the stat already outweighs everything). */
const FIRST_BOOST = 0.25;
const MAX_BOOST = 1_024;
// Generous because a hopeless pair of floors costs only its own time, and a feasible one can need many
// small steps; the shortfall does not fall steadily, so cutting a stalled search short loses real answers.
const SEARCH_ROUNDS = 60;
/** The gentlest raise a floor gets when bigger ones keep breaking another floor. */
const MIN_STEP = 1.04;
const REFINE_ROUNDS = 4;

/**
 * What "everything else that would help" means: what keeps you alive, keeps you casting if your classes
 * do, and keeps you fighting (endurance, ADR 0360). Attributes and weapon numbers are not in it —
 * attributes already count through the HP, mana, endurance and AC they buy, and the rest is a choice
 * only you can make.
 */
const SURVIVAL: readonly StatKey[] = ["hp", "ac", "end", "hpRegen", "mana", "manaRegen", ...STATS.filter((s) => s.group === "resist").map((s) => s.key)];
const CASTING: ReadonlySet<StatKey> = new Set(["mana", "manaRegen"]);

interface Component {
  key: SingleGoal | "sheet";
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
  const { goals, melee, rates } = input;
  if (!goalCount(goals)) return { weights: input.sheet, melee, rows: [], driven: true, solves: 0 };
  const planned = memoized(input.run);
  const total = (r: GoalRun, key: SingleGoal) => (key === "swing" ? 0 : r.stats[key] ?? 0);
  const asked = (Object.keys(goals) as GoalKey[]).filter((key): key is SingleGoal => key !== "rest");

  // A stat held "enough" is a requirement and nothing more: its priority and its place on your sheet both
  // go, so the plan spends what the floor leaves on everything else instead of on more of this.
  const enoughStats = asked.filter((key): key is StatKey => key !== "swing" && !!goals[key]?.enough && !!goals[key]?.floor);
  const enough: ReadonlySet<SingleGoal> = new Set(enoughStats);
  const sheet = enoughStats.reduce((w, key) => withoutDerivedWeight(w, key, rates), input.sheet);

  // "Everything else": the survival stats nobody has had a say on, each measured alone like any goal.
  const casts = rates.some((r) => r.to === "mana");
  const restStats = goals.rest ? SURVIVAL.filter((key) => !goals[key] && (casts || !CASTING.has(key))) : [];

  // Each thing asked for, measured alone: what the best loadout for it is worth and reaches.
  const alone = function* (key: SingleGoal | "sheet"): Generator<void, Component | undefined> {
    const weights = key === "sheet" ? sheet : key === "swing" ? {} : foldDerivedWeights({ [key]: 1 }, rates);
    const m = key === "sheet" ? melee : key === "swing" ? { ...noMelee(melee), damage: 1 } : noMelee(melee);
    const r = yield* planned.plan(weights, m);
    return r.total > 0 ? { key, weights, melee: m, norm: r.total, max: key === "sheet" ? r.total : total(r, key) } : undefined;
  };
  const sheetUsed = Object.keys(sheet).length > 0 || melee.damage !== 0 || melee.procs !== 0;
  const components = new Map<SingleGoal | "sheet", Component>();
  for (const key of [...(sheetUsed ? (["sheet"] as const) : []), ...asked, ...restStats]) {
    const c = yield* alone(key);
    if (c) components.set(key, c);
  }

  // How hard a stat pulls: its own priority, none once held enough — or, for a stat in "everything else",
  // an equal share of that goal's priority, so the whole set counts as much as one stat at that priority.
  const inRest = new Set<SingleGoal>(restStats.filter((key) => components.has(key)));
  const restShare = inRest.size ? (goals.rest?.priority ?? 0) / 100 / inRest.size : 0;
  const priority = (key: SingleGoal) => (enough.has(key) ? 0 : goals[key] ? (goals[key].priority ?? 0) / 100 : inRest.has(key) ? restShare : 0);

  // Floors, in the game's own numbers (the character's base counts, ADR 0366), held to what the pool can
  // give. The search works in gear's terms, so each carries `want`: the share the gear has to supply.
  const beyondGear = (key: StatKey) => input.base?.[key] ?? 0;
  const floors = new Map<StatKey, { target: number; want: number; max: number; unreachable: boolean }>();
  for (const key of asked) {
    const floor = goals[key]?.floor;
    const c = components.get(key);
    if (!floor || !c || key === "swing") continue;
    const extra = beyondGear(key);
    const reach = c.max + extra;
    const raw = "pct" in floor ? (floor.pct / 100) * reach : floor.min;
    if (raw <= 0) continue;
    const target = Math.min(raw, reach);
    floors.set(key, { target, want: target - extra, max: c.max, unreachable: raw > reach + 0.5 });
  }

  // The plan under the sheet and priorities, plus a boost on each stat held to a floor.
  const blend = function* (boost: ReadonlyMap<SingleGoal, number>): Generator<void, GoalRun & { weights: StatWeights; melee: MeleeWeights }> {
    const weights: StatWeights = {};
    const m: MeleeWeights = { ...melee, damage: 0, procs: 0 };
    for (const c of components.values()) {
      const coef = c.key === "sheet" ? 1 : priority(c.key) + (boost.get(c.key) ?? 0);
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
  // Two floors pull against each other: doubling the short one can push the other under, and doubling
  // that one back leapfrogs. So a raise that flips another floor shrinks its own step (×2, ×1.5, ×1.25 …),
  // which closes in on the weighting that holds both — and the best plan seen is the one kept, not
  // whichever the last round happened to end on.
  const boost = new Map<SingleGoal, number>();
  const step = new Map<SingleGoal, number>();
  /** How far under their floors a plan is, as a share of each — 0 when every floor holds. */
  const shortfall = (r: GoalRun) => [...floors].reduce((sum, [key, f]) => (total(r, key) < f.want - 0.5 ? sum + (f.want - total(r, key)) / f.target : sum), 0);
  let result = yield* blend(boost);
  let best = { result, boost: new Map(boost), missed: shortfall(result) };
  for (let round = 0; round < SEARCH_ROUNDS; round++) {
    const wasShort = unmet(result);
    const short = wasShort.filter((key) => (boost.get(key) ?? 0) < MAX_BOOST);
    if (!short.length) break;
    for (const key of short) boost.set(key, Math.min(MAX_BOOST, (boost.get(key) ?? 0) * (step.get(key) ?? 2) || FIRST_BOOST));
    result = yield* blend(boost);
    if (unmet(result).some((key) => !wasShort.includes(key))) {
      for (const key of short) step.set(key, Math.max(MIN_STEP, 1 + ((step.get(key) ?? 2) - 1) / 2));
    }
    const missed = shortfall(result);
    if (missed < best.missed) best = { result, boost: new Map(boost), missed };
  }
  result = best.result;
  boost.clear();
  for (const [key, b] of best.boost) boost.set(key, b);
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

  const rows: GoalRow[] = asked.flatMap((key): GoalRow[] => {
    const c = components.get(key);
    // Nothing in the pool gives it: still a row, so the goal can say so instead of sitting silent.
    if (!c) return key === "swing" ? [] : [{ key, max: 0, got: 0, met: !goals[key]?.floor, unreachable: !!goals[key]?.floor }];
    const f = key === "swing" ? undefined : floors.get(key);
    const gear = key === "swing" ? undefined : total(result, key);
    const extra = key === "swing" ? 0 : beyondGear(key);
    return [
      {
        key,
        max: c.max + extra,
        floor: f?.target,
        got: gear === undefined ? undefined : gear + extra,
        met: !f || gear! >= f.want - 0.5,
        unreachable: f?.unreachable ?? false,
        ...(extra !== 0 && { base: extra }),
      },
    ];
  });
  // The sheet, a priority that still counts and "everything else" are what steer past the floors; boosts only hold them.
  const driven = [...components.keys()].some((key) => key === "sheet" || priority(key) > 0);
  return { weights: result.weights, melee: result.melee, rows, driven, solves: planned.count() };
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

