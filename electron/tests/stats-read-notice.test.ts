/**
 * Black-box tests for what a stats grab says about itself (`src/shared/items/stats-read-notice.ts`).
 * Only need re-running if that module or `item-stats.ts` (the stat labels) changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readNotice, wrongCharacter } from "../../src/shared/items/stats-read-notice";
import type { StatsRead } from "../../src/shared/items/stats-page";

const everything = { hp: 1976, mana: 2840, end: 859, ac: 242, str: 74, sta: 137, int: 214, wis: 139, agi: 147, dex: 111, cha: 71, svMagic: 37, svFire: 19, svCold: 34, svDisease: 32, svPoison: 41, svVoid: 82 };
const read = (over: Partial<StatsRead> = {}): StatsRead => ({ values: everything, repaired: [], doubtful: [], missing: [], ...over });
/** The window's corner, read: who it was. */
const WIZ = { name: "Kainos", level: 31, classes: ["Wizard", "Druid", "Magician"], unsure: [] };

test("a clean read is good news with nothing to add", () => {
  const n = readNotice(read({ who: WIZ }));
  assert.deepEqual([n.tone, n.title], ["good", "Read 17 stats from your Inventory window"]);
  assert.equal(n.detail, "You're level 31 Wizard / Druid / Magician. Max HP is set for the Deaths page.");
});

test("a box that left out the corner of the window says how to include it — a hint, not a problem", () => {
  const n = readNotice(read());
  assert.equal(n.tone, "good");
  assert.match(n.detail!, /top-right of the window.*name, level and classes/);
});

test("a figure that was only a guess is named, with the guess, and not counted as read", () => {
  const n = readNotice(read({ repaired: ["ac"], doubtful: ["ac"] }));
  assert.equal(n.tone, "warn");
  assert.equal(n.title, "Read 16 stats from your Inventory window");
  assert.match(n.detail!, /Not sure of AC \(242\?\)/);
  assert.match(n.detail!, /confirm in the loadout builder/);
});

test("several guesses read in the plural", () => {
  const n = readNotice(read({ doubtful: ["ac", "str"] }));
  assert.match(n.detail!, /Not sure of AC \(242\?\), STR \(74\?\)/);
  assert.match(n.detail!, /check them against the game/);
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

// ── a grab that found nothing is several different problems ──

const empty = (over: Partial<StatsRead> = {}): StatsRead => read({ values: {}, missing: ["hp"], ...over });

test("a blank capture points at the game's fullscreen mode, which is how a capture comes out black", () => {
  const n = readNotice(empty({ seen: { words: 0, sample: "", width: 530, height: 513 } }));
  assert.equal(n.tone, "warn");
  assert.match(n.title, /blank/);
  assert.match(n.detail!, /exclusive fullscreen/);
});

test("a box too small to hold the page says to drag over the whole window", () => {
  const n = readNotice(empty({ seen: { words: 4, sample: "HP Mana", width: 120, height: 80 } }));
  assert.match(n.title, /too small/);
  assert.match(n.detail!, /whole Inventory window/);
});

test("the Inventory window with no stats in view says which tab and what to scroll", () => {
  const n = readNotice(empty({ who: WIZ, seen: { words: 140, sample: "Inventory Equipment Pet", width: 530, height: 513 } }));
  assert.match(n.title, /Found the Inventory window, but not its stats/);
  assert.match(n.detail!, /Equipment tab/);
});

test("some other window says what it read instead, so the player can see the mistake", () => {
  const n = readNotice(empty({ seen: { words: 30, sample: "Spell Book Memorized Gems", width: 400, height: 300 } }));
  assert.match(n.title, /No stats found/);
  assert.match(n.detail!, /What I read instead: “Spell Book Memorized Gems”/);
});

test("the recogniser failing is not a crop with nothing in it", () => {
  const n = readNotice(empty({ problem: "engine" }));
  assert.equal(n.tone, "bad");
  assert.match(n.detail!, /downloads its model.*internet/);
});

// ── who it was ──

test("a corner that couldn't be settled is a problem to fix by hand, with what was seen", () => {
  const n = readNotice(read({ who: { name: "Kainos", classes: [], unsure: ["classes", "level"], saw: "WlZ/DRU/MAG" } }));
  assert.equal(n.tone, "warn");
  assert.match(n.detail!, /Couldn't settle your classes \(I saw “WlZ\/DRU\/MAG”\) — tick them in Class/);
  assert.match(n.detail!, /Couldn't settle your level/);
});

test("a window that is another character's is not applied, and says whose it is", () => {
  const other = read({ who: { ...WIZ, name: "Zanthar" } });
  assert.equal(wrongCharacter(other, "Kainos"), "Zanthar");
  const n = readNotice(other, { followed: "Kainos" });
  assert.equal(n.tone, "bad");
  assert.match(n.title, /That's Zanthar's window, not Kainos's/);
  assert.match(n.detail!, /Nothing was applied/);
});

test("your own window, a misread of your own name, an unread name, or no one to compare with are all fine", () => {
  assert.equal(wrongCharacter(read({ who: WIZ }), "Kainos"), undefined);
  assert.equal(wrongCharacter(read({ who: { ...WIZ, name: "Kalnos" } }), "Kainos"), undefined, "an l for an i is the recogniser, not an alt");
  assert.equal(wrongCharacter(read({ who: { ...WIZ, name: undefined } }), "Kainos"), undefined);
  assert.equal(wrongCharacter(read({ who: WIZ }), undefined), undefined);
  assert.equal(wrongCharacter(null, "Kainos"), undefined);
});

// ── what the Deaths page was given ──

test("a read that answers the Deaths page's questions says so", () => {
  assert.match(readNotice(read({ who: WIZ, values: { ...everything, hpRegen: 18 } })).detail!, /Max HP and regen are set for the Deaths page/);
  assert.match(readNotice(read({ who: WIZ })).detail!, /Max HP is set for the Deaths page/);
  assert.doesNotMatch(readNotice(read({ who: WIZ, values: { ...everything }, doubtful: ["hp"] })).detail!, /Deaths page/, "a guessed HP is not filed");
});

test("a capture too rough to trust says so and what to do, rather than listing a dozen doubts", () => {
  const n = readNotice(read({ noisy: true, doubtful: Object.keys(everything) as (keyof typeof everything)[] }));
  assert.equal(n.tone, "warn");
  assert.match(n.title, /too rough to trust/);
  assert.match(n.detail!, /raise the game's UI scale/);
});
