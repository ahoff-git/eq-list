/**
 * Black-box tests for the one thing `celebrations.ts` remembers: the single most recent
 * tracked-item drop worth telling the room about (ADR 0287).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCelebrationFeed } from "../celebrations";

test("nothing announced is nothing current", () => {
  const feed = createCelebrationFeed(() => 0);
  assert.equal(feed.current(), undefined);
});

test("an announced drop is the current celebration", () => {
  const feed = createCelebrationFeed(() => 1_000);
  feed.announce("Flowing Black Robe", 1, new Date(1_000).toISOString());
  const row = feed.current();
  assert.equal(row?.item, "Flowing Black Robe");
  assert.equal(row?.qty, 1);
  assert.ok(row?.id, "a row needs an id a receiver can tell apart from the next one");
});

test("a second announcement replaces the first rather than queuing behind it", () => {
  const feed = createCelebrationFeed(() => 1_000);
  feed.announce("Flowing Black Robe", 1, new Date(1_000).toISOString());
  const first = feed.current();
  feed.announce("Fungi Tunic", 1, new Date(1_000).toISOString());
  const second = feed.current();
  assert.equal(second?.item, "Fungi Tunic");
  assert.notEqual(second?.id, first?.id);
});

test("a celebration ages out, the same way a running fight would read as stale", () => {
  let now = 0;
  const feed = createCelebrationFeed(() => now);
  feed.announce("Flowing Black Robe", 1, new Date(now).toISOString());
  assert.ok(feed.current(), "still fresh");
  now += 3 * 60_000 + 1;
  assert.equal(feed.current(), undefined, "aged past the window — a peer this late gets nothing");
});

test("last night's drop never becomes today's celebration — everything replayed at launch is old news", () => {
  // The exact rule `AlertRouter.loot` already applies to your own banner (ADR 0105's `stale`),
  // reused here so a catch-up replay doesn't broadcast a celebration for a drop hours old.
  const feed = createCelebrationFeed(() => Date.now());
  const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  feed.announce("Flowing Black Robe", 1, sixHoursAgo);
  assert.equal(feed.current(), undefined);
});
