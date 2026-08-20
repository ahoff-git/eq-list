/**
 * Black-box tests for the vocabulary of things you have actually held — what search offers when
 * the wiki's index can't answer ([ADR 0103]).
 *
 * The case that produced it is pinned first: an item that has dropped for you many times and has
 * no wiki page at all must be findable, by a query with the spelling a player would type.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { knownItems, searchKnownItems, unknownToTheWiki } from "../../src/shared/known-items";
import type { MobKnowledge } from "../../src/shared/mob-stats";
import type { LootedItem, SearchResult } from "../../src/shared/types";

const looted = (item: string, count = 1, lastAt = "2026-07-17T18:41:14"): LootedItem => ({
  item,
  count,
  qty: count,
  lastAt,
});

const known = (mob: string, drops: Record<string, number>, lastAt = "2026-07-17T18:41:14"): MobKnowledge => ({
  mob,
  zone: "Kejaar Sanctum",
  kills: 40,
  myKills: 40,
  drops: Object.entries(drops).map(([item, count]) => ({ item, count, rate: count / 40, myCount: count })),
  lastAt,
  contributors: [],
  copper: 0,
  copperPerKill: 0,
});

const hit = (title: string): SearchResult => ({ title, wikiPath: `/${title.replace(/ /g, "_")}` });

test("an item the wiki has never heard of is found by name", () => {
  const items = knownItems([looted("Desecrated Kejaar Totem", 12)], []);
  const [found] = searchKnownItems("desecrated kejaar totem", items);
  assert.equal(found.item, "Desecrated Kejaar Totem");
  assert.equal(found.count, 12);
  // The same tolerance the wiki's index is searched with — one query, one standard.
  assert.equal(searchKnownItems("kejaar totem", items).length, 1);
  assert.equal(searchKnownItems("desecrated kejar totemm", items).length, 1, "EQ names are unspellable");
});

test("the two records are one vocabulary, and the kills say who dropped it", () => {
  const items = knownItems(
    [looted("Desecrated Kejaar Totem", 12)],
    [known("a kejaar zealot", { "Desecrated Kejaar Totem": 9 }), known("a kejaar priest", { "Desecrated Kejaar Totem": 3 })],
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].count, 24, "sightings from both records count");
  assert.deepEqual(items[0].mobs, ["a kejaar zealot", "a kejaar priest"]);
});

// A drop whose loot lines have aged out of the 20,000-line ledger is still known by the kills that
// produced it — which is why both records are read rather than whichever is handier.
test("a mob's tally alone is enough to know an item exists", () => {
  const items = knownItems([], [known("a kejaar zealot", { "Kejaar Robe": 2 })]);
  assert.deepEqual(items.map((i) => i.item), ["Kejaar Robe"]);
});

test("every grade of an item is one entry, named by the item", () => {
  const items = knownItems([looted("Dragoon Dirk +1", 3), looted("Dragoon Dirk +2", 1)], []);
  assert.deepEqual(items.map((i) => [i.item, i.count]), [["Dragoon Dirk", 4]]);
  // And a query carrying a grade still finds it, the way `wiki.search` base-names its own query.
  assert.equal(searchKnownItems("Dragoon Dirk +2", items).length, 1);
});

test("the best-evidenced entry leads", () => {
  const items = knownItems([looted("Bone Chips", 2), looted("Rat Ears", 30)], []);
  assert.deepEqual(items.map((i) => i.item), ["Rat Ears", "Bone Chips"]);
});

test("the latest sighting wins, whichever record it came from", () => {
  const items = knownItems(
    [looted("Bone Chips", 1, "2026-07-01T10:00:00")],
    [known("a skeleton", { "Bone Chips": 4 }, "2026-08-14T22:10:00")],
  );
  assert.equal(items[0].lastAt, "2026-08-14T22:10:00");
});

// The whole point of the addition is to answer what the wiki *can't*: an item it does know stays a
// wiki result, with its evidence on the page it opens, and is never offered twice.
test("anything the wiki answered is dropped from your own list", () => {
  const items = knownItems([looted("Bone Chips", 5), looted("Desecrated Kejaar Totem", 12)], []);
  const found = searchKnownItems("bone chips", items);
  assert.equal(unknownToTheWiki(found, [hit("Bone Chips")]).length, 0);
  assert.equal(unknownToTheWiki(found, [hit("bone  chips")]).length, 0, "spacing and case are not a difference");
  assert.equal(unknownToTheWiki(found, [hit("Bone Chip Bracelet")]).length, 1, "a different item is not a cover");
});

test("a graded name is covered by the wiki's base page", () => {
  const items = knownItems([looted("Dragoon Dirk +2", 2)], []);
  assert.equal(unknownToTheWiki(searchKnownItems("dragoon dirk", items), [hit("Dragoon Dirk")]).length, 0);
});

test("a query too short to mean anything offers nothing", () => {
  const items = knownItems([looted("Bone Chips", 5)], []);
  assert.deepEqual(searchKnownItems("b", items), []);
  assert.deepEqual(searchKnownItems("   ", items), []);
});

test("nothing held is nothing offered, rather than everything", () => {
  assert.deepEqual(knownItems([], []), []);
  assert.deepEqual(searchKnownItems("bone chips", []), []);
});
