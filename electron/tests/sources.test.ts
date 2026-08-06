/**
 * Black-box tests for source shaping: grouping drops by zone, loose zone-name
 * matching (log names vs wiki titles), and splitting drops into the current
 * zone vs elsewhere for the overlay.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groupDropsByZone,
  sameZone,
  zoneMatches,
  splitDropsByCurrentZone,
  otherSources,
  sourceZones,
  isObtainableIn,
} from "../../src/shared/sources";
import type { ItemSource } from "../../src/shared/types";

const drops: ItemSource[] = [
  { kind: "drop", where: "a decaying skeleton", detail: "Befallen" },
  { kind: "drop", where: "a skeleton monk", detail: "Befallen" },
  { kind: "drop", where: "a gnoll", detail: "Blackburrow" },
  { kind: "vendor", where: "Merchant Bob", detail: "Qeynos" }, // ignored by drop grouping
];

test("groupDropsByZone groups mobs under their zone, ignoring non-drops", () => {
  const grouped = groupDropsByZone(drops);
  assert.equal(grouped.length, 2);
  assert.deepEqual(grouped[0], { zone: "Befallen", mobs: ["a decaying skeleton", "a skeleton monk"] });
  assert.deepEqual(grouped[1], { zone: "Blackburrow", mobs: ["a gnoll"] });
});

test("missing zone falls back to Unknown zone", () => {
  const grouped = groupDropsByZone([{ kind: "drop", where: "a bat" }]);
  assert.equal(grouped[0].zone, "Unknown zone");
});

test("zoneMatches is loose about name variants", () => {
  assert.ok(zoneMatches("Everfrost Peaks", "Everfrost"));
  assert.ok(zoneMatches("Highpass", "Highpass Hold"));
  assert.ok(zoneMatches("The Feerrott", "Feerrott"));
  assert.ok(!zoneMatches("Befallen", "Blackburrow"));
  // A harder zone is the same zone: the wiki lists a gnoll's drops once, for every difficulty.
  assert.ok(zoneMatches("Blackburrow 3", "Blackburrow"));
  assert.ok(!zoneMatches("Befallen 2", "Blackburrow"));
});

// The keying fold, and the whole reason it isn't `zoneMatches`: anything stored per zone is
// answered by exact identity, or a query for one zone would return its neighbour's (ADR 0059).
test("sameZone folds the decoration but never widens to a neighbour", () => {
  assert.ok(sameZone("The Steamfont Mountains 2 (Adaptive)", "Steamfont Mountains"));
  assert.ok(sameZone("Blackburrow 3", "Blackburrow"));
  assert.ok(sameZone("The Feerrott", "feerrott"));
  // What `zoneMatches` would wrongly say yes to, and this must not.
  assert.ok(zoneMatches("East Commonlands", "Commonlands"));
  assert.ok(!sameZone("East Commonlands", "Commonlands"));
  assert.ok(!sameZone("Befallen", "Blackburrow"));
  // A zone we never learned the name of has nothing to compare.
  assert.ok(!sameZone(undefined, "Blackburrow"));
});

test("drops in a zone group under it whichever difficulty you're standing in", () => {
  const grouped = groupDropsByZone([
    { kind: "drop", where: "a gnoll", detail: "Blackburrow" },
    { kind: "drop", where: "a gnoll pup", detail: "Blackburrow 3" },
  ]);
  assert.deepEqual(grouped, [{ zone: "Blackburrow", mobs: ["a gnoll", "a gnoll pup"] }]);
});

test("splitDropsByCurrentZone separates here from elsewhere", () => {
  const grouped = groupDropsByZone(drops);
  const { here, elsewhere } = splitDropsByCurrentZone(grouped, "Befallen");
  assert.deepEqual(here.map((d) => d.zone), ["Befallen"]);
  assert.deepEqual(elsewhere.map((d) => d.zone), ["Blackburrow"]);
});

test("splitDropsByCurrentZone puts everything in elsewhere when zone unknown", () => {
  const grouped = groupDropsByZone(drops);
  const { here, elsewhere } = splitDropsByCurrentZone(grouped, null);
  assert.equal(here.length, 0);
  assert.equal(elsewhere.length, 2);
});

test("otherSources keeps non-drops, deduped by kind+where", () => {
  const others = otherSources([
    ...drops,
    { kind: "vendor", where: "Merchant Bob", detail: "Qeynos" }, // dup of the one in `drops`
    { kind: "quest", where: "Aviak Talons" },
  ]);
  assert.deepEqual(
    others.map((s) => `${s.kind}:${s.where}`),
    ["vendor:Merchant Bob", "quest:Aviak Talons"],
  );
});

test("sourceZones lists distinct zones across all kinds (case-insensitive)", () => {
  const zones = sourceZones([
    { kind: "drop", where: "a gnoll", detail: "Blackburrow" },
    { kind: "vendor", where: "Bob", detail: "blackburrow" }, // same zone, different case
    { kind: "drop", where: "a skeleton", detail: "Befallen" },
    { kind: "quest", where: "Some Quest" }, // no zone
  ]);
  assert.deepEqual(zones, ["Blackburrow", "Befallen"]);
});

test("isObtainableIn matches loosely and ignores zoneless sources", () => {
  const s: ItemSource[] = [
    { kind: "drop", where: "a gnoll", detail: "Blackburrow" },
    { kind: "recipe", where: "Player crafted" }, // no zone
  ];
  assert.ok(isObtainableIn(s, "Blackburrow"));
  assert.ok(!isObtainableIn(s, "Befallen"));
  assert.ok(!isObtainableIn([{ kind: "recipe", where: "Player crafted" }], "Anywhere"));
});
