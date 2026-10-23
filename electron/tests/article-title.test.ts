/**
 * Black-box tests for `articledTitle`: a bare name from the kill log finds the wiki's articled title.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { articledTitle } from "../../src/shared/mob/articled-title";

const TITLES = ["A ghoul sage", "Lower Guk", "An ancient wyvern", "Ghoul Sage Quest"];

test("a bare mob name finds the wiki's title with its article", () => {
  assert.equal(articledTitle("ghoul sage", TITLES), "A ghoul sage");
  assert.equal(articledTitle("ancient wyvern", TITLES), "An ancient wyvern");
});

test("the title asked for is never its own answer, in any case", () => {
  assert.equal(articledTitle("A ghoul sage", ["A ghoul sage"]), undefined);
  assert.equal(articledTitle("a ghoul sage", ["A ghoul sage"]), undefined);
});

test("only the same name matches — a longer title that contains it doesn't", () => {
  assert.equal(articledTitle("ghoul sage quest", TITLES), undefined);
  assert.equal(articledTitle("ghoul", TITLES), undefined);
  assert.equal(articledTitle("", TITLES), undefined);
});
