/**
 * Black-box tests for what a typed search may be (`src/shared/search-query.ts`), and that the wiki's searches hold to
 * it: the fuzzy matcher is linear in the query's length (about 0.9 ms a character over a real cache), nothing capped
 * the query, and a 2 MB one held the main process at 100% CPU for half an hour — found by fuzzing the app's own API.
 * Only need re-running if the module or those entry points change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MAX_QUERY_CHARS, cleanQuery } from "../../src/shared/search-query";
import { createWikiClient, closeOwnedDatabases } from "../wiki";

test("a normal query comes through as typed, trimmed", () => {
  assert.equal(cleanQuery("  Dragoon Dirk +2 "), "Dragoon Dirk +2");
  assert.equal(cleanQuery("ab"), "ab");
  assert.equal(cleanQuery(""), "");
});

test("only a string is a query — anything else is the empty one, not an error", () => {
  for (const junk of [undefined, null, 42, NaN, {}, [], ["x"], true, () => "x"]) assert.equal(cleanQuery(junk), "", String(junk));
});

test("a query longer than any name is cut, so a search stays fast however much was pasted", () => {
  assert.equal(cleanQuery("x".repeat(2_000_000)).length, MAX_QUERY_CHARS);
  assert.equal(cleanQuery("a".repeat(MAX_QUERY_CHARS)).length, MAX_QUERY_CHARS, "exactly at the limit is untouched");
  assert.equal(cleanQuery("abcdef", 3), "abc", "the limit can be asked for");
});

test("the cut keeps the start — what a person typed first — and still trims", () => {
  assert.equal(cleanQuery(`rusty short sword${" ".repeat(MAX_QUERY_CHARS)}tail`), "rusty short sword");
});

/** A wiki client over a cache whose title index is already fresh, so nothing is fetched to fill it. */
async function withSeededIndex(run: (wiki: ReturnType<typeof createWikiClient>) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eqlist-query-"));
  const titles = Array.from({ length: 20_000 }, (_, i) => `Item ${i} of the Ancient Frost`);
  titles.push("Rusty Short Sword");
  fs.writeFileSync(path.join(dir, "title-index.json"), JSON.stringify({ fetchedAt: new Date().toISOString(), titles }));
  const realFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("network disabled for this test"))) as typeof fetch;
  try {
    await run(createWikiClient(dir, { ttlMs: () => 1000 }));
  } finally {
    globalThis.fetch = realFetch;
    closeOwnedDatabases(dir);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("a huge query is answered at once, not worked on: 20,000 characters took ~15 s before", async () => {
  await withSeededIndex(async (wiki) => {
    const started = Date.now();
    await wiki.search("x".repeat(20_000)).catch(() => []);
    assert.ok(Date.now() - started < 3000, `took ${Date.now() - started}ms`);
  });
});

test("a malformed query is the empty query, not a rejected search", async () => {
  await withSeededIndex(async (wiki) => {
    for (const term of [null, undefined, 42, {}, ["x"]] as unknown as string[]) {
      assert.deepEqual(await wiki.search(term), [], `search(${JSON.stringify(term)})`);
      assert.deepEqual(await wiki.searchFactions(term), [], `searchFactions(${JSON.stringify(term)})`);
      assert.deepEqual(await wiki.searchZones(term), [], `searchZones(${JSON.stringify(term)})`);
    }
  });
});

test("an ordinary search still finds what it should", async () => {
  await withSeededIndex(async (wiki) => {
    const hits = await wiki.search("rusty short sord"); // a misspelling, as people type
    assert.equal(hits[0]?.title, "Rusty Short Sword");
  });
});
