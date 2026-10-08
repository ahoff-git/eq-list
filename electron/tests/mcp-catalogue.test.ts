/**
 * The argument-shaping `scripts/mcp-server.mjs`'s catalogue tools lean on
 * (`src/shared/mcp-catalogue.ts`) — pure, so no temp directory and no network, the same as any other
 * tested black box in here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { eraFiltered, NONE_FACET_LABEL, page, toItemCriteria, withNoneSentinel } from "../../src/shared/items/mcp-catalogue";

const SENTINEL = "\u0000none";

test("withNoneSentinel translates only the picker's own label, nothing else", () => {
  assert.deepEqual(withNoneSentinel(["Befallen", NONE_FACET_LABEL, "Highpass"], SENTINEL), ["Befallen", SENTINEL, "Highpass"]);
  assert.deepEqual(withNoneSentinel([], SENTINEL), []);
  // A real zone that merely contains the word "none" must not be mistaken for the sentinel.
  assert.deepEqual(withNoneSentinel(["Nonechester"], SENTINEL), ["Nonechester"]);
});

test("toItemCriteria maps every facet key present, and only those", () => {
  const args = { text: "dirk", zone: ["Befallen", NONE_FACET_LABEL], levelMin: 5, levelMax: 10, mins: { int: 3 }, hideOutOfEra: true };
  const criteria = toItemCriteria(args, ["zone", "slot", "class"], SENTINEL);
  assert.equal(criteria.text, "dirk");
  assert.deepEqual(criteria.facets, { zone: ["Befallen", SENTINEL], slot: [], class: [] }, "every passed facet key gets an array, ticked or empty");
  assert.deepEqual(criteria.mins, { int: 3 });
  assert.equal(criteria.hideOutOfEra, true);
  assert.equal(criteria.levelMin, 5);
  assert.equal(criteria.levelMax, 10);
});

test("toItemCriteria defaults text to empty and mins to {} when the tool call omitted them", () => {
  const criteria = toItemCriteria({ hideOutOfEra: false }, ["zone"], SENTINEL);
  assert.equal(criteria.text, "");
  assert.deepEqual(criteria.mins, {});
  assert.deepEqual(criteria.facets, { zone: [] });
  assert.equal(criteria.levelMin, undefined);
  assert.equal(criteria.levelMax, undefined);
});

test("page reports the filtered total, not the page size", () => {
  const rows = Array.from({ length: 130 }, (_, i) => i);
  const first = page(rows, { limit: 50, offset: 0 });
  assert.equal(first.total, 130);
  assert.deepEqual(first.items, rows.slice(0, 50));

  const last = page(rows, { limit: 50, offset: 100 });
  assert.equal(last.total, 130, "total doesn't shrink to match a short final page");
  assert.deepEqual(last.items, rows.slice(100));

  const past = page(rows, { limit: 50, offset: 500 });
  assert.equal(past.total, 130);
  assert.deepEqual(past.items, [], "an offset past the end is an empty page, not an error");
});

test("page never mutates its input", () => {
  const rows = [3, 1, 2];
  page(rows, { limit: 2, offset: 0 });
  assert.deepEqual(rows, [3, 1, 2]);
});

test("eraFiltered cuts only rows explicitly flagged true", () => {
  const rows = [{ title: "A", outOfEra: true }, { title: "B", outOfEra: false }, { title: "C" }];
  assert.deepEqual(
    eraFiltered(rows, true).map((r) => r.title),
    ["B", "C"],
    "flagged-false and never-flagged both survive — only an explicit true is cut",
  );
});

test("eraFiltered is a no-op (but still a fresh array) when not asked to hide anything", () => {
  const rows = [{ title: "A", outOfEra: true }];
  const kept = eraFiltered(rows, false);
  assert.deepEqual(kept, rows);
  assert.notEqual(kept, rows, "a copy, not the same array reference — callers that push onto the result must not touch the input");
});

test("eraFiltered on an empty list is empty either way", () => {
  assert.deepEqual(eraFiltered([], true), []);
  assert.deepEqual(eraFiltered([], false), []);
});
