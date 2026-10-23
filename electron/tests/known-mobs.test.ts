/**
 * Black-box tests for the killed-mob vocabulary (ADR 0334): one entry per mob across zones, searched
 * at the same bar as items, and only offered where the wiki's results don't already name it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { knownMobs, mobsUnknownToTheWiki, searchKnownMobs } from "../../src/shared/mob/known-mobs";
import type { MobKnowledge } from "../../src/shared/mob/mob-stats";

const tally = (mob: string, zone: string, kills: number, lastAt: string): MobKnowledge => ({
  mob,
  zone,
  kills,
  myKills: kills,
  drops: [],
  lastAt,
  contributors: [],
  copper: 0,
  copperPerKill: 0,
});

const KNOWN = [
  tally("ghoul sage", "The Ruins of Old Guk", 3, "2026-08-09T13:50:43"),
  tally("zol ghoul knight", "The Ruins of Old Guk", 31, "2026-08-09T10:00:00"),
  tally("ghoul sage", "Lower Guk", 5, "2026-09-25T23:26:13"),
];

test("a mob killed in two zones is one entry, its kills summed, busiest zone first", () => {
  const sage = knownMobs(KNOWN).find((m) => m.mob === "ghoul sage")!;
  assert.equal(sage.kills, 8);
  assert.deepEqual(sage.zones, ["Lower Guk", "The Ruins of Old Guk"]);
  assert.equal(sage.lastAt, "2026-09-25T23:26:13");
});

test("most-killed first", () => {
  assert.deepEqual(knownMobs(KNOWN).map((m) => m.mob), ["zol ghoul knight", "ghoul sage"]);
});

test("a rough query finds the mob; a stray one finds nothing", () => {
  assert.equal(searchKnownMobs("ghoul sag", knownMobs(KNOWN))[0]?.mob, "ghoul sage");
  assert.deepEqual(searchKnownMobs("froglok", knownMobs(KNOWN)), []);
});

test("a mob the wiki's results already name — article and case aside — isn't offered twice", () => {
  const offered = mobsUnknownToTheWiki(knownMobs(KNOWN), [{ title: "A ghoul sage", wikiPath: "/A_ghoul_sage" }]);
  assert.deepEqual(offered.map((m) => m.mob), ["zol ghoul knight"]);
});
