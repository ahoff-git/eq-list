/**
 * Black-box tests for item grades: what a card's numbers become at `+N`.
 *
 * The expected values are what eqlwiki's own item-page slider (`ext.itemLevelSlider`) shows for the
 * same inputs — the point of the module is to agree with it to the last digit. The lead case is the
 * guide page's worked example, the Umbral Platemail Breastplate (AC 30, STR 13, DEX 9, STA 9, WT 7.5),
 * including the one place the slider and the guide's prose part ways (ADR 0307).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { gradedCardLines, gradedItemStats, gradedStats } from "../../src/shared/items/item-upgrade";
import { parseItemStats } from "../../src/shared/items/item-stats";

const breastplate = { ac: 30, str: 13, dex: 9, sta: 9, wt: 7.5 };

test("+0 is the card as printed", () => {
  assert.deepEqual(gradedStats(breastplate, 0), breastplate);
});

test("a big stat grows 10% a grade; a small one a flat point", () => {
  // Three attribute stats earn the slider's SV Void at the grade, as the card shows it.
  assert.deepEqual(gradedStats(breastplate, 1), { ac: 33, str: 14, dex: 10, sta: 10, wt: 6.9, svVoid: 1 });
  assert.deepEqual(gradedStats(breastplate, 2), { ac: 36, str: 16, dex: 11, sta: 11, wt: 6.2, svVoid: 2 });
});

test("partial exp toward the next grade moves big stats only, rounded half-up", () => {
  // +1 with 1 of 2 exp is effective level 1.5: 30 × 15% = 4.5 → 5. The guide's prose says 34; the
  // slider every item page runs says 35, and the slider is what this agrees with.
  const half = gradedStats(breastplate, 1, 1);
  assert.equal(half.ac, 35);
  assert.equal(half.str, 15);
  assert.equal(half.dex, 10, "a stat of 10 or less only moves on a whole grade");
});

test("+10 doubles a big stat and leaves a tenth of the weight", () => {
  assert.deepEqual(gradedStats(breastplate, 10), { ac: 60, str: 26, dex: 19, sta: 19, wt: 0.8, svVoid: 10 });
});

test("grades and exp outside the ladder clamp", () => {
  assert.deepEqual(gradedStats(breastplate, 14), gradedStats(breastplate, 10));
  assert.deepEqual(gradedStats(breastplate, -1), breastplate);
  assert.deepEqual(gradedStats(breastplate, 2, 99), gradedStats(breastplate, 2, 3));
  assert.deepEqual(gradedStats(breastplate, 10, 5), gradedStats(breastplate, 10));
});

test("a penalty shrinks toward zero and never becomes a bonus", () => {
  assert.equal(gradedStats({ sta: -10 }, 3).sta, -7);
  assert.equal(gradedStats({ sta: -10 }, 10).sta, 0);
  assert.equal(gradedStats({ sta: -20 }, 5).sta, -10);
  assert.equal(gradedStats({ sta: -20 }, 10).sta, 0);
});

test("weapon: damage grows, delay and backstab don't, ratio follows the new damage", () => {
  const sword = { dmg: 10, delay: 30, ratio: 0.33, backstab: 20, haste: 20 };
  assert.deepEqual(gradedStats(sword, 5), { dmg: 15, delay: 30, ratio: 0.5, backstab: 20, haste: 25 });
  assert.equal(gradedStats({ dmg: 10, delay: 30 }, 1, 1).dmg, 11, "partial exp counts for damage, rounded down");
});

test("a weight of 0.1 never moves, and a silent stat stays silent", () => {
  assert.deepEqual(gradedStats({ wt: 0.1 }, 10), { wt: 0.1 });
  assert.deepEqual(gradedStats({ ac: 5 }, 4), { ac: 9 });
});

// ── the card itself, rewritten (lines verbatim from the app's page cache) ───────────────────────────

test("a graded card rewrites numbers in place and leaves every other word alone", () => {
  const bow = ["MAGIC ITEM", "Slot: RANGE", "Skill: Archery Atk Delay: 43", "DMG: 21", "WT: 4.5 Range: 125 Size: LARGE", "Class: WAR PAL RNG SHD ROG", "Race: ALL"];
  assert.deepEqual(gradedCardLines(bow, 0), bow);
  assert.notEqual(gradedCardLines(bow, 0), bow, "a copy, never the caller's array");
  assert.deepEqual(gradedCardLines(bow, 1), [
    "MAGIC ITEM", "Slot: RANGE", "Skill: Archery Atk Delay: 43", "DMG: 23", "WT: 4.1 Range: 135 Size: LARGE",
    "Class: WAR PAL RNG SHD ROG", "Race: ALL",
  ]);
  assert.deepEqual(gradedCardLines(bow, 10).slice(3, 5), ["DMG: 42", "WT: 0.5 Range: 225 Size: LARGE"]);
});

test("only a DMG that opens its line is weapon damage; backstab and elemental damage stay put", () => {
  const dagger = ["Slot: PRIMARY SECONDARY", "Skill: Piercing Atk Delay: 19", "DMG: 3", "BACKSTAB: 3", "Poison DMG: 1", "SV POISON: +5", "WT: 2.4 Size: SMALL"];
  assert.deepEqual(gradedCardLines(dagger, 5), [
    "Slot: PRIMARY SECONDARY", "Skill: Piercing Atk Delay: 19", "DMG: 4", "BACKSTAB: 3", "Poison DMG: 1", "SV POISON: +10", "WT: 1.4 Size: SMALL",
  ]);
});

test("Endurance and regen grow too, and two attribute stats earn the slider's SV VOID line", () => {
  const runes = ["Lore Equipped, No Trade, Quest", "Slot: CHEST", "STR: +10 DEX: +10 STA: +10 AGI: +5 HP: +55 End: +25", "HP Regen: +10", "Size: LARGE"];
  assert.deepEqual(gradedCardLines(runes, 2), [
    "Lore Equipped, No Trade, Quest", "Slot: CHEST", "STR: +12 DEX: +12 STA: +12 AGI: +7 HP: +66 End: +30", "HP Regen: +12", "Size: LARGE",
    "SV VOID: +2",
  ]);
});

test("HP, Mana and AC don't qualify for SV VOID; a lone save doesn't either", () => {
  const brooch = ["Slot: RANGE", "AC: 3", "HP: +15 Mana: +25", "STA: +4 CHA: +1 INT: +4", "WT: 0.1 Size: SMALL"];
  assert.deepEqual(gradedCardLines(brooch, 1), ["Slot: RANGE", "AC: 4", "HP: +17 Mana: +28", "STA: +5 CHA: +2 INT: +5", "WT: 0.1 Size: SMALL", "SV VOID: +1"]);
  assert.ok(!gradedCardLines(["AC: 30", "HP: +100", "SV FIRE: +7"], 3).some((l) => l.startsWith("SV VOID")));
});

// ── one calculation, two doors (ADR 0312) ────────────────────────────────────────────────────────────

test("the numbers searched and weighed are the numbers the card shows, at every grade", () => {
  // The Items tab and best-in-slot grade a parsed reading (`gradedItemStats`); a page and a hover grade
  // the card's lines. Checked across the whole cached catalogue (65,506 grade points); these are the
  // shapes that could pull them apart — a split DMG line, backstab, an elemental DMG, a penalty,
  // Endurance and regen the reading doesn't know, and a weapon that writes `Base Dmg:`.
  const cards = [
    ["MAGIC ITEM", "Slot: RANGE", "Skill: Archery Atk Delay: 43", "DMG: 21", "WT: 4.5 Range: 125 Size: LARGE"],
    ["Slot: PRIMARY SECONDARY", "Skill: Piercing Atk Delay: 19", "DMG: 3", "BACKSTAB: 3", "Poison DMG: 1", "SV POISON: +5", "WT: 2.4 Size: SMALL"],
    ["Slot: CHEST", "STR: +10 DEX: +10 STA: +10 AGI: +5 HP: +55 End: +25", "HP Regen: +10", "Size: LARGE"],
    ["Slot: LEGS", "AC: 12", "WIS: 6 AGI: 6 END: 10", "SV Fire: 2 SV Disease: 8", "WT: 4.5 Size: LARGE"],
    ["Slot: PRIMARY", "Skill: 1H Blunt", "Base Dmg: 9", "Atk Delay: 30", "STA: +3", "WIS: +3", "WT: 1.5 Size: SMALL"],
    ["Slot: FACE", "AC: 5 HP: +5 MANA: +5 END: +5", "STA: -12", "WT: 2.0 Size: SMALL"],
  ];
  for (const lines of cards) {
    for (const [grade, exp] of [[1, 0], [1, 1], [2, 3], [5, 17], [10, 0]]) {
      assert.deepEqual(
        gradedItemStats(parseItemStats(lines), grade, exp).stats,
        parseItemStats(gradedCardLines(lines, grade, exp)).stats,
        `${lines[0]} at +${grade} with ${exp} exp`,
      );
    }
  }
});
