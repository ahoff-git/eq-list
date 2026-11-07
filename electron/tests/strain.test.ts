/**
 * Black-box tests for what a window of fights says about running dry and dying, and when each earns a
 * suggestion. Fights carry only the fields the reading uses: deaths, whether you ran out, and whether you cast.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEATH_FLAG_SHARE,
  DRY_FLAG_SHARE,
  MIN_DEATHS,
  MIN_FIGHTS,
  MIN_HP_GAIN,
  MIN_MANA_GAIN,
  hpSuggestion,
  manaSuggestion,
  strain,
} from "../../src/shared/combat/strain";
import type { StoredFight } from "../../src/shared/types";

interface Shape {
  died?: boolean;
  /** `undefined` is a fight stored before running dry was recorded. */
  outOfMana?: number;
  cast?: boolean;
}

let ids = 0;
function fight({ died = false, outOfMana, cast = false }: Shape = {}): StoredFight {
  return {
    id: `f${++ids}`,
    stats: { deaths: died ? [{}] : [], outOfMana, spells: cast ? [{ spell: "Blast of Cold", casts: 4 }] : [] },
  } as unknown as StoredFight;
}
const many = (n: number, shape: Shape = {}) => Array.from({ length: n }, () => fight(shape));

test("it counts the fights you died in, and of the fights you cast in, those you ran dry in", () => {
  const fights = [fight({ died: true }), fight({ cast: true, outOfMana: 0 }), fight({ cast: true, outOfMana: 2 }), fight({ cast: true, outOfMana: 1, died: true })];
  assert.deepEqual(strain(fights), { fights: 4, died: 2, casting: 3, dry: 2 });
});

test("a fight stored before running dry was recorded is no evidence either way", () => {
  assert.deepEqual(strain([fight({ cast: true }), fight({ cast: true, outOfMana: 3 })]), { fights: 2, died: 0, casting: 1, dry: 1 });
});

test("a fight you never cast in can't have run you out of mana", () => {
  assert.deepEqual(strain([fight({ outOfMana: 0 }), fight({ outOfMana: 0 })]), { fights: 2, died: 0, casting: 0, dry: 0 });
});

test("an empty window has nothing", () => {
  assert.deepEqual(strain([]), { fights: 0, died: 0, casting: 0, dry: 0 });
});

const REACH = { wearing: 44, loadout: 103 };

test("dying often enough, with more health on offer, suggests it", () => {
  assert.deepEqual(hpSuggestion({ fights: 14, died: 3, casting: 0, dry: 0 }, REACH), { wearing: 44, loadout: 103, gain: 59, died: 3, fights: 14 });
});

test("one death is bad luck, and too few fights is too few", () => {
  assert.equal(hpSuggestion({ fights: 14, died: MIN_DEATHS - 1, casting: 0, dry: 0 }, REACH), null);
  assert.equal(hpSuggestion({ fights: MIN_FIGHTS - 1, died: 4, casting: 0, dry: 0 }, REACH), null);
});

test("deaths that are a sliver of a long window don't suggest health", () => {
  assert.equal(hpSuggestion({ fights: 100, died: 3, casting: 0, dry: 0 }, REACH), null);
  const fights = 40;
  assert.ok(hpSuggestion({ fights, died: Math.ceil(fights * DEATH_FLAG_SHARE), casting: 0, dry: 0 }, REACH), "at the share it does");
});

test("health is only suggested when the loadout reaches meaningfully more", () => {
  const dying = { fights: 14, died: 3, casting: 0, dry: 0 };
  assert.equal(hpSuggestion(dying, undefined), null);
  assert.equal(hpSuggestion(dying, { wearing: 103, loadout: 44 }), null);
  assert.equal(hpSuggestion(dying, { wearing: 0, loadout: MIN_HP_GAIN - 1 }), null);
  assert.ok(hpSuggestion(dying, { wearing: 0, loadout: MIN_HP_GAIN }));
});

const MANA = { wearing: 991, loadout: 1653 };

test("running dry often enough, with a bigger pool on offer, suggests mana", () => {
  assert.deepEqual(manaSuggestion({ fights: 14, died: 0, casting: 11, dry: 4 }, MANA), { wearing: 991, loadout: 1653, gain: 662, dry: 4, casting: 11 });
});

test("the rate is of the fights you cast in, not of every fight", () => {
  // 4 of 11 casting fights is 36%; the same 4 among 40 fights of any kind would be 10%.
  assert.ok(manaSuggestion({ fights: 40, died: 0, casting: 11, dry: 4 }, MANA));
});

test("a rare running-dry, or too few casting fights to tell, suggests nothing", () => {
  assert.equal(manaSuggestion({ fights: 60, died: 0, casting: 60, dry: 3 }, MANA), null, "5% of fights");
  assert.equal(manaSuggestion({ fights: 4, died: 0, casting: MIN_FIGHTS - 1, dry: 4 }, MANA), null);
  const casting = 20;
  assert.ok(manaSuggestion({ fights: casting, died: 0, casting, dry: Math.ceil(casting * DRY_FLAG_SHARE) }, MANA), "at the share it does");
});

test("mana is only suggested when the loadout reaches a meaningfully bigger pool", () => {
  const dry = { fights: 14, died: 0, casting: 11, dry: 4 };
  assert.equal(manaSuggestion(dry, undefined), null);
  assert.equal(manaSuggestion(dry, { wearing: 1653, loadout: 991 }), null);
  assert.equal(manaSuggestion(dry, { wearing: 0, loadout: MIN_MANA_GAIN - 1 }), null);
  assert.ok(manaSuggestion(dry, { wearing: 0, loadout: MIN_MANA_GAIN }));
});
