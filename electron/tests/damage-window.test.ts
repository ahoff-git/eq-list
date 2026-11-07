/**
 * Black-box tests for which stored fights a damage reading is taken over. Only the fields the window
 * reads exist on these fights: where, and in which sitting.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DAMAGE_WINDOWS, DEFAULT_DAMAGE_WINDOW, windowFights } from "../../src/shared/combat/damage-window";
import type { StoredFight } from "../../src/shared/types";

let ids = 0;
const fight = (zone: string | undefined, sessionId: string) => ({ id: `f${++ids}`, zone, sessionId, stats: {} }) as unknown as StoredFight;
const ids_ = (fights: StoredFight[]) => fights.map((f) => f.id);

// Newest first, as the history search returns them: two in Blackburrow (the second a harder copy of
// it), a stop in Qeynos Hills, and an earlier visit to Blackburrow in an older sitting.
const a = fight("Blackburrow", "now");
const b = fight("Blackburrow 3", "now");
const c = fight("Qeynos Hills", "now");
const d = fight("Blackburrow", "before");
const FIGHTS = [a, b, c, d];

test("the zone window is the fights since you last arrived here, not every visit", () => {
  assert.deepEqual(ids_(windowFights(FIGHTS, "zone", "Blackburrow")), ids_([a, b]));
});

test("a harder copy of a zone is the same place", () => {
  assert.deepEqual(ids_(windowFights(FIGHTS, "zone", "Blackburrow 3")), ids_([a, b]));
});

test("zoning somewhere new empties the window, so old advice can't follow you", () => {
  assert.deepEqual(windowFights(FIGHTS, "zone", "Crushbone"), []);
});

test("without a current zone, the zone window is the zone you last fought in", () => {
  assert.deepEqual(ids_(windowFights(FIGHTS, "zone", null)), ids_([a, b]));
  assert.deepEqual(windowFights([], "zone", null), []);
});

test("a fight nothing placed ends the run rather than being skipped", () => {
  assert.deepEqual(ids_(windowFights([a, fight(undefined, "now"), b], "zone", "Blackburrow")), ids_([a]));
});

test("the sitting window is the newest fight's sitting", () => {
  assert.deepEqual(ids_(windowFights(FIGHTS, "sitting", "Blackburrow")), ids_([a, b, c]));
  assert.deepEqual(windowFights([], "sitting", null), []);
});

test("the recent window is everything it was handed, and hands back a copy", () => {
  const all = windowFights(FIGHTS, "recent", null);
  assert.deepEqual(ids_(all), ids_(FIGHTS));
  assert.notEqual(all, FIGHTS);
});

test("the zone window is the default, and every window is offered once", () => {
  assert.equal(DEFAULT_DAMAGE_WINDOW, "zone");
  assert.deepEqual(DAMAGE_WINDOWS.map((w) => w.key), ["zone", "sitting", "recent"]);
});
