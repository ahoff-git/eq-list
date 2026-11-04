/**
 * Black-box tests for loadout goals: sliders in, ordinary weights out.
 *
 * The real solver is replaced by a toy that picks the best of a few fixed loadouts by dot product —
 * what matters here is that floors are found and priorities scale, not the exact assignment (`bis.ts`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GOAL_PRESETS, goalsWithoutPools, normalizeGoals, solveGoals, solveGoalsAsync, withGoal, type RunPlan } from "../../src/shared/items/bis-goals";
import { expectedStats } from "../../src/shared/items/bis-columns";
import { bisPlan } from "../../src/shared/items/bis-plan";
import { NO_BIS_OPTIONS } from "../../src/shared/items/bis-options";
import { itemRows, NO_CRITERIA, type StatWeights } from "../../src/shared/items/item-search";
import type { CachedItem } from "../../src/shared/types";
import { derivedRates } from "../../src/shared/items/derived-stats";
import { NO_MELEE_WEIGHTS } from "../../src/shared/items/melee";

// A strictly concave HP/mana frontier — a linear solver (weights in, loadout out) can only find hull
// points, and collinear ones would tie. Swing is carried by the later loadouts.
const LOADOUTS = [
  { hp: 3000, mana: 0, swing: 10 },
  { hp: 2850, mana: 400, swing: 10 },
  { hp: 2600, mana: 800, swing: 30 },
  { hp: 2200, mana: 1200, swing: 30 },
  { hp: 1600, mana: 1600, swing: 50 },
  { hp: 0, mana: 2000, swing: 20 },
];

const toy: RunPlan = (w: StatWeights, m) => {
  const value = (l: (typeof LOADOUTS)[number]) => (w.hp ?? 0) * l.hp + (w.mana ?? 0) * l.mana + m.damage * l.swing;
  const best = LOADOUTS.reduce((a, b) => (value(b) > value(a) ? b : a));
  return { total: value(best), stats: { hp: best.hp, mana: best.mana } };
};

const solve = (goals: Parameters<typeof normalizeGoals>[0]) =>
  solveGoals({ goals: normalizeGoals(goals), sheet: {}, melee: NO_MELEE_WEIGHTS, rates: [], run: toy });

const plan = (outcome: ReturnType<typeof solve>) => toy(outcome.weights, outcome.melee).stats;

test("no goals leaves the player's own weights and melee untouched", () => {
  const sheet = { hp: 2 };
  const out = solveGoals({ goals: {}, sheet, melee: NO_MELEE_WEIGHTS, rates: [], run: toy });
  assert.equal(out.weights, sheet);
  assert.equal(out.solves, 0);
});

test("a priority alone aims at the most of that stat", () => {
  assert.equal(plan(solve({ hp: { priority: 100 } })).hp, 3000);
  assert.equal(plan(solve({ mana: { priority: 100 } })).mana, 2000);
});

test("a floor that holds costs the objective only what it must", () => {
  // Tankiest loadout that still has at least 800 mana is the third.
  const out = solve({ hp: { priority: 100 }, mana: { floor: { min: 800 } } });
  assert.deepEqual(plan(out), { hp: 2600, mana: 800 });
  assert.ok(out.rows.find((r) => r.key === "mana")?.met);
});

test("a percent floor is a share of the most the pool reaches", () => {
  // 50% of 2000 mana is 1000, so the tankiest loadout with 1000+ mana.
  const out = solve({ hp: { priority: 100 }, mana: { floor: { pct: 50 } } });
  assert.equal(plan(out).hp, 2200);
  assert.equal(out.rows.find((r) => r.key === "mana")?.max, 2000);
});

test("two floors at once are both met when some loadout can", () => {
  const out = solve({ swing: { priority: 100 }, hp: { floor: { min: 1000 } }, mana: { floor: { min: 1600 } } });
  assert.deepEqual(plan(out), { hp: 1600, mana: 1600 });
});

test("a floor above the max is held to the max and says so", () => {
  const out = solve({ hp: { priority: 50 }, mana: { floor: { min: 9999 } } });
  const mana = out.rows.find((r) => r.key === "mana")!;
  assert.equal(mana.unreachable, true);
  assert.equal(mana.floor, 2000);
  assert.equal(plan(out).mana, 2000);
});

test("a goal on a stat nothing gives still reports, so it can say so", () => {
  const out = solve({ hp: { priority: 100 }, ac: { floor: { min: 50 } } });
  assert.deepEqual(out.rows.find((r) => r.key === "ac"), { key: "ac", max: 0, got: 0, met: false, unreachable: true });
  assert.equal(plan(out).hp, 3000);
});

test("melee damage as a priority sets the swing weight", () => {
  const out = solve({ swing: { priority: 100 } });
  assert.ok(out.melee.damage > 0);
  assert.equal(toy(out.weights, out.melee).total > 0, true);
});

test("normalizing keeps what's valid and drops the rest", () => {
  assert.deepEqual(normalizeGoals({ hp: { priority: 150, floor: { pct: 95.4 } }, bogus: { priority: 5 }, mana: { priority: 0 }, swing: { floor: { min: 5 } } }), {
    hp: { priority: 100, floor: { pct: 95 } },
  });
});

test("withGoal merges a change and removes a stat when nothing is left", () => {
  const set = withGoal({}, "hp", { priority: 40 });
  assert.deepEqual(withGoal(set, "hp", { floor: { min: 2000 } }), { hp: { priority: 40, floor: { min: 2000 } } });
  assert.deepEqual(withGoal(set, "hp", { priority: 0 }), {});
  assert.deepEqual(withGoal(set, "hp", null), {});
});

test("every preset is already in normal form", () => {
  for (const p of GOAL_PRESETS) assert.deepEqual(normalizeGoals(p.goals), p.goals, p.id);
});

// ─── Through the real solver ────────────────────────────────────────────────

const page = (title: string, lines: string[]): CachedItem =>
  ({ title, origin: "wiki", card: { title, lines }, sources: [], outOfEra: false }) as unknown as CachedItem;

// One head slot to fill from the catalogue, trading HP for mana along a concave frontier.
const rows = itemRows([
  page("Tank Helm", ["LORE ITEM", "Slot: HEAD", "HP: +300", "Class: ALL", "Race: ALL"]),
  page("Bruiser Helm", ["LORE ITEM", "Slot: HEAD", "HP: +260 MANA: +100", "Class: ALL", "Race: ALL"]),
  page("Mid Helm", ["LORE ITEM", "Slot: HEAD", "HP: +180 MANA: +180", "Class: ALL", "Race: ALL"]),
  page("Scholar Helm", ["LORE ITEM", "Slot: HEAD", "HP: +80 MANA: +240", "Class: ALL", "Race: ALL"]),
  page("Mage Cap", ["LORE ITEM", "Slot: HEAD", "MANA: +280", "Class: ALL", "Race: ALL"]),
]);

const planned: RunPlan = (weights, melee) => {
  const p = bisPlan({ rows, inventory: [], criteria: { ...NO_CRITERIA, hideOutOfEra: false }, weights, options: { ...NO_BIS_OPTIONS, melee } });
  return { total: p.loadout.total, stats: p.stats.loadout };
};

// Weights only find loadouts on the convex hull of what's reachable, so a floor can be met by a hull
// point past a better off-hull one.
// The head and both Any Slots take a helm each, so totals are three helms' worth.
const stats = (goals: Record<string, unknown>) => {
  const out = solveGoals({ goals: normalizeGoals(goals), sheet: {}, melee: NO_MELEE_WEIGHTS, rates: [], run: planned });
  return { out, got: planned(out.weights, out.melee).stats };
};

test("goals steer the real plan: tanky, but keeping most of the mana", () => {
  const tank = stats({ hp: { priority: 100 } });
  const mana = stats({ mana: { priority: 100 } });
  const held = stats({ hp: { priority: 100 }, mana: { floor: { pct: 80 } } });
  const maxMana = held.out.rows.find((r) => r.key === "mana")!.max;
  assert.equal(maxMana, mana.got.mana);
  assert.ok((held.got.mana ?? 0) >= 0.8 * maxMana, "the floor holds");
  assert.ok((held.got.hp ?? 0) >= (mana.got.hp ?? 0), "and it is no less tanky than going all mana");
  assert.ok((held.got.hp ?? 0) < (tank.got.hp ?? 0), "but it costs some HP against going all tank");
});

test("a floor of nothing changes nothing", () => {
  const tank = stats({ hp: { priority: 100 } });
  assert.deepEqual(stats({ hp: { priority: 100 }, mana: { floor: { pct: 1 } } }).got, tank.got);
});

// ─── Which stats the grid shows ─────────────────────────────────────────────

test("the grid gets a column for each stat weighted, goaled or floored — once, in card order", () => {
  const got = expectedStats({ mana: 1, ac: 2 }, normalizeGoals({ swing: { priority: 100 }, hp: { priority: 50 }, mana: { floor: { pct: 90 } } }), { ac: 100, str: 10 });
  assert.deepEqual(got, ["ac", "hp", "mana", "str"]);
  assert.deepEqual(expectedStats({}, {}), []);
});

// ─── Stopping a search a newer ask has outdated ─────────────────────────────

test("the async search agrees with the sync one, and stops when aborted", async () => {
  const input = { goals: normalizeGoals({ hp: { priority: 100 }, mana: { floor: { min: 800 } } }), sheet: {}, melee: NO_MELEE_WEIGHTS, rates: [], run: toy };
  assert.deepEqual(await solveGoalsAsync(input, new AbortController().signal), solveGoals(input));

  const abort = new AbortController();
  let plans = 0;
  const counting: RunPlan = (w, m) => (plans++, toy(w, m));
  const stopped = solveGoalsAsync({ ...input, run: counting }, abort.signal);
  abort.abort();
  assert.equal(await stopped, undefined);
  assert.ok(plans <= 2, `stopped after ${plans} plans`);
});

test("a mana or HP goal with no class ticked is flagged, and not once classes give rates", () => {
  const goals = normalizeGoals({ mana: { floor: { min: 5000 } }, hp: { priority: 50 }, ac: { priority: 50 } });
  assert.deepEqual(goalsWithoutPools(goals, derivedRates({ classes: [], level: 50 })), ["hp", "mana"]);
  assert.deepEqual(goalsWithoutPools(goals, derivedRates({ classes: ["Wizard"], level: 50 })), []);
});
