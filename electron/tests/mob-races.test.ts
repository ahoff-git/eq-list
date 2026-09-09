/**
 * Tests for the mob → race lookup (ADR 0215): folding a kill's name to match the wiki's own title,
 * and the generous either-contains-the-other race match `goalWantsMob` already established the
 * precedent for.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isRace, raceOf } from "../../src/shared/mob-races";

test("raceOf reads a real mob's race back, case-insensitively", () => {
  assert.equal(raceOf("Peg Leg"), "Dwarf");
  assert.equal(raceOf("peg leg"), "Dwarf");
  assert.equal(raceOf("PEG LEG"), "Dwarf");
});

test("raceOf answers undefined for a name the table has never heard of, rather than guessing", () => {
  assert.equal(raceOf("Not A Real Mob At All"), undefined);
});

test("isRace matches generously — a family name also reaches a qualified variant", () => {
  assert.equal(raceOf("Klok Margar"), "Iksar Citizen");
  assert.equal(isRace("Klok Margar", "Iksar"), true); // "Iksar" reaches "Iksar Citizen"
  assert.equal(isRace("Peg Leg", "Dwarf"), true); // an exact race still matches too
  assert.equal(isRace("Peg Leg", "Ogre"), false);
});

test("isRace answers false for an unknown name rather than throwing", () => {
  assert.equal(isRace("Not A Real Mob At All", "Human"), false);
});
