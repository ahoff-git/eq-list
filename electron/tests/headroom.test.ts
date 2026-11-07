/**
 * Black-box tests for the one question AC, health and mana are all asked: does the builder's loadout
 * reach meaningfully more than is worn?
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { MIN_GAIN_RATIO, worthSaying } from "../../src/shared/combat/headroom";

test("a loadout that reaches more is the gain, with both totals rounded", () => {
  assert.deepEqual(worthSaying({ wearing: 60.4, loadout: 124.6 }, 5), { wearing: 60, loadout: 125, gain: 65 });
});

test("no figure from the builder is nothing to say", () => {
  assert.equal(worthSaying(undefined, 5), null);
});

test("a loadout that reaches no more than you wear, or less, says nothing", () => {
  assert.equal(worthSaying({ wearing: 100, loadout: 100 }, 5), null);
  assert.equal(worthSaying({ wearing: 125, loadout: 60 }, 5), null);
});

test("the stat's own scale decides how few points are too few", () => {
  assert.equal(worthSaying({ wearing: 0, loadout: 49 }, 50), null, "49 mana is nothing");
  assert.ok(worthSaying({ wearing: 0, loadout: 50 }, 50), "50 is the least worth saying");
  assert.ok(worthSaying({ wearing: 0, loadout: 5 }, 5), "while 5 AC is plenty");
});

test("on a big total a small gain is rounding, not advice", () => {
  assert.equal(worthSaying({ wearing: 1000, loadout: 1000 + 1000 * MIN_GAIN_RATIO - 1 }, 5), null);
  assert.ok(worthSaying({ wearing: 1000, loadout: 1000 + 1000 * MIN_GAIN_RATIO }, 5));
});
