/**
 * Black-box tests for `proc-spotter.ts` — a spell hit its attacker was never seen casting is a
 * proc (ADR 0339). Every line is verbatim from a real EQ Legends log.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCombat } from "../../src/shared/combat/combat-parser";
import { createProcSpotter } from "../../src/shared/combat/proc-spotter";
import { splitLine } from "../../src/shared/log-parser";
import type { CombatEvent } from "../../src/shared/types";

const TS = "[Mon Aug 03 22:55:18 2026] ";

const parse = (message: string): CombatEvent => {
  const line = splitLine(TS + message, 1);
  const event = line && parseCombat(line);
  assert.ok(event, `unparsed: ${message}`);
  return event;
};

/** Feed the lines in order, the way the tracker does, and say which were procs. */
function run(messages: string[]): boolean[] {
  const procs = createProcSpotter();
  return messages.map((message) => {
    const event = parse(message);
    procs.note(event);
    return procs.isProc(event);
  });
}

test("a weapon's spell hit with no cast line is a proc", () => {
  assert.deepEqual(
    run(["Astah reaves Master Brewer for 1 point of damage.", "Astah hit Master Brewer for 48 points of magic damage by Reaving Strike."]),
    [false, true],
  );
});

test("a spell its attacker was seen casting is not a proc", () => {
  assert.deepEqual(run(["You begin casting Blast of Cold.", "You hit a coyote for 12 points of cold damage by Blast of Cold."]), [false, false]);
});

test("the cast is per caster — someone else casting the spell doesn't make yours a cast", () => {
  assert.deepEqual(
    run([
      "Kaer begins casting Burn.",
      "Kaer hit a fire elemental for 16 points of fire damage by Burn.",
      "Bunnyslayer hit Flaming Wraith for 14 points of fire damage by Burn.",
    ]),
    [false, false, true],
  );
});

test("a cast spell's rank doesn't stop it pairing with its landing", () => {
  assert.deepEqual(
    run(["You begin casting Shock of Lightning VI.", "You hit Flaming Wraith for 80 points of magic damage by Shock of Lightning."]),
    [false, false],
  );
});

test("swings, damage shields and DoT ticks are never procs", () => {
  assert.deepEqual(
    run([
      "Bunnyslayer slashes Flaming Wraith for 38 points of damage.",
      "A wild tiger is pierced by YOUR thorns for 1 point of non-melee damage.",
      "A minotaur slaver has taken 29 damage from your Heat Blood.",
    ]),
    [false, false, false],
  );
});

test("a pet's buff proc is the pet's proc", () => {
  assert.deepEqual(run(["Kainos`s warder hit a coyote for 60 points of magic damage by Spirit of Lightning Strike."]), [true]);
});
