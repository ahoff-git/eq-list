/**
 * Black-box tests for `src/shared/mob/difficulty-scaling.ts`: the wiki's health-step table, the
 * step-to-multiplier table, and mob card lines scaled with them. Only need re-running if it changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  difficultyMultiplier,
  healthStep,
  mobLinesAtDifficulty,
  scaleFactor,
  STEP_MULTIPLIER,
  type DifficultySetting,
} from "../../src/shared/mob/difficulty-scaling";

const at = (difficulty: DifficultySetting["difficulty"], instance: DifficultySetting["instance"] = "public", multiClass = false): DifficultySetting => ({
  difficulty,
  instance,
  multiClass,
});

test("health steps follow the wiki's table, N/A included", () => {
  assert.equal(healthStep(at(0)), 0, "public D0 is the baseline");
  assert.equal(healthStep(at(3)), 3);
  assert.equal(healthStep(at(0, "personalSolo")), -2, "Reduced --");
  assert.equal(healthStep(at(0, "raidMulti")), 1);
  assert.equal(healthStep(at(4)), undefined, "a single-class mob has no D4");
  assert.equal(healthStep(at(0, "public", true)), undefined, "a multi-class mob has no D0");
  assert.equal(healthStep(at(4, "raidMulti", true)), 5);
});

test("every step the table uses has a multiplier, rising with the step", () => {
  const steps = Object.keys(STEP_MULTIPLIER).map(Number).sort((a, b) => a - b);
  assert.deepEqual(steps, [-2, -1, 0, 1, 2, 3, 4, 5]);
  steps.slice(1).forEach((s, i) => assert.ok(STEP_MULTIPLIER[s] > STEP_MULTIPLIER[steps[i]]));
  assert.equal(difficultyMultiplier(at(2)), 1.7);
});

test("a figure is generalised from where it was read, then scaled", () => {
  assert.equal(scaleFactor(at(2)), 1.7, "from the wiki's public D0");
  assert.equal(scaleFactor(at(0), at(2)), 1 / 1.7, "back down from a D2 reading");
  assert.equal(scaleFactor(at(4)), undefined);
});

test("mob card lines: HP and every damage figure scale; the rest, and HP's bracket, don't", () => {
  const lines = ["Level: 39-41", "AC: 356", "HP: 3230-3270 (1)", "Damage per hit: 33 - 104 Damage per kick : 2 - 20", "HP: 1,200 (3)"];
  assert.deepEqual(mobLinesAtDifficulty(lines, at(1)), [
    "Level: 39-41",
    "AC: 356",
    "HP: 4199-4251 (1)",
    "Damage per hit: 43 - 135 Damage per kick : 3 - 26",
    "HP: 1,560 (3)",
  ]);
  assert.deepEqual(mobLinesAtDifficulty(lines, at(0)), lines, "the setting the card was read at");
  assert.deepEqual(mobLinesAtDifficulty(lines, at(4)), lines, "a combination that doesn't exist");
  assert.deepEqual(mobLinesAtDifficulty(["HP: ? (?)", "Damage per hit: ?"], at(3)), ["HP: ? (?)", "Damage per hit: ?"]);
});
