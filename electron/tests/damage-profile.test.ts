/**
 * Black-box tests for the tally of damage taken, by type. Fights are built from verbatim log lines
 * through the real parser and cells, so a profile can't rest on a cell shape the log never produces.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDamageCells } from "../../src/shared/combat/damage-tree";
import { parseCombat } from "../../src/shared/combat/combat-parser";
import { damageProfile, isResistType, landedOnYou } from "../../src/shared/combat/damage-profile";
import { splitLine } from "../../src/shared/log-parser";
import type { DamageEvent, StoredFight } from "../../src/shared/types";

let ids = 0;

/** A stored fight carrying only the cells the lines produce. */
function fight(lines: string[]): StoredFight {
  const acc = createDamageCells();
  for (const line of lines) {
    const event = parseCombat(splitLine(`[Wed Jul 29 00:00:01 2026] ${line}`, 1)!)!;
    assert.equal(event.kind, "damage", line);
    acc.record(event as DamageEvent);
  }
  return { id: `f${++ids}`, sessionId: "s", label: "x", stats: { damageCells: acc.cells(), byCombatant: [] } } as unknown as StoredFight;
}

const types = (fights: StoredFight[]) => Object.fromEntries(damageProfile(fights).types.map((t) => [t.type, t.damage]));

test("damage to you sorts into melee, each resist type, and a remainder", () => {
  const f = fight([
    "A gnoll crushes YOU for 30 points of damage.",
    "A gnoll crushes YOU for 20 points of damage.",
    "Lord Nagafen hits YOU for 600 points of fire damage by Lava Breath.",
    "A spider hits YOU for 40 points of poison damage by Poison Bolt.",
    "You are burned by a fire beetle's flames for 7 points of non-melee damage.",
  ]);
  assert.deepEqual(types([f]), { fire: 600, poison: 40, melee: 50, other: 7 });
});

test("shares add up to the whole, biggest first, and only types that hit you appear", () => {
  const p = damageProfile([fight(["A gnoll crushes YOU for 75 points of damage.", "A mage hits YOU for 25 points of cold damage by Blast of Cold."])]);
  assert.deepEqual(p.types.map((t) => [t.type, t.share]), [["melee", 0.75], ["cold", 0.25]]);
  assert.equal(p.damage, 100);
  assert.equal(p.hits, 2);
});

test("only damage landed on you counts — not a group-mate's, not what you dealt", () => {
  const f = fight([
    "A gnoll crushes Bunnyslayer for 200 points of damage.",
    "You hit a gnoll for 100 points of cold damage by Blast of Cold.",
    "A gnoll crushes YOU for 10 points of damage.",
  ]);
  assert.deepEqual(types([f]), { melee: 10 });
});

test("fights add up, and one stored before cells existed is counted but contributes nothing", () => {
  const old = { id: "old", sessionId: "s", label: "x", stats: { byCombatant: [] } } as unknown as StoredFight;
  const p = damageProfile([fight(["A gnoll crushes YOU for 10 points of damage."]), fight(["A gnoll crushes YOU for 5 points of damage."]), old]);
  assert.deepEqual([p.fights, p.measured, p.damage], [3, 2, 15]);
});

test("nothing taken is an empty profile, not a division by zero", () => {
  assert.deepEqual(damageProfile([]), { fights: 0, measured: 0, damage: 0, hits: 0, types: [] });
});

test("the six resist types are the wiki's, and a damage word outside them isn't one", () => {
  for (const word of ["magic", "fire", "cold", "disease", "poison", "void"]) assert.ok(isResistType(word), word);
  assert.ok(!isResistType("melee"));
  assert.ok(!isResistType("non-melee"));
});

test("damage taken is what somebody else landed on you — not your pet's, and not your own", () => {
  assert.equal(landedOnYou({ attacker: "a gnoll", target: "You" }), true);
  assert.equal(landedOnYou({ attacker: "a gnoll", target: "Gobart" }), false);
  assert.equal(landedOnYou({ attacker: "You", target: "You" }), false);
  assert.equal(landedOnYou({ attacker: "You", target: "a gnoll" }), false);
});
