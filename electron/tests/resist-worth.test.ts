/**
 * Black-box tests for what a resist point is worth, from the wiki's rule (6 points → 1% greater chance
 * to fully resist, capped at 95%) and for which resist types earn a suggestion.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { damageProfile, type DamageKindOfHit, type DamageProfile } from "../../src/shared/combat/damage-profile";
import {
  FLAG_SHARE,
  MIN_HITS,
  RESIST_CAP,
  RESIST_STAT,
  TRIAL_POINTS,
  isEnough,
  rawDamage,
  resistChance,
  resistRows,
  suggestions,
} from "../../src/shared/combat/resist-worth";

/** A profile from `[type, damage, hits]` buckets — shares and totals follow. */
function profile(...buckets: [DamageKindOfHit, number, number][]): DamageProfile {
  const damage = buckets.reduce((n, b) => n + b[1], 0);
  return {
    fights: 1,
    measured: 1,
    damage,
    hits: buckets.reduce((n, b) => n + b[2], 0),
    types: buckets.map(([type, d, hits]) => ({ type, damage: d, hits, share: d / damage })).sort((a, b) => b.damage - a.damage),
  };
}

test("six points are a one percent chance to fully resist, up to the cap", () => {
  assert.equal(resistChance(0), 0);
  assert.equal(resistChance(6), 0.01);
  assert.equal(resistChance(60), 0.1);
  assert.equal(resistChance(570), RESIST_CAP);
  assert.equal(resistChance(10_000), RESIST_CAP);
  assert.equal(resistChance(-5), 0, "negative points don't make you vulnerable here");
});

test("logged damage is landed damage: the raw figure puts back what the worn resist took", () => {
  assert.equal(rawDamage(90, 60), 100, "10% resisted, so 90 landed means 100 thrown");
  assert.equal(rawDamage(50), 50, "no known resist, nothing to put back");
});

test("thirty more points shed five percent of that type's damage, as a share of all you take", () => {
  // Magic is 10% of what you take; +30 points cuts 5% of it — half a percent of the whole.
  const magic = resistRows(profile(["melee", 900, 60], ["magic", 100, 40]))[0]!;
  assert.equal(magic.type, "magic");
  assert.ok(Math.abs(magic.saved - 0.005) < 1e-9, `${magic.saved}`);
  assert.equal(TRIAL_POINTS, 30);
});

test("a point is worth the same on every type — only how much hits you decides", () => {
  const rows = resistRows(profile(["fire", 200, 20], ["cold", 100, 20], ["melee", 700, 60]));
  const [fire, cold] = [rows.find((r) => r.type === "fire")!, rows.find((r) => r.type === "cold")!];
  assert.ok(Math.abs(fire.saved - 2 * cold.saved) < 1e-9);
});

test("with the gear known, the row says what it gives and puts back what it already took", () => {
  const p = profile(["fire", 90, 50], ["melee", 910, 50]);
  const [row] = resistRows(p, { svFire: 60 });
  assert.equal(row!.points, 60);
  assert.equal(row!.resisted, 0.1);
  // Raw fire was 100; +30 points cuts 5% of that — 5 of the 1000 logged.
  assert.ok(Math.abs(row!.saved - 0.005) < 1e-9, `${row!.saved}`);
});

test("gear that gives none of a type reads as zero points, not as unknown", () => {
  const [row] = resistRows(profile(["fire", 100, 50]), { svCold: 40 });
  assert.equal(row!.points, 0);
  assert.equal(resistRows(profile(["fire", 100, 50]))[0]!.points, undefined);
});

test("at the cap more points buy nothing", () => {
  const [row] = resistRows(profile(["fire", 100, 50]), { svFire: 570 });
  assert.equal(row!.saved, 0);
});

test("a type is flagged at a tenth of the damage taken, with a resist the app tracks, once there's enough evidence", () => {
  const enough = (fire: number) => profile(["fire", fire, MIN_HITS], ["melee", 100 - fire, 10]);
  assert.deepEqual(suggestions(enough(FLAG_SHARE * 100)).map((r) => r.type), ["fire"]);
  assert.deepEqual(suggestions(enough(9)), [], "under a tenth is noise on a melee-taken character");
  assert.deepEqual(suggestions(profile(["fire", 50, 5], ["melee", 50, 5])), [], "ten hits is one bad pull");
});

test("Void is shown but never suggested — nothing here can raise it yet", () => {
  assert.equal(RESIST_STAT.void, null);
  const p = profile(["void", 80, MIN_HITS], ["melee", 20, 10]);
  assert.equal(resistRows(p)[0]!.flagged, false);
  assert.deepEqual(suggestions(p), []);
});

test("melee and untyped damage are not resist rows", () => {
  assert.deepEqual(resistRows(profile(["melee", 80, 50], ["other", 20, 5])), []);
});

test("enough means MIN_HITS landed hits", () => {
  assert.ok(isEnough(profile(["melee", 1, MIN_HITS])));
  assert.ok(!isEnough(profile(["melee", 1, MIN_HITS - 1])));
  assert.ok(!isEnough(damageProfile([])));
});
