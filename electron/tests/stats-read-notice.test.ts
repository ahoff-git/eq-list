/**
 * Black-box tests for what a stats grab says about itself (`src/shared/items/stats-read-notice.ts`).
 * Only need re-running if that module or `item-stats.ts` (the stat labels) changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readNotice } from "../../src/shared/items/stats-read-notice";
import type { StatsRead } from "../../src/shared/items/stats-page";

const everything = { hp: 1976, mana: 2840, end: 859, ac: 242, str: 74, sta: 137, int: 214, wis: 139, agi: 147, dex: 111, cha: 71, svMagic: 37, svFire: 19, svCold: 34, svDisease: 32, svPoison: 41, svVoid: 82 };
const read = (over: Partial<StatsRead> = {}): StatsRead => ({ values: everything, repaired: [], doubtful: [], missing: [], ...over });

test("a clean read is good news with nothing to add", () => {
  const n = readNotice(read());
  assert.deepEqual([n.tone, n.title, n.detail], ["good", "Read 17 stats from your Inventory window", undefined]);
});

test("a figure that was only a guess is named, with the guess, and not counted as read", () => {
  const n = readNotice(read({ repaired: ["ac"], doubtful: ["ac"] }));
  assert.equal(n.tone, "warn");
  assert.equal(n.title, "Read 16 stats from your Inventory window");
  assert.match(n.detail!, /Not sure of AC \(242\?\)/);
  assert.match(n.detail!, /type it in its box/);
});

test("several guesses read in the plural", () => {
  const n = readNotice(read({ doubtful: ["ac", "str"] }));
  assert.match(n.detail!, /Not sure of AC \(242\?\), STR \(74\?\)/);
  assert.match(n.detail!, /type them in their box/);
});

test("rows that weren't in the box are named, and the long list is cut short", () => {
  const some = readNotice(read({ missing: ["svFire", "svVoid"] }));
  assert.match(some.detail!, /Didn't see SV Fire, SV Void — scroll them into the box/);
  const many = readNotice(read({ missing: ["svMagic", "svFire", "svCold", "svDisease", "svPoison", "svVoid"] }));
  assert.match(many.detail!, /SV Magic, SV Fire, SV Cold, SV Disease and 2 more/);
});

test("a read that was sure of nothing says so rather than claiming a count", () => {
  const n = readNotice(read({ values: { ac: 242 }, doubtful: ["ac"], missing: ["hp"] }));
  assert.equal(n.title, "Read stats, but wasn't sure of any");
  assert.equal(n.tone, "warn");
});

test("no stats in the box says what to drag over", () => {
  const n = readNotice(read({ values: {}, missing: ["hp"] }));
  assert.equal(n.tone, "warn");
  assert.match(n.title, /No stats found/);
  assert.match(n.detail!, /Character Vitals/);
});

test("no screen to read from is a failure, not an empty read", () => {
  const n = readNotice(null);
  assert.equal(n.tone, "bad");
  assert.match(n.title, /Couldn't read/);
});
