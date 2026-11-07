/**
 * Black-box tests for what one fight says to change: a resist or armour for what hit you, mana if you ran
 * dry in it, health if you died in it. Fights are built from verbatim log lines through the real parser and
 * cells, and the builder's headroom is the figures the real inventory and goals produced.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDamageCells } from "../../src/shared/combat/damage-tree";
import { parseCombat } from "../../src/shared/combat/combat-parser";
import { MIN_HITS } from "../../src/shared/combat/resist-worth";
import { survivalFound } from "../../src/shared/combat/survival";
import type { Headroom } from "../../src/shared/combat/headroom";
import { splitLine } from "../../src/shared/log-parser";
import type { DamageEvent, DeathRecap, FightStats } from "../../src/shared/types";

const HEADROOM: Headroom = { ac: { wearing: 60, loadout: 125 }, hp: { wearing: 44, loadout: 103 }, mana: { wearing: 991, loadout: 1653 } };

const times = (n: number, line: string): string[] => Array.from({ length: n }, () => line);
const recap = (totalTaken: number): DeathRecap => ({ at: "2026-10-28T07:12:00.000Z", killer: "Lord Nagafen", incoming: [], totalTaken, windowSec: 15 });

/** A fight carrying only what survival reads: the damage cells the lines produce, deaths, and whether you ran dry. */
function fight(lines: string[], more: { deaths?: DeathRecap[]; outOfMana?: number } = {}): FightStats {
  const acc = createDamageCells();
  for (const line of lines) acc.record(parseCombat(splitLine(`[Wed Jul 29 00:00:01 2026] ${line}`, 1)!)! as DamageEvent);
  return { damageCells: acc.cells(), byCombatant: [], deaths: more.deaths ?? [], outOfMana: more.outOfMana } as unknown as FightStats;
}

const BREATH = "Lord Nagafen hits YOU for 600 points of fire damage by Lava Breath.";
const SWING = "A fire giant warrior crushes YOU for 100 points of damage.";

test("a fire-heavy death suggests the resist, and health with what landed on you first", () => {
  const found = survivalFound(fight([...times(24, BREATH), ...times(10, SWING)], { deaths: [recap(696)] }), HEADROOM);
  assert.deepEqual(found.resists.map((r) => r.type), ["fire"]);
  assert.equal(found.ac, null, "melee is under half of it");
  assert.equal(found.mana, null, "you didn't run dry");
  assert.deepEqual(found.hp, { wearing: 44, loadout: 103, gain: 59, died: 1, fights: 1, burst: { taken: 696, windowSec: 15 } });
});

test("a death mostly to swings suggests armour, not a resist", () => {
  const found = survivalFound(fight(times(MIN_HITS, SWING), { deaths: [recap(900)] }), HEADROOM);
  assert.deepEqual(found.resists, []);
  assert.equal(found.ac?.gain, 65);
});

test("running dry in the fight, and only that, suggests mana", () => {
  const dry = survivalFound(fight(times(3, SWING), { outOfMana: 2 }), HEADROOM);
  assert.deepEqual(dry.mana, { wearing: 991, loadout: 1653, gain: 662, dry: 2, casting: 1 });
  assert.equal(survivalFound(fight(times(3, SWING), { outOfMana: 0 }), HEADROOM).mana, null);
  assert.equal(survivalFound(fight(times(3, SWING)), HEADROOM).mana, null, "a fight stored before it was recorded can't say");
});

test("health is for a fight you died in; a fight you walked away from gets none", () => {
  assert.equal(survivalFound(fight(times(40, SWING)), HEADROOM).hp, null);
  assert.ok(survivalFound(fight(times(3, SWING), { deaths: [recap(500)] }), HEADROOM).hp, "a thin fight still has a death in it");
});

test("a fight too thin to read the damage of names no resist or armour, however it ended", () => {
  const found = survivalFound(fight(times(MIN_HITS - 1, BREATH), { deaths: [recap(500)] }), HEADROOM);
  assert.deepEqual([found.resists, found.ac], [[], null]);
});

test("without the builder's figures the resists still show, and armour, mana and health wait", () => {
  const found = survivalFound(fight(times(MIN_HITS, BREATH), { deaths: [recap(500)], outOfMana: 1 }), undefined);
  assert.deepEqual(found.resists.map((r) => r.type), ["fire"]);
  assert.deepEqual([found.ac, found.mana, found.hp], [null, null, null]);
});

test("a loadout that reaches no more health than you wear has no health to suggest", () => {
  const found = survivalFound(fight(times(3, SWING), { deaths: [recap(500)] }), { ...HEADROOM, hp: { wearing: 103, loadout: 103 } });
  assert.equal(found.hp, null);
});

test("the burst is the newest death's, and absent when nothing landed first", () => {
  const two = survivalFound(fight(times(3, SWING), { deaths: [recap(900), recap(300)] }), HEADROOM);
  assert.deepEqual([two.hp?.died, two.hp?.burst?.taken], [2, 900]);
  assert.equal(survivalFound(fight(times(3, SWING), { deaths: [recap(0)] }), HEADROOM).hp?.burst, undefined);
});
