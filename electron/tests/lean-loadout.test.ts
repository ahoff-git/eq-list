/**
 * Black-box tests for the damage-first plan set beside your goals' plan: which preset it is, and the swap
 * read off the two plans' figures.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LEAN_PRESET, leanSwap, type PlanFigures } from "../../src/shared/items/lean-loadout";
import type { DerivedRate } from "../../src/shared/items/derived-stats";

const plan = (stats: PlanFigures["stats"]["loadout"], perSecond: number, opts: { procPerSecond?: number; procDamage?: boolean } = {}): PlanFigures => ({
  stats: { loadout: stats },
  damage: { loadout: { perSecond, procPerSecond: opts.procPerSecond ?? 0 }, model: { melee: { procDamage: opts.procDamage ?? false } } },
});

test("the damage-first plan is the builder's Melee damage preset, which puts the swing first", () => {
  assert.equal(LEAN_PRESET.id, "melee");
  assert.equal(LEAN_PRESET.goals.swing?.priority, 100);
});

test("the swap is each plan's swing, and the pools it could cost", () => {
  const swap = leanSwap(plan({ ac: 180, hp: 600, mana: 1500 }, 20), plan({ ac: 140, hp: 620 }, 26), []);
  assert.deepEqual(swap, {
    swing: { plan: 20, lean: 26 },
    ac: { plan: 180, lean: 140 },
    hp: { plan: 600, lean: 620 },
    // A pool the damage-first plan has none of is zero, not absent.
    mana: { plan: 1500, lean: 0 },
  });
});

test("proc damage counts toward the swing only when the player counts it", () => {
  const counted = leanSwap(plan({}, 20, { procPerSecond: 5, procDamage: true }), plan({}, 26, { procPerSecond: 8, procDamage: true }), []);
  assert.deepEqual(counted.swing, { plan: 25, lean: 34 });
  const ignored = leanSwap(plan({}, 20, { procPerSecond: 5 }), plan({}, 26, { procPerSecond: 8 }), []);
  assert.deepEqual(ignored.swing, { plan: 20, lean: 26 });
});

test("pools are the effective totals, so what attributes give counts", () => {
  // 100 STA at 2 HP each: the plan with the stamina has 200 more health than the printed figure.
  const rates: DerivedRate[] = [{ from: "sta", to: "hp", perPoint: 2, pools: [] }];
  const swap = leanSwap(plan({ hp: 400, sta: 100 }, 20), plan({ hp: 400 }, 26), rates);
  assert.deepEqual(swap.hp, { plan: 600, lean: 400 });
});
