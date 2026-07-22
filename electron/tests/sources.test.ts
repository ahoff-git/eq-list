/**
 * Black-box tests for source shaping: grouping drops by zone, loose zone-name
 * matching (log names vs wiki titles), and splitting drops into the current
 * zone vs elsewhere for the overlay.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupDropsByZone, zoneMatches, splitDropsByCurrentZone } from "../../src/shared/sources";
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
