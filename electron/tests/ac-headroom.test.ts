/**
 * Black-box tests for when melee damage earns an AC suggestion: mostly melee, enough evidence, and the
 * builder's loadout really reaching more AC than is worn.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DamageKindOfHit, DamageProfile } from "../../src/shared/combat/damage-profile";
import { MELEE_FLAG_SHARE, MIN_AC_GAIN, acSuggestion } from "../../src/shared/combat/ac-headroom";
import { MIN_HITS } from "../../src/shared/combat/resist-worth";

function profile(...buckets: [DamageKindOfHit, number, number][]): DamageProfile {
  const damage = buckets.reduce((n, b) => n + b[1], 0);
  return {
    fights: 1,
    measured: 1,
    damage,
    hits: buckets.reduce((n, b) => n + b[2], 0),
    types: buckets.map(([type, d, hits]) => ({ type, damage: d, hits, share: d / damage })),
  };
}

const MOSTLY_MELEE = profile(["melee", 80, MIN_HITS], ["fire", 20, 5]);

test("mostly melee, with more AC reachable than worn, suggests the AC", () => {
  assert.deepEqual(acSuggestion(MOSTLY_MELEE, { wearing: 60, loadout: 125 }), { share: 0.8, wearing: 60, loadout: 125, gain: 65 });
});

test("without a figure from the builder there is nothing to suggest", () => {
  assert.equal(acSuggestion(MOSTLY_MELEE, undefined), null);
});

test("a window too thin to advise on suggests nothing, whatever the gain", () => {
  assert.equal(acSuggestion(profile(["melee", 100, MIN_HITS - 1]), { wearing: 60, loadout: 125 }), null);
});

test("under half melee, the resists have the better claim", () => {
  const spells = profile(["melee", MELEE_FLAG_SHARE * 100 - 1, MIN_HITS], ["fire", 100 - (MELEE_FLAG_SHARE * 100 - 1), 20]);
  assert.equal(acSuggestion(spells, { wearing: 60, loadout: 125 }), null);
  assert.ok(acSuggestion(profile(["melee", 50, MIN_HITS], ["fire", 50, 5]), { wearing: 60, loadout: 125 }), "exactly half counts");
});

test("a loadout that reaches no more AC than you wear, or barely more, says nothing", () => {
  assert.equal(acSuggestion(MOSTLY_MELEE, { wearing: 125, loadout: 60 }), null);
  assert.equal(acSuggestion(MOSTLY_MELEE, { wearing: 60, loadout: 60 + MIN_AC_GAIN - 1 }), null);
  assert.ok(acSuggestion(MOSTLY_MELEE, { wearing: 0, loadout: MIN_AC_GAIN }), "nothing worn: any real AC is a gain");
});

test("on a big total a small gain is rounding, not advice", () => {
  assert.equal(acSuggestion(MOSTLY_MELEE, { wearing: 1000, loadout: 1050 }), null, "5% of what you wear");
  assert.ok(acSuggestion(MOSTLY_MELEE, { wearing: 1000, loadout: 1100 }), "10% is worth saying");
});

test("a profile with no melee in it can't suggest AC", () => {
  assert.equal(acSuggestion(profile(["fire", 100, MIN_HITS]), { wearing: 0, loadout: 500 }), null);
});
