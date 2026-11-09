/**
 * Black-box tests for what a stats read answers on the Deaths page (`src/shared/items/stats-for-combat.ts`).
 * Only need re-running if that module or `stats-page.ts`'s `confidentValues` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { combatFigures } from "../../src/shared/items/stats-for-combat";
import type { StatsRead } from "../../src/shared/items/stats-page";

const read = (over: Partial<StatsRead> = {}): StatsRead => ({ values: { hp: 2034, hpRegen: 18, mana: 2924 }, repaired: [], doubtful: [], missing: [], ...over });

test("a read answers both questions: the pool's max and the regen per tick", () => {
  assert.deepEqual(combatFigures(read()), { maxHp: 2034, hpRegen: 18 });
});

test("a figure the read was only guessing at is not filed as the player's own", () => {
  assert.deepEqual(combatFigures(read({ doubtful: ["hp"] })), { hpRegen: 18 });
  assert.deepEqual(combatFigures(read({ doubtful: ["hp", "hpRegen"] })), {});
});

test("a read that never saw them answers nothing", () => {
  assert.deepEqual(combatFigures(read({ values: { mana: 2924 } })), {});
  assert.deepEqual(combatFigures(read({ values: {} })), {});
});

test("no HP is not an HP of zero, but no regen is a regen of zero — the page treats it as nothing to discount", () => {
  assert.deepEqual(combatFigures(read({ values: { hp: 0, hpRegen: 0 } })), { hpRegen: 0 });
});
