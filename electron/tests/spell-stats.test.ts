/**
 * Black-box tests for reading a spell's wiki card as numbers.
 *
 * Mana/cast/recast/range are label:value lookups and the tests pin the lookup itself (case, the
 * colon split, a missing label). Damage is the one approximate figure here (ADR 0195) and the tests
 * pin its two-tier extraction: the wiki's own scaling slot line wins when present, hand-written
 * prose is the fallback, and a card that matches neither answers "unknown" rather than a wrong guess.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_SPELL_STATS, parseSpellStats } from "../../src/shared/spell-stats";

/** The lines `parseSpellCard` builds for a scaling nuke — shaped like the `spell-burst-of-fire` fixture. */
const NUKE_LINES = [
  "Creates a ball of fire that burns your target, doing 14 damage.",
  "Classes: Druid - Level 3, Ranger - Level 14",
  "Decrease Hitpoints by 11 (L3) to 14 (L8)",
  "Mana: 7",
  "Skill: Evocation",
  "Casting Time: 1.50",
  "Recast Time: 1.50",
  "Fizzle Time: 2.50",
  "Resist: Fire (0)",
  "Range: 200",
  "Target Type: Single",
  "Spell Type: Detrimental",
  "Duration: Instant",
];

test("reads mana, cast, recast and range off their labelled lines", () => {
  const stats = parseSpellStats(NUKE_LINES);
  assert.equal(stats.mana, 7);
  assert.equal(stats.castSec, 1.5);
  assert.equal(stats.recastSec, 1.5);
  assert.equal(stats.range, 200);
});

test("reads per-class minimum levels off the Classes line", () => {
  const stats = parseSpellStats(NUKE_LINES);
  assert.deepEqual(stats.levels, { Druid: 3, Ranger: 14 });
});

test("reads beneficial and instant off Spell Type / Duration", () => {
  const stats = parseSpellStats(NUKE_LINES);
  assert.equal(stats.beneficial, false);
  assert.equal(stats.instant, true);
});

test("damage prefers the wiki's own scaling slot line, taking the higher rank", () => {
  // 129 ranked families don't scale gently (ADR 0080's Burnout example) — quoting the lower figure
  // would misprice the spell the same way, so the higher one is what a "which hits harder" ranking wants.
  assert.equal(parseSpellStats(NUKE_LINES).damage, 14);
});

test("damage falls back to prose when there's no slot line", () => {
  const lines = [
    "Creates a ball of fire that burns your target, doing 14 damage.",
    "Mana: 7",
    "Spell Type: Detrimental",
  ];
  assert.equal(parseSpellStats(lines).damage, 14);
});

test("a card with neither shape leaves damage unknown rather than guessing", () => {
  const stats = parseSpellStats(["Classes: Cleric - Level 1", "Mana: 10", "Spell Type: Beneficial"]);
  assert.equal(stats.damage, undefined);
});

test("no card at all is NO_SPELL_STATS, not a throw", () => {
  assert.deepEqual(parseSpellStats(undefined), NO_SPELL_STATS);
  assert.deepEqual(parseSpellStats([]), NO_SPELL_STATS);
});

test("a spell naming no class at all has an empty levels map, not a throw", () => {
  const stats = parseSpellStats(["Mana: 0", "Spell Type: Beneficial", "Duration: Instant"]);
  assert.deepEqual(stats.levels, {});
  assert.equal(stats.mana, 0);
});
