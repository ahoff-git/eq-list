/**
 * Black-box tests for "winning comfortably": what a window of fights has to look like before a harder swing
 * is worth offering, and what the offer says it costs. Fights carry only the fields the reading uses —
 * deaths and damage cells.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CRUISE_MELEE_SHARE,
  CRUISE_TAKEN_RATIO,
  MIN_CRUISE_FIGHTS,
  MIN_SWING_GAIN,
  cruise,
  swingSuggestion,
  type Cruise,
} from "../../src/shared/combat/cruising";
import type { Lean } from "../../src/shared/combat/headroom";
import { DRY_FLAG_SHARE, MIN_FIGHTS, type Strain } from "../../src/shared/combat/strain";
import type { StoredFight } from "../../src/shared/types";

interface Shape {
  died?: boolean;
  melee?: number;
  spell?: number;
  taken?: number;
  /** Damage your pet dealt — it is not yours. */
  pet?: number;
  /** A fight stored before its cells existed. */
  noCells?: boolean;
}

let ids = 0;
function fight({ died = false, melee = 0, spell = 0, taken = 0, pet = 0, noCells = false }: Shape = {}): StoredFight {
  const cell = (attacker: string, target: string, kind: string, damage: number) => ({ attacker, target, kind, source: "x", damage, hits: 1, ticks: 0, misses: 0 });
  const damageCells = noCells
    ? undefined
    : [
        ...(melee ? [cell("You", "a gnoll", "Melee", melee)] : []),
        ...(spell ? [cell("You", "a gnoll", "Spell", spell)] : []),
        ...(pet ? [cell("Gobart", "a gnoll", "Melee", pet)] : []),
        ...(taken ? [cell("a gnoll", "You", "Melee", taken)] : []),
      ];
  return { id: `f${++ids}`, stats: { deaths: died ? [{}] : [], damageCells } } as unknown as StoredFight;
}
const many = (n: number, shape: Shape = {}) => Array.from({ length: n }, () => fight(shape));

const NOT_DRY: Strain = { fights: 12, died: 0, casting: 0, dry: 0 };
const swap = (plan: number, lean: number) => ({ plan, lean });
/** The damage-first plan swings 20 → 26, and costs 40 AC and 100 mana but no health. */
const LEAN: Lean = { swing: swap(20, 26), ac: swap(180, 140), hp: swap(600, 620), mana: swap(1500, 1400) };
const winning: Cruise = cruise(many(12, { melee: 900, taken: 100 }));

test("it sums what you dealt yourself, what was melee, what landed on you, and the fights you died in", () => {
  const c = cruise([fight({ melee: 300, spell: 100, taken: 80, died: true }), fight({ melee: 100, taken: 20 })]);
  assert.deepEqual(c, { fights: 2, died: 1, dealt: 500, melee: 400, taken: 100 });
});

test("your pet's damage is not yours, and a fight without cells adds none", () => {
  const c = cruise([fight({ melee: 100, pet: 900 }), fight({ noCells: true })]);
  assert.deepEqual(c, { fights: 2, died: 0, dealt: 100, melee: 100, taken: 0 });
});

test("winning comfortably with your own sword, and a plan that swings harder, is a suggestion", () => {
  const s = swingSuggestion(winning, NOT_DRY, LEAN);
  assert.ok(s);
  assert.equal(s.plan, 20);
  assert.equal(s.lean, 26);
  assert.equal(s.gain, 6);
  assert.equal(s.fights, 12);
  assert.equal(s.takenRatio, 100 / 900);
  assert.equal(s.meleeShare, 1);
});

test("what it says it costs is the pools that fall by enough to mention", () => {
  const s = swingSuggestion(winning, NOT_DRY, LEAN)!;
  // 40 of 180 AC and 100 of 1,500 mana: AC is over its 5 points and 10%, mana over 50 points but under 10%; health rose.
  assert.deepEqual(s.falls, [{ stat: "ac", plan: 180, lean: 140 }]);
});

test("a swap that costs next to nothing says no pool falls", () => {
  const free: Lean = { ...LEAN, ac: swap(180, 178), mana: swap(1500, 1490) };
  assert.deepEqual(swingSuggestion(winning, NOT_DRY, free)!.falls, []);
});

test("one death anywhere in the window ends it — that is not winning comfortably", () => {
  assert.equal(swingSuggestion({ ...winning, died: 1 }, NOT_DRY, LEAN), null);
});

test("too few fights say nothing", () => {
  assert.equal(swingSuggestion({ ...winning, fights: MIN_CRUISE_FIGHTS - 1 }, NOT_DRY, LEAN), null);
  assert.ok(swingSuggestion({ ...winning, fights: MIN_CRUISE_FIGHTS }, NOT_DRY, LEAN));
});

test("taking too much for what you dealt is not comfortable; at the limit it still is", () => {
  assert.equal(swingSuggestion({ ...winning, dealt: 1000, melee: 1000, taken: 1000 * CRUISE_TAKEN_RATIO + 1 }, NOT_DRY, LEAN), null);
  assert.ok(swingSuggestion({ ...winning, dealt: 1000, melee: 1000, taken: 1000 * CRUISE_TAKEN_RATIO }, NOT_DRY, LEAN));
});

test("a harder swing is no use to someone whose damage is not their own melee", () => {
  assert.equal(swingSuggestion({ ...winning, dealt: 1000, taken: 0, melee: 1000 * CRUISE_MELEE_SHARE - 1 }, NOT_DRY, LEAN), null);
  assert.ok(swingSuggestion({ ...winning, dealt: 1000, taken: 0, melee: 1000 * CRUISE_MELEE_SHARE }, NOT_DRY, LEAN));
  // A caster with a pet: nothing of their own to swing.
  assert.equal(swingSuggestion(cruise(many(12, { spell: 900, pet: 900, melee: 10, taken: 50 })), NOT_DRY, LEAN), null);
});

test("running dry says mana is what you are short of, so it is not offered up", () => {
  const dry: Strain = { fights: 12, died: 0, casting: MIN_FIGHTS, dry: Math.ceil(MIN_FIGHTS * DRY_FLAG_SHARE) };
  assert.equal(swingSuggestion(winning, dry, LEAN), null);
  assert.ok(swingSuggestion(winning, { ...dry, dry: 0 }, LEAN));
});

test("nothing is said before the builder has planned the damage-first loadout", () => {
  assert.equal(swingSuggestion(winning, NOT_DRY, undefined), null);
});

test("a plan that already swings as hard says nothing: there is nothing more to trade for", () => {
  assert.equal(swingSuggestion(winning, NOT_DRY, { ...LEAN, swing: swap(20, 20 + MIN_SWING_GAIN - 1) }), null);
  // And a small gain on a big swing is under the shared ratio.
  assert.equal(swingSuggestion(winning, NOT_DRY, { ...LEAN, swing: swap(100, 105) }), null);
  assert.ok(swingSuggestion(winning, NOT_DRY, { ...LEAN, swing: swap(100, 110) }));
});

test("a plan that swings nothing has no 'harder' to be measured against", () => {
  assert.equal(swingSuggestion(winning, NOT_DRY, { ...LEAN, swing: swap(0, 30) }), null);
  assert.equal(swingSuggestion(winning, NOT_DRY, { ...LEAN, swing: swap(0.3, 30) }), null);
});

test("a window with no damage dealt can't be winning anything", () => {
  assert.equal(swingSuggestion(cruise(many(12)), NOT_DRY, LEAN), null);
});
