/**
 * Tests for merging the stored faction ledger with the hits that arrive live. Same race as the loot
 * feed's (`loot-feed.test.ts`): the ledger is fetched, live hits are pushed, and a replayed log gap
 * makes "a hit landed while the fetch was in flight" the ordinary case.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeFactionFeed, factionKey } from "../../src/shared/faction-feed";
import type { FactionEvent } from "../../src/shared/types";

function hit(faction: string, sec: number, logId = sec): FactionEvent {
  return {
    kind: "faction",
    faction,
    delta: -3,
    direction: "lowered",
    logId,
    raw: `Your faction standing with ${faction} has been adjusted by -3.`,
    at: `2026-08-04T20:00:${String(sec).padStart(2, "0")}`,
  };
}

test("with nothing held yet, the feed is the stored history", () => {
  const hist = [hit("Agents of Mistmoore", 30), hit("Priests of Marr", 20)];
  assert.deepEqual(mergeFactionFeed([], hist, 40), hist);
});

test("a live hit that beat the fetch back keeps the history behind it", () => {
  const live = hit("Circle of Unseen Hands", 40);
  const hist = [hit("Agents of Mistmoore", 30), hit("Priests of Marr", 20)];

  const feed = mergeFactionFeed([live], hist, 40);
  assert.deepEqual(
    feed.map((e) => e.faction),
    ["Circle of Unseen Hands", "Agents of Mistmoore", "Priests of Marr"],
    "the ledger must survive the race — losing it left the panel showing one row",
  );
});

// A hit is added to the ledger *before* it is broadcast, so a line legitimately appears in both.
test("a hit in both the ledger and the live feed appears once", () => {
  const shared = hit("Agents of Mistmoore", 30);
  const feed = mergeFactionFeed([shared], [shared, hit("Priests of Marr", 20)], 40);
  assert.deepEqual(
    feed.map((e) => e.faction),
    ["Agents of Mistmoore", "Priests of Marr"],
  );
});

test("two genuinely separate hits against the same faction both survive", () => {
  const first = hit("Agents of Mistmoore", 32, 101);
  const second = hit("Agents of Mistmoore", 32, 102);
  const feed = mergeFactionFeed([second], [second, first], 40);
  assert.equal(feed.length, 2, "two adjustments in the same logged second are not a duplicate");
});

test("the cap is honoured, and it keeps the newest", () => {
  const held = [hit("Newest", 50)];
  const hist = [hit("A", 40), hit("B", 30), hit("C", 20)];
  assert.deepEqual(
    mergeFactionFeed(held, hist, 3).map((e) => e.faction),
    ["Newest", "A", "B"],
  );
});

test("a line's key is its own, and distinguishes time, line and faction", () => {
  const base = hit("Agents of Mistmoore", 30, 7);
  assert.equal(factionKey(base), factionKey(hit("Agents of Mistmoore", 30, 7)));
  assert.notEqual(factionKey(base), factionKey(hit("Agents of Mistmoore", 31, 7)), "a different second");
  assert.notEqual(factionKey(base), factionKey(hit("Agents of Mistmoore", 30, 8)), "a different line");
  assert.notEqual(factionKey(base), factionKey(hit("Priests of Marr", 30, 7)), "a different faction");
});
