/**
 * Black-box tests for the fuzzy matcher. These pin the behavior that makes the
 * search box forgiving of EQ's unspellable item names — typos, transpositions,
 * partial and out-of-order words — while still rejecting unrelated noise.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fuzzyScore, fuzzyRank, tokenize, levenshtein } from "../../src/shared/fuzzy";

test("tokenize splits on punctuation and lowercases", () => {
  assert.deepEqual(tokenize("Nillipus' March of the Wee"), ["nillipus", "march", "of", "the", "wee"]);
  assert.deepEqual(tokenize("Crushbone Belt +5"), ["crushbone", "belt", "5"]);
});

test("levenshtein basics", () => {
  assert.equal(levenshtein("metalic", "metallic"), 1);
  assert.equal(levenshtein("abc", "abc"), 0);
});

test("exact and prefix score highest", () => {
  assert.equal(fuzzyScore("crushbone belt", "Crushbone Belt"), 1);
  assert.ok(fuzzyScore("crush", "Crushbone Belt") >= 0.9);
});

test("typos still match well", () => {
  assert.ok(fuzzyScore("shiny metalic robe", "Shining Metallic Robe") >= 0.6);
  assert.ok(fuzzyScore("banded mial", "Banded Mail") >= 0.6);
});

test("word order and partial words match", () => {
  assert.ok(fuzzyScore("robe metallic", "Shining Metallic Robe") >= 0.6);
  assert.ok(fuzzyScore("crushbone belt", "Crushbone Belt +5") >= 0.8);
});

test("unrelated text is rejected", () => {
  assert.ok(fuzzyScore("xyzzy", "Crushbone Belt") < 0.45);
  assert.ok(fuzzyScore("fire opal", "Rusty Long Sword") < 0.45);
});

test("fuzzyRank returns best matches, filtered and ordered", () => {
  const names = ["Crushbone Belt", "Crushbone Belt +5", "Bronze Belt", "Rusty Long Sword", "Shining Metallic Robe"];
  const ranked = fuzzyRank("crushbon belt", names, (n) => n, { limit: 5 });
  assert.equal(ranked[0].item, "Crushbone Belt"); // tighter match wins the tie
  assert.ok(ranked.some((r) => r.item === "Crushbone Belt +5"));
  assert.ok(!ranked.some((r) => r.item === "Rusty Long Sword"));
});
