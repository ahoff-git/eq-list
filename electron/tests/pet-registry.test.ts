/**
 * Black-box tests for the two halves of "this pet is mine": the line grammar
 * (`parseCombat`'s pet-engage branch) and the registry it feeds (`createPetRegistry`).
 *
 * The grammar is the risky half — the wording is the client's, not something the app controls —
 * so the sentences are pinned verbatim, including the ones that must *not* match. The registry
 * half is small, but the rule it encodes is the whole point: a pet is learned **only** from the
 * game telling you it's yours, never from the shape of a name, because a group-mate's name and a
 * named pet's are indistinguishable in a damage line.
 *
 * Only needs re-running if `combat-parser.ts` or `pet-registry.ts` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCombat } from "../../src/shared/combat-parser";
import { splitLine } from "../../src/shared/log-parser";
import { createPetRegistry } from "../../src/shared/pet-registry";
import type { PetEngageEvent } from "../../src/shared/types";

const TS = "[Wed Jul 29 00:12:33 2026] ";
const parse = (message: string) => parseCombat(splitLine(TS + message, 1)!);

test("a pet's attack confirmation names the pet and its target", () => {
  const event = parse("Garn told you, 'Attacking a coyote Master.'") as PetEngageEvent;
  assert.equal(event?.kind, "pet-engage");
  assert.equal(event.pet, "Garn");
  // The target is folded the way every other combatant name is, so it keys the same as the
  // swing that follows it — otherwise engaging the enemy here wouldn't admit that swing.
  assert.equal(event.target, "a coyote");
});

test("a multi-word target survives, and the trailing Master is not part of it", () => {
  const event = parse("Gyrjax told you, 'Attacking Lord Nagafen Master.'") as PetEngageEvent;
  assert.equal(event.pet, "Gyrjax");
  assert.equal(event.target, "Lord Nagafen");
});

test("the present tense is accepted too", () => {
  const event = parse("Garn tells you, 'Attacking a coyote Master.'") as PetEngageEvent;
  assert.equal(event?.kind, "pet-engage");
  assert.equal(event.pet, "Garn");
});

test("an ordinary tell is not a pet engaging", () => {
  // The nearest miss available: a player talking to you about attacking something. Without
  // the trailing "Master." this must stay out of the registry, or a stranger's damage
  // starts counting as yours.
  assert.equal(parse("Galactic tells you, 'Attacking a coyote now.'"), null);
  assert.equal(parse("Galactic tells you, 'go ahead and pull Master.'"), null);
});

test("a pet's own swing is still just a swing", () => {
  // The engage line is the only thing that proves ownership; the damage line it precedes
  // says nothing, and must keep parsing as ordinary damage.
  const event = parse("Garn hits a coyote for 12 points of damage.");
  assert.equal(event?.kind, "damage");
});

test("the registry only knows what it was told", () => {
  const pets = createPetRegistry();
  assert.equal(pets.has("Garn"), false);
  pets.note("Garn");
  assert.equal(pets.has("Garn"), true);
  // Case-folded, because the log capitalises a name to start a sentence.
  assert.equal(pets.has("garn"), true);
  assert.equal(pets.has("GARN"), true);
  // A group-mate is not a pet, and nothing about a bare name could make it one.
  assert.equal(pets.has("Galactic"), false);
});

test("the first spelling wins and a repeat is not a second pet", () => {
  const pets = createPetRegistry();
  pets.note("Garn");
  pets.note("garn");
  pets.note("Garn");
  assert.deepEqual(pets.names(), ["Garn"]);
});

test("blank names are ignored rather than stored", () => {
  const pets = createPetRegistry();
  pets.note("");
  pets.note("   ");
  assert.deepEqual(pets.names(), []);
  // An empty query can never be a hit, or every unnamed attacker would read as your pet.
  assert.equal(pets.has(""), false);
});

test("clearing forgets everything", () => {
  const pets = createPetRegistry();
  pets.note("Garn");
  pets.clear();
  assert.equal(pets.has("Garn"), false);
  assert.deepEqual(pets.names(), []);
});
