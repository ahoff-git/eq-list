/**
 * Black-box tests for a zone page's known spawns (`src/shared/zones/zone-spawns.ts`): the wiki
 * roster joined with kills, and the order a reader sees them in. Only need re-running if it changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rosterNamed, zoneSpawns } from "../../src/shared/zones/zone-spawns";
import type { MobKnowledge } from "../../src/shared/mob/mob-stats";

const known = (mob: string, kills: number, myKills = 0, area?: MobKnowledge["area"]): MobKnowledge => ({
  mob,
  zone: "Lower Guk",
  kills,
  myKills,
  drops: [],
  area,
  lastAt: "",
  contributors: [],
  copper: 0,
  copperPerKill: 0,
});

test("roster and kills meet across articles and the wiki's disambiguating suffix", () => {
  const got = zoneSpawns(
    [{ name: "A basilisk (Lower Guk)", level: "28-32" }],
    [known("basilisk", 7, 2, { y: 10, x: 20, spread: 30, samples: 4 })],
  );
  assert.equal(got.length, 1);
  assert.equal(got[0].name, "A basilisk (Lower Guk)", "the roster's spelling, which is the page title");
  assert.deepEqual([got[0].kills, got[0].myKills, got[0].onRoster, got[0].area?.x], [7, 2, true, 20]);
});

test("a kill the roster doesn't list is kept, and marked", () => {
  const got = zoneSpawns([], [known("froglok pet", 1)]);
  assert.deepEqual(got.map((s) => [s.name, s.onRoster, s.level]), [["froglok pet", false, undefined]]);
});

test("named first, then most killed, then highest level, then by name", () => {
  const got = zoneSpawns(
    [
      { name: "A froglok slave", level: "2-4" },
      { name: "A ghoul sage", level: "37" },
      { name: "The Ghoul Lord", level: "47" },
      { name: "A clay gargoyle", level: "27-31" },
    ],
    [known("clay gargoyle", 5)],
  );
  assert.deepEqual(
    got.map((s) => s.name),
    ["The Ghoul Lord", "A clay gargoyle", "A ghoul sage", "A froglok slave"],
  );
  assert.equal(got[0].named, true);
});

test("a roster name is named without an indefinite article; \"The\" doesn't count as one", () => {
  assert.deepEqual(["Raster of Guk", "The Ghoul Lord", "A froglok slave", "an urd ghoul wizard"].map(rosterNamed), [true, true, false, false]);
});

