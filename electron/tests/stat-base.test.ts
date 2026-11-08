/**
 * Black-box tests for what a character has before gear (`src/shared/items/stat-base.ts`): the part the
 * model can work out from race and classes, and the part the player calibrates against the game.
 * Only need re-running if that module, `character-base.ts` or `derived-stats.ts` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRead, calibrate, countedNow, modelledBase, normalizeCalibration, shownNow, statBase } from "../../src/shared/items/stat-base";
import { derivedRates } from "../../src/shared/items/derived-stats";

const TRIO = ["Wizard", "Druid", "Magician"];
const trio = (race?: string) => ({ classes: TRIO, race, rates: derivedRates({ classes: TRIO, level: 46, race, worn: {} }) });

test("the base is the race's attributes with the classes' modifiers, and the pools those attributes buy", () => {
  const base = modelledBase(trio("HUM"));
  // Human 75s, plus 15 STA from each of three classes and the INT/WIS the casters add.
  assert.deepEqual([base.str, base.sta, base.agi, base.dex, base.wis, base.int, base.cha], [75, 120, 75, 75, 90, 105, 75]);
  // 120 STA at a level-46 trio's 4.14 HP a point; INT 105 through the two INT pools (Wizard, Magician) at 7.8 a converted point.
  assert.equal(base.hp, 497);
  assert.ok(Math.abs(base.mana! - 877.5) <= 1, `mana ${base.mana}`);
  assert.equal(base.end, 285);
  assert.equal(base.ac, 0, "AGI 75 is the knee: neither a gain nor a loss");
});

test("with no race there is nothing to say about the base — the old, gear-only reading", () => {
  assert.deepEqual(modelledBase(trio()), {});
});

test("calibration adds on top of the base, and only for the stats it covers", () => {
  const out = statBase({ hp: 497, int: 105 }, { hp: 400, ac: -12 });
  assert.deepEqual(out, { hp: 897, int: 105, ac: -12 });
});

test("calibrating to what the game shows now, then changing gear, keeps the offset right", () => {
  const modelled = { hp: 497 };
  const counted = countedNow(modelled, { hp: 300 });
  assert.equal(counted.hp, 797);
  const calibration = calibrate({}, "hp", 1250, counted.hp!);
  assert.deepEqual(calibration, { hp: 453 });
  assert.equal(shownNow(counted, calibration, "hp"), 1250);
  // Gear worth 100 more HP later: the offset is the character's own, so the game's figure follows by 100.
  assert.equal(shownNow(countedNow(modelled, { hp: 400 }), calibration, "hp"), 1350);
});

test("typing what the model already counts, or nothing, clears the calibration", () => {
  assert.deepEqual(calibrate({ hp: 453, mana: 10 }, "hp", 797, 797), { mana: 10 });
  assert.deepEqual(calibrate({ hp: 453 }, "hp", 0, 797), {});
  assert.deepEqual(calibrate({ hp: 453 }, "hp", Number.NaN, 797), {});
});

test("a stored calibration keeps only whole, non-zero figures for the stats it covers", () => {
  // Pools, attributes and resists are covered (ADR 0368); a regen rate or a made-up key is not.
  assert.deepEqual(
    normalizeCalibration({ hp: 410.4, mana: 0, int: 7.4, svFire: -3, hpRegen: 5, ac: "x", end: -3, nonsense: 1 }),
    { hp: 410, int: 7, svFire: -3, end: -3 },
  );
  assert.deepEqual(normalizeCalibration(null), {});
  assert.deepEqual(normalizeCalibration([1, 2]), {});
});

test("an attribute and a resist calibrate the way a pool does: an offset from what is counted", () => {
  // No race ticked: nothing modelled, so the worn gear's 100 INT is all that is counted, and what the game
  // shows (214) says the character has 114 without gear — whatever the race, the AAs and the buffs give.
  const counted = countedNow({}, { int: 100, svFire: 10 });
  assert.deepEqual([counted.int, counted.svFire], [100, 10]);
  const calibration = calibrate(calibrate({}, "int", 214, counted.int!), "svFire", 19, counted.svFire!);
  assert.deepEqual(calibration, { int: 114, svFire: 9 });
  assert.equal(statBase({}, calibration).int, 114, "what a floor may count beyond gear");
  // Gear worth 20 more INT later: the game's figure follows by 20.
  assert.equal(shownNow(countedNow({}, { int: 120 }), calibration, "int"), 234);
});

test("a stats read sets every stat it gave and leaves the others as they were", () => {
  const counted = { hp: 797, int: 100, svFire: 10, svCold: 34 };
  const next = applyRead({ hp: 1, svCold: 4, mana: 55 }, { hp: 1250, int: 214, svFire: 19, svCold: 34 }, counted);
  assert.deepEqual(next, { hp: 453, int: 114, svFire: 9, mana: 55 }, "svCold now matches what is counted, so its old offset goes; mana wasn't in the read, so it stays");
});

test("a read zero is a figure, unlike a blank box: it can pull a counted number down", () => {
  assert.deepEqual(applyRead({}, { svVoid: 0 }, { svVoid: 12 }), { svVoid: -12 });
  // Typed, a zero is "I left it blank" and clears instead.
  assert.deepEqual(calibrate({ svVoid: -12 }, "svVoid", 0, 12), {});
});

test("a read ignores stats that cannot be calibrated and figures that are not numbers", () => {
  const next = applyRead({}, { hpRegen: 18, haste: 100, str: Number.NaN, sta: 137 }, { sta: 100 });
  assert.deepEqual(next, { sta: 37 });
});
