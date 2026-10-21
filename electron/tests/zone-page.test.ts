/**
 * Black-box tests for `zonePageTitle` (`src/shared/zones/zone-page.ts`): a zone name, however its
 * source spelled it, opens the page the wiki actually has. Only need re-running if that file, or the
 * zone tables it reads, change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { zonePageTitle } from "../../src/shared/zones/zone-page";

test("a log's or gazetteer's spelling of a zone opens the wiki's page for it", () => {
  assert.equal(zonePageTitle("Nagafen's Lair - Group"), "Nagafen's Lair", "a ruleset tag folds away");
  assert.equal(zonePageTitle("Blackburrow 3"), "Blackburrow", "so does a difficulty");
  assert.equal(zonePageTitle("Castle Mistmoore"), "Mistmoore Castle", "the wiki's own word order");
  assert.equal(zonePageTitle("Cazic Thule"), "Cazic Thule (Zone)", "and its disambiguator");
});

test("a zone the wiki's tables don't know is opened by the name as we'd group it", () => {
  assert.equal(zonePageTitle("Somewhere Nobody Mapped 2"), "Somewhere Nobody Mapped");
});
