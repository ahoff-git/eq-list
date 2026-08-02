/**
 * The registry exists for one reason: EQ capitalizes a creature's name at the start of a
 * sentence and not mid-sentence, so the same mob arrives under two names. These pin that it
 * folds them without guessing from the capitalization — real proper nouns have to survive.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createNameRegistry } from "../../src/shared/name-registry";

test("the first spelling seen wins, whichever it was", () => {
  const lower = createNameRegistry();
  assert.equal(lower.canon("obsolete model"), "obsolete model");
  assert.equal(lower.canon("Obsolete model"), "obsolete model");

  const upper = createNameRegistry();
  assert.equal(upper.canon("Obsolete model"), "Obsolete model");
  assert.equal(upper.canon("obsolete model"), "Obsolete model");
});

test("a genuine proper noun keeps its capital", () => {
  const r = createNameRegistry();
  assert.equal(r.canon("Minotaur Lord"), "Minotaur Lord");
  assert.equal(r.canon("a coyote"), "a coyote");
});

test("distinct names don't interfere", () => {
  const r = createNameRegistry();
  assert.equal(r.canon("kobold runt"), "kobold runt");
  assert.equal(r.canon("kobold scout"), "kobold scout");
  assert.equal(r.canon("Kobold runt"), "kobold runt");
});

test("seeding decides the canonical spelling up front — for reloading stored records", () => {
  const r = createNameRegistry(["rogue clockwork"]);
  assert.equal(r.canon("Rogue clockwork"), "rogue clockwork");
});

test("clearing forgets everything, so the next spelling seen wins again", () => {
  const r = createNameRegistry();
  r.canon("obsolete model");
  r.clear();
  assert.equal(r.canon("Obsolete model"), "Obsolete model");
});
