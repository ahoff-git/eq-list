/**
 * Black-box tests for applying a stats read as the character it says you are (`src/shared/items/stat-read-apply.ts`).
 *
 * The check that matters is the round trip: after a read is applied, the plan's own arithmetic — the modelled base
 * at the read's classes and level, the worn gear, the offset — must give back the figure the game showed. Each
 * test works that sum out independently with the same pure pieces the planner uses.
 *
 * Only need re-running if that module, `stat-base.ts` or `derived-stats.ts` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyStatsRead } from "../../src/shared/items/stat-read-apply";
import { derivedRates } from "../../src/shared/items/derived-stats";
import { effectiveStats, type LoadoutStats } from "../../src/shared/items/loadout-stats";
import { countedNow, modelledBase, shownNow, type Calibration } from "../../src/shared/items/stat-base";
import { basisOf } from "../../src/shared/items/stats-drift";
import type { StatsRead, StatsValues } from "../../src/shared/items/stats-page";

const TRIO = ["Wizard", "Druid", "Magician"];
const WORN: LoadoutStats = { hp: 300, mana: 200, ac: 120, str: 10, sta: 20, int: 40, wis: 15, svMagic: 5, svFire: 3 };
const WIZ = { name: "Kainos", level: 31, classes: TRIO, unsure: [] as ("level" | "classes")[] };

const read = (values: StatsValues, over: Partial<StatsRead> = {}): StatsRead => ({ values, repaired: [], doubtful: [], missing: [], ...over });

/** What the plan counts for this character with this gear — worked out here, not taken from the code under test. */
function countedAt(race: string | undefined, classes: readonly string[], level: number, worn: LoadoutStats = WORN) {
  const rates = derivedRates({ classes, level, race, worn });
  return countedNow(modelledBase({ rates, race, classes }), effectiveStats(worn, rates).total);
}

const SHOWN = { hp: 1976, mana: 2840, ac: 242, int: 214, sta: 137, svFire: 19 };

test("a read that says who you are is measured against that, and every figure comes back as the game showed it", () => {
  const applied = applyStatsRead({ read: read(SHOWN, { who: WIZ }), planner: { race: "DEF", classes: [], level: 60 }, worn: WORN, calibration: {} });
  const counted = countedAt("DEF", TRIO, 31);
  for (const [key, shown] of Object.entries(SHOWN)) assert.equal(shownNow(counted, applied.calibration, key as keyof Calibration), shown, key);
  assert.deepEqual(applied.basis, basisOf("DEF", TRIO, 31));
});

test("the planner is told to follow: its classes and its level", () => {
  const applied = applyStatsRead({ read: read(SHOWN, { who: WIZ }), planner: { race: "DEF", classes: ["Cleric"], level: 60 }, worn: WORN, calibration: {} });
  assert.deepEqual(applied.set, { classes: TRIO, level: 31 });
});

test("measured against the planner's own numbers it would be wrong — the point of reading who you are first", () => {
  const asPlanner = countedAt("DEF", ["Cleric"], 60);
  const asRead = countedAt("DEF", TRIO, 31);
  assert.notEqual(asPlanner.mana, asRead.mana, "different classes and level count different pools");
  const applied = applyStatsRead({ read: read({ mana: 2840 }, { who: WIZ }), planner: { race: "DEF", classes: ["Cleric"], level: 60 }, worn: WORN, calibration: {} });
  assert.equal(applied.calibration.mana, 2840 - (asRead.mana ?? 0));
});

test("a planner that already agrees is not touched, however the classes were ticked", () => {
  const applied = applyStatsRead({ read: read(SHOWN, { who: WIZ }), planner: { race: "DEF", classes: ["magician", "Wizard", "DRUID"], level: 31 }, worn: WORN, calibration: {} });
  assert.equal(applied.set, undefined);
});

test("only the part of the corner that differs is moved", () => {
  const sameLevel = applyStatsRead({ read: read(SHOWN, { who: WIZ }), planner: { race: "DEF", classes: [], level: 31 }, worn: WORN, calibration: {} });
  assert.deepEqual(sameLevel.set, { classes: TRIO });
  const sameClasses = applyStatsRead({ read: read(SHOWN, { who: WIZ }), planner: { race: "DEF", classes: TRIO, level: 60 }, worn: WORN, calibration: {} });
  assert.deepEqual(sameClasses.set, { level: 31 });
});

test("a read without a corner is measured against the planner, and changes nothing about it", () => {
  const applied = applyStatsRead({ read: read(SHOWN), planner: { race: "DEF", classes: TRIO, level: 46 }, worn: WORN, calibration: {} });
  assert.equal(applied.set, undefined);
  const counted = countedAt("DEF", TRIO, 46);
  for (const [key, shown] of Object.entries(SHOWN)) assert.equal(shownNow(counted, applied.calibration, key as keyof Calibration), shown, key);
});

test("a corner whose classes couldn't be settled leaves the classes to the planner — the level can still be taken", () => {
  const who = { name: "Kainos", level: 31, classes: [], unsure: ["classes" as const], saw: "WlZ/DRU/MAG" };
  const applied = applyStatsRead({ read: read(SHOWN, { who }), planner: { race: "DEF", classes: ["Cleric"], level: 60 }, worn: WORN, calibration: {} });
  assert.deepEqual(applied.set, { level: 31 });
  assert.deepEqual(applied.basis, basisOf("DEF", ["Cleric"], 31));
});

test("a level at or past the cap is the cap — the slider has no number above it", () => {
  const applied = applyStatsRead({ read: read(SHOWN, { who: { ...WIZ, level: 75 } }), planner: { race: "DEF", classes: TRIO, level: 50 }, worn: WORN, calibration: {} });
  assert.equal(applied.basis.level, 60);
  assert.deepEqual(applied.set, { level: 60 });
});

// ── what it replaces ──

test("a read under a different basis replaces what was measured under the old one, not mixes with it", () => {
  const before: Calibration = { sta: 40, svMagic: 12 };
  const old = basisOf("DEF", ["Cleric"], 60);
  const applied = applyStatsRead({ read: read({ hp: 1976 }, { who: WIZ }), planner: { race: "DEF", classes: ["Cleric"], level: 60 }, worn: WORN, calibration: before, measuredAs: old });
  assert.deepEqual(Object.keys(applied.calibration), ["hp"], "the old stamina and resist offsets were against a Cleric at 60");
});

test("a read under the same basis keeps the figures it didn't give", () => {
  const before: Calibration = { sta: 40 };
  const same = basisOf("DEF", TRIO, 31);
  const applied = applyStatsRead({ read: read({ hp: 1976 }, { who: WIZ }), planner: { race: "DEF", classes: TRIO, level: 31 }, worn: WORN, calibration: before, measuredAs: same });
  assert.equal(applied.calibration.sta, 40);
  assert.ok(applied.calibration.hp !== undefined);
});

test("with no record of what the calibration was measured against, a read merges, as a typed figure does", () => {
  const applied = applyStatsRead({ read: read({ hp: 1976 }, { who: WIZ }), planner: { race: "DEF", classes: ["Cleric"], level: 60 }, worn: WORN, calibration: { sta: 40 } });
  assert.equal(applied.calibration.sta, 40);
});

// ── what it will and won't apply ──

test("a figure the read was unsure of is held for the player, not applied", () => {
  const applied = applyStatsRead({ read: read(SHOWN, { who: WIZ, doubtful: ["ac"], repaired: ["ac"] }), planner: { race: "DEF", classes: TRIO, level: 31 }, worn: WORN, calibration: {} });
  assert.equal(applied.calibration.ac, undefined);
  assert.deepEqual(applied.held, { ac: 242 });
  assert.equal(applied.applied.ac, undefined);
  assert.equal(applied.applied.hp, 1976);
});

test("a read that was sure of nothing leaves what the player had — but still says who you are", () => {
  const before: Calibration = { sta: 40 };
  const applied = applyStatsRead({
    read: read({ ac: 242 }, { who: WIZ, doubtful: ["ac"] }),
    planner: { race: "DEF", classes: ["Cleric"], level: 60 },
    worn: WORN,
    calibration: before,
    measuredAs: basisOf("DEF", ["Cleric"], 60),
  });
  assert.deepEqual(applied.calibration, before);
  assert.deepEqual(applied.set, { classes: TRIO, level: 31 });
});

test("a doubtful regen row is not held for confirmation — there is nothing to confirm it into", () => {
  const applied = applyStatsRead({ read: read({ hpRegen: 18 }, { doubtful: ["hpRegen"] }), planner: { race: "DEF", classes: TRIO, level: 31 }, worn: WORN, calibration: {} });
  assert.deepEqual(applied.held, {});
});

test("the regen rows are read but are no figure the plan keeps an offset for", () => {
  const applied = applyStatsRead({ read: read({ hpRegen: 18, manaRegen: 33 }), planner: { race: "DEF", classes: TRIO, level: 31 }, worn: WORN, calibration: { sta: 40 } });
  assert.deepEqual(applied.calibration, { sta: 40 });
  assert.deepEqual(applied.applied, {});
});

test("a read zero is a figure: a character with no void resist pulls a counted number down", () => {
  const counted = countedAt("DEF", TRIO, 31);
  const applied = applyStatsRead({ read: read({ svFire: 0 }), planner: { race: "DEF", classes: TRIO, level: 31 }, worn: WORN, calibration: {} });
  assert.equal(shownNow(counted, applied.calibration, "svFire"), 0);
});

test("with no race ticked the model counts only gear, and the offset is the whole of the rest", () => {
  const applied = applyStatsRead({ read: read({ int: 214 }, { who: WIZ }), planner: { classes: TRIO, level: 31 }, worn: WORN, calibration: {} });
  const counted = countedAt(undefined, TRIO, 31);
  assert.equal(shownNow(counted, applied.calibration, "int"), 214);
  assert.equal(applied.basis.race, undefined);
});
