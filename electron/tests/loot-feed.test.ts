/**
 * Tests for merging the stored loot ledger with the drops that arrive live. The whole reason this
 * is a black box is the race between the two: the ledger is fetched, the live drops are pushed, and
 * a replayed log gap makes "a drop landed while the fetch was in flight" the ordinary case. Losing
 * the ledger to that race is the bug these pin shut.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeLootFeed, lootKey } from "../../src/shared/loot-feed";
import type { LootEvent } from "../../src/shared/types";

function drop(item: string, sec: number, logId = sec): LootEvent {
  return {
    kind: "loot",
    item,
    qty: 1,
    source: "a kobold",
    fate: "kept",
    logId,
    raw: `--You have looted a ${item} from a kobold's corpse.--`,
    at: `2026-08-04T20:00:${String(sec).padStart(2, "0")}`,
  };
}

test("with nothing held yet, the feed is the stored history", () => {
  const hist = [drop("Bone Chips", 30), drop("Gnoll Fang", 20)];
  assert.deepEqual(mergeLootFeed([], hist, 40), hist);
});

test("a live drop that beat the fetch back keeps the history behind it", () => {
  const live = drop("Rusty Dagger", 40);
  const hist = [drop("Bone Chips", 30), drop("Gnoll Fang", 20)];

  const feed = mergeLootFeed([live], hist, 40);
  assert.deepEqual(
    feed.map((e) => e.item),
    ["Rusty Dagger", "Bone Chips", "Gnoll Fang"],
    "the ledger must survive the race — losing it left the panel showing one row",
  );
});

// A drop is added to the ledger *before* it is broadcast, so a line legitimately appears in both.
test("a drop in both the ledger and the live feed appears once", () => {
  const shared = drop("Bone Chips", 30);
  const feed = mergeLootFeed([shared], [shared, drop("Gnoll Fang", 20)], 40);
  assert.deepEqual(
    feed.map((e) => e.item),
    ["Bone Chips", "Gnoll Fang"],
  );
});

test("two genuinely separate drops of the same item both survive", () => {
  // Same item and second, different lines — which is what `logId` is in the key for.
  const first = drop("Bat Wing", 32, 101);
  const second = drop("Bat Wing", 32, 102);
  const feed = mergeLootFeed([second], [second, first], 40);
  assert.equal(feed.length, 2, "one corpse dropping two of a thing is not a duplicate");
});

test("the cap is honoured, and it keeps the newest", () => {
  const held = [drop("Newest", 50)];
  const hist = [drop("A", 40), drop("B", 30), drop("C", 20)];
  assert.deepEqual(
    mergeLootFeed(held, hist, 3).map((e) => e.item),
    ["Newest", "A", "B"],
  );
  assert.deepEqual(
    mergeLootFeed([], hist, 2).map((e) => e.item),
    ["A", "B"],
    "an untouched history is capped too",
  );
});

test("a line's key is its own, and distinguishes time, line and item", () => {
  const base = drop("Bone Chips", 30, 7);
  assert.equal(lootKey(base), lootKey(drop("Bone Chips", 30, 7)));
  assert.notEqual(lootKey(base), lootKey(drop("Bone Chips", 31, 7)), "a different second");
  assert.notEqual(lootKey(base), lootKey(drop("Bone Chips", 30, 8)), "a different line");
  assert.notEqual(lootKey(base), lootKey(drop("Gnoll Fang", 30, 7)), "a different item");
});
