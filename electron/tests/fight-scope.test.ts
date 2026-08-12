/**
 * Black-box tests for the "is this my fight?" gate. Every case here is a shape a real log
 * produces at a busy camp, fed one line at a time, because that's how the gate has to
 * decide — no lookahead, no second pass. Only needs re-running if `fight-scope.ts` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createFightScope, type FightScope } from "../../src/shared/fight-scope";
import { isYours, parseCombat } from "../../src/shared/combat-parser";
import { splitLine } from "../../src/shared/log-parser";
import type { CombatEvent } from "../../src/shared/types";

const event = (message: string): CombatEvent =>
  parseCombat(splitLine(`[Wed Jul 29 00:00:01 2026] ${message}`, 1)!) as CombatEvent;

/** A scope for `Kainos`, optionally grouped with `mates`. */
function scopeFor(...mates: string[]): FightScope {
  const ours = (name: string) =>
    isYours(name, "Kainos") || mates.some((m) => isYours(name, m));
  return createFightScope({ ours });
}

/** Which of `messages` the scope let through, in order. */
const admitted = (scope: FightScope, messages: string[]): string[] =>
  messages.filter((m) => scope.admits(event(m)));

test("your own swings are in, and open the fight", () => {
  const scope = scopeFor();
  assert.equal(scope.admits(event("You pierce a coyote for 6 points of damage.")), true);
  assert.equal(scope.fought("a coyote"), true);
  // The kill line strips the article and the log capitalizes mid-sentence — one creature.
  assert.equal(scope.fought("coyote"), true);
  assert.equal(scope.fought("A coyote"), true);
  assert.equal(scope.fought("a rat"), false);
});

test("a fight nobody of ours is in never starts", () => {
  const scope = scopeFor();
  assert.deepEqual(
    admitted(scope, [
      "Randomguy slashes a wolf for 40 points of damage.",
      "A wolf bites Randomguy for 12 points of damage.",
      "Randomguy tries to slash a wolf, but misses!",
      "Randomguy healed himself for 30 hit points.",
      "A wolf has taken 3 damage by Plague Rat Disease.",
    ]),
    [],
  );
  assert.equal(scope.fought("a wolf"), false);
});

test("what your side is fighting is in, whoever the line is about", () => {
  const scope = scopeFor("Bunnyslayer");
  const lines = [
    "You pierce a coyote for 6 points of damage.", // opens the fight
    "A coyote bites Bunnyslayer for 9 points of damage.", // a group-mate taking it
    "Randomguy slashes a coyote for 40 points of damage.", // a passer-by helping on our mob
    "Bunnyslayer healed Randomguy for 30 hit points.", // …and being healed for it
  ];
  assert.deepEqual(admitted(scope, lines), lines);
});

test("a group-mate's own pull is yours; a stranger's is not", () => {
  const scope = scopeFor("Bunnyslayer");
  assert.deepEqual(
    admitted(scope, [
      "Bunnyslayer slashes a gnoll for 40 points of damage.",
      "Bunnyslayer`s warder bites a gnoll for 8 points of damage.",
      "Randomguy slashes a wolf for 40 points of damage.",
      "Randomguy`s warder bites a wolf for 8 points of damage.",
    ]),
    [
      "Bunnyslayer slashes a gnoll for 40 points of damage.",
      "Bunnyslayer`s warder bites a gnoll for 8 points of damage.",
    ],
  );
});

test("a new fight forgets the last one's enemies", () => {
  const scope = scopeFor();
  scope.admits(event("You pierce a coyote for 6 points of damage."));
  scope.reset();
  assert.equal(scope.fought("a coyote"), false);
  // …so the next pull has to be ours to count, even against the same kind of mob.
  assert.equal(scope.admits(event("Randomguy slashes a coyote for 40 points of damage.")), false);
});

test("a damage shield engages whatever ran into it", () => {
  const scope = scopeFor();
  // The wearer is the attacker, the one who ran into it is the target — so your pet's shield
  // burning a mob is your side hitting it.
  assert.equal(
    scope.admits(event("A coyote is burned by Kainos`s warder's flames for 2 points of non-melee damage.")),
    true,
  );
  assert.equal(scope.fought("a coyote"), true);
});

test("your own casts and deaths always belong to you", () => {
  const scope = scopeFor();
  assert.equal(scope.admits(event("You begin casting Blast of Cold.")), true);
  assert.equal(scope.admits(event("Your Blast of Cold spell fizzles!")), true);
  assert.equal(scope.admits(event("You have been slain by a coyote!")), true);
  assert.equal(scope.admits(event("You assume a balanced stance.")), true);
  // Somebody else's cast is somebody else's, until their target is one we're fighting.
  assert.equal(scope.admits(event("Randomguy begins casting Lifespike.")), false);
});

test("with no idea who you are, nothing can be called somebody else's", () => {
  const blind = createFightScope({ ours: () => false, sidesKnown: () => false });
  assert.equal(blind.admits(event("Randomguy slashes a wolf for 40 points of damage.")), true);
});
