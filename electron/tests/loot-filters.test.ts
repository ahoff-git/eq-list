/**
 * Black-box tests for the Loot tab's filters and sorts. The ledger outlives every run, so these
 * pin the two things that make a few hundred rows readable: narrowing to what you asked for, and
 * a column order that doesn't quietly reshuffle drops the log stamped in the same second.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LOOT_FILTERS,
  DEFAULT_LOOT_SORT,
  filterLoot,
  isFiltered,
  lootSources,
  sortLoot,
  sortPrices,
  tallyFates,
} from "../../src/shared/loot-filters";
import { normalizeItemName } from "../../src/shared/grouping";
import type { ItemPrice, LootEvent, LootFate } from "../../src/shared/types";

function drop(p: Partial<LootEvent> & { item: string }): LootEvent {
  return {
    kind: "loot",
    qty: 1,
    source: "an orc centurion",
    fate: "kept" as LootFate,
    logId: 1,
    raw: "",
    at: "2026-07-17T18:41:14",
    ...p,
  };
}

// Newest first, and the last two share a log second — the log only counts whole ones.
const feed: LootEvent[] = [
  drop({ item: "Crushbone Belt +2", at: "2026-07-17T19:00:00", qty: 1, source: "an orc centurion" }),
  drop({ item: "Bone Chips", at: "2026-07-17T18:50:00", qty: 4, fate: "sold", source: "a skeleton" }),
  drop({ item: "Rat Ear", at: "2026-07-17T18:41:14", fate: "stored", source: "a large rat" }),
  drop({ item: "Spider Silk", at: "2026-07-17T18:41:14", qty: 2, source: "a spiderling" }),
];

test("no filters is everything, and says so", () => {
  assert.equal(isFiltered(DEFAULT_LOOT_FILTERS), false);
  assert.equal(filterLoot(feed, DEFAULT_LOOT_FILTERS).length, feed.length);
});

test("a fate, a name and a corpse each narrow the feed", () => {
  const byFate = filterLoot(feed, { ...DEFAULT_LOOT_FILTERS, fate: "sold" });
  assert.deepEqual(byFate.map((d) => d.item), ["Bone Chips"]);

  // Substring and case-insensitive: you type what you remember of the name.
  const byName = filterLoot(feed, { ...DEFAULT_LOOT_FILTERS, item: "belt" });
  assert.deepEqual(byName.map((d) => d.item), ["Crushbone Belt +2"]);

  const bySource = filterLoot(feed, { ...DEFAULT_LOOT_FILTERS, source: "a large rat" });
  assert.deepEqual(bySource.map((d) => d.item), ["Rat Ear"]);
  assert.ok(isFiltered({ ...DEFAULT_LOOT_FILTERS, source: "a large rat" }));
});

test("'on my list' matches the way the store matches, grade and all", () => {
  // The list holds "Crushbone Belt"; what dropped was a "+2" of it (ADR 0057).
  const wanted = new Set(["Crushbone Belt"].map(normalizeItemName));
  const shown = filterLoot(feed, { ...DEFAULT_LOOT_FILTERS, wantedOnly: true }, wanted);
  assert.deepEqual(shown.map((d) => d.item), ["Crushbone Belt +2"]);
});

test("with nothing on the list, 'on my list' shows nothing rather than everything", () => {
  assert.deepEqual(filterLoot(feed, { ...DEFAULT_LOOT_FILTERS, wantedOnly: true }), []);
});

test("tallies count stacks, not lines", () => {
  const counts = tallyFates(feed);
  assert.equal(counts.kept, 3, "one belt + two silk");
  assert.equal(counts.sold, 4, "a stack of four bone chips");
  assert.equal(counts.stored, 1);
  assert.equal(counts.combined, 0);
});

test("the corpse filter's choices are the corpses present, deduped and sorted", () => {
  assert.deepEqual(lootSources([...feed, drop({ item: "Bone Chips", source: "a skeleton" })]), [
    "a large rat",
    "a skeleton",
    "a spiderling",
    "an orc centurion",
  ]);
});

// The one that matters: sorting by a clock that only counts seconds must not reorder two drops
// off the same corpse. A stable sort is what guarantees it.
test("the default sort keeps same-second drops in the order they were looted", () => {
  const sorted = sortLoot(feed, DEFAULT_LOOT_SORT);
  assert.deepEqual(sorted.map((d) => d.item), feed.map((d) => d.item));
});

test("a column sorts both ways", () => {
  const up = sortLoot(feed, { key: "item", desc: false }).map((d) => d.item);
  assert.deepEqual(up, ["Bone Chips", "Crushbone Belt +2", "Rat Ear", "Spider Silk"]);
  assert.deepEqual(sortLoot(feed, { key: "item", desc: true }).map((d) => d.item), [...up].reverse());
  assert.deepEqual(sortLoot(feed, { key: "qty", desc: true })[0].item, "Bone Chips");
});

const prices: ItemPrice[] = [
  { item: "Bone Chips", unitCopper: 4, qty: 40, copper: 160, sales: 10, lastAt: "2026-07-17T18:00:00" },
  { item: "Rat Ear", unitCopper: 12, qty: 3, copper: 36, sales: 3, lastAt: "2026-07-18T09:00:00" },
];

test("prices sort by any column, biggest earner first by default", () => {
  assert.deepEqual(sortPrices(prices, { key: "copper", desc: true }).map((p) => p.item), ["Bone Chips", "Rat Ear"]);
  // The unit price is the interesting one: what's worth carrying home per slot.
  assert.deepEqual(sortPrices(prices, { key: "unitCopper", desc: true }).map((p) => p.item), ["Rat Ear", "Bone Chips"]);
  assert.deepEqual(sortPrices(prices, { key: "lastAt", desc: true }).map((p) => p.item), ["Rat Ear", "Bone Chips"]);
  assert.deepEqual(sortPrices(prices, { key: "item", desc: false }).map((p) => p.item), ["Bone Chips", "Rat Ear"]);
});
