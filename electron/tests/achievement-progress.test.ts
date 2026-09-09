/**
 * Tests for the pure rules behind an achievement criterion (ADR 0212): a `"watch"` criterion
 * matching exactly like an alert rule would (reusing `matchCast`/`matchFade`/`matchLine` wholesale),
 * a `"zone"` criterion folding a difficulty variant into the same place, a `"highscore"` criterion
 * reading the live board rather than history, and the progress/announcement bookkeeping every kind
 * shares.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_STYLES } from "../../src/shared/alert-styles";
import {
  freshProgress,
  isComplete,
  matchesCast,
  matchesFade,
  matchesHighScore,
  matchesLine,
  matchesZone,
  nextUnannouncedCriterion,
  runningView,
  tallyOf,
} from "../../src/shared/achievement-progress";
import type { AchievementCriterion, AchievementDefinition, CastAlertSettings } from "../../src/shared/types";

const T0 = Date.parse("2026-08-17T12:00:00.000Z");
const at = new Date(T0).toISOString();

const settings = () =>
  ({ enabled: true, includeSelf: false, color: "#e5534b", position: "top", styles: [...BUILT_IN_STYLES] }) as unknown as CastAlertSettings;

function lineCriterion(text: string, regex = false): AchievementCriterion {
  return regex
    ? { id: "c", label: "line", kind: "watch", watch: { spell: "", onLine: true, conditions: [{ field: "line", op: "regex", text }] } }
    : { id: "c", label: "line", kind: "watch", watch: { spell: text, onLine: true } };
}

test("a raw-line criterion fires on a line containing its trigger text", () => {
  const c = lineCriterion("You have entered The Feerrott");
  assert.equal(matchesLine(c, settings(), { message: "You have entered The Feerrott.", at }, T0), true);
  assert.equal(matchesLine(c, settings(), { message: "You have entered Blackburrow.", at }, T0), false);
});

test("a raw-line criterion can carry a regex condition, guarded the same way an alert rule's is", () => {
  const c = lineCriterion("have slain a .*(dragon|wyrm)", true);
  assert.equal(matchesLine(c, settings(), { message: "You have slain a red dragon!", at }, T0), true);
  assert.equal(matchesLine(c, settings(), { message: "You have slain a rat.", at }, T0), false);
});

test("an onLine-only criterion never matches a cast, even though CastWatch.onCast unset normally means on", () => {
  const c = lineCriterion("Fear");
  assert.equal(matchesCast(c, settings(), { caster: "a shade", spell: "Fear", at }, T0), false);
});

test("a watch criterion without onCast set doesn't match a cast, and one with it does", () => {
  const line: AchievementCriterion = { id: "c", label: "cast", kind: "watch", watch: { spell: "Fear", onLine: true } };
  const cast: AchievementCriterion = { id: "c", label: "cast", kind: "watch", watch: { spell: "Fear", onCast: true } };
  assert.equal(matchesCast(line, settings(), { caster: "a shade", spell: "Fear", at }, T0), false);
  assert.equal(matchesCast(cast, settings(), { caster: "a shade", spell: "Fear", at }, T0), true);
});

test("a watch criterion with onFade matches a fade and nothing else", () => {
  const c: AchievementCriterion = { id: "c", label: "fade", kind: "watch", watch: { spell: "Root", onFade: true } };
  assert.equal(matchesFade(c, settings(), { spell: "Root", at }, T0), true);
  assert.equal(matchesCast(c, settings(), { caster: "You", spell: "Root", at }, T0), false);
});

test("a cast criterion matches the player's own cast even when the player's global includeSelf alert setting is off (ADR 0214)", () => {
  // settings() above sets includeSelf: false — the pure matcher must not be at the mercy of it.
  const c: AchievementCriterion = { id: "c", label: "rez", kind: "watch", watch: { spell: "Resurrect", onCast: true } };
  assert.equal(matchesCast(c, settings(), { caster: "You", spell: "Resurrection", at }, T0), true);
});

test("a \"count\" criterion matches exactly like \"watch\" does — only what the tracker does with the result differs", () => {
  const c: AchievementCriterion = { id: "c", label: "hill giants", kind: "count", watch: { spell: "hill giant", onLine: true }, count: { atLeast: 25 } };
  assert.equal(matchesLine(c, settings(), { message: "You have slain a hill giant!", at }, T0), true);
  assert.equal(matchesLine(c, settings(), { message: "You have slain a rat!", at }, T0), false);
});

test("tallyOf reads a count criterion's running total, or 0 if it has never matched", () => {
  const progress = freshProgress("d");
  assert.equal(tallyOf(progress, "hill-giants"), 0);
  progress.tally = { "hill-giants": 14 };
  assert.equal(tallyOf(progress, "hill-giants"), 14);
  assert.equal(tallyOf(undefined, "hill-giants"), 0);
});

test("a manual or zone/highscore criterion never matches via the watch path", () => {
  const manual: AchievementCriterion = { id: "c", label: "manual", kind: "manual" };
  const zone: AchievementCriterion = { id: "c", label: "zone", kind: "zone", zone: "The Feerrott" };
  assert.equal(matchesLine(manual, settings(), { message: "anything", at }, T0), false);
  assert.equal(matchesLine(zone, settings(), { message: "anything", at }, T0), false);
});

test("a zone criterion folds a difficulty variant into the same place (ADR 0059)", () => {
  const c: AchievementCriterion = { id: "z", label: "Steamfont Mountains", kind: "zone", zone: "Steamfont Mountains" };
  assert.equal(matchesZone(c, "The Steamfont Mountains 2 (Adaptive)"), true);
  assert.equal(matchesZone(c, "Blackburrow"), false);
});

test("a highscore criterion is satisfied at or above its threshold, never below", () => {
  const c: AchievementCriterion = { id: "h", label: "big hit", kind: "highscore", highscore: { categoryId: "biggest-hit", atLeast: 500 } };
  assert.equal(matchesHighScore(c, { categoryId: "biggest-hit", value: 500 }), true);
  assert.equal(matchesHighScore(c, { categoryId: "biggest-hit", value: 499 }), false);
  assert.equal(matchesHighScore(c, { categoryId: "biggest-nuke", value: 9999 }), false);
});

function def(criteria: AchievementCriterion[]): AchievementDefinition {
  return { id: "d", title: "Test", isOfficial: true, criteria };
}

test("isComplete is false with no criteria at all, and false until every one is done", () => {
  assert.equal(isComplete(def([]), freshProgress("d")), false);
  const criteria = [
    { id: "a", label: "a", kind: "manual" as const },
    { id: "b", label: "b", kind: "manual" as const },
  ];
  const progress = freshProgress("d");
  assert.equal(isComplete(def(criteria), progress), false);
  progress.done = ["a"];
  assert.equal(isComplete(def(criteria), progress), false);
  progress.done = ["a", "b"];
  assert.equal(isComplete(def(criteria), progress), true);
});

test("nextUnannouncedCriterion offers criteria in definition order, one at a time", () => {
  const criteria = [
    { id: "a", label: "a", kind: "manual" as const },
    { id: "b", label: "b", kind: "manual" as const },
  ];
  const d = def(criteria);
  const progress = freshProgress("d");
  progress.done = ["a", "b"]; // both done in one burst, neither announced yet
  const first = nextUnannouncedCriterion(d, progress);
  assert.equal(first?.id, "a");
  progress.announcedCriteria = ["a"];
  const second = nextUnannouncedCriterion(d, progress);
  assert.equal(second?.id, "b");
  progress.announcedCriteria = ["a", "b"];
  assert.equal(nextUnannouncedCriterion(d, progress), null);
});

test("runningView joins every definition with its progress, or an empty one if it has none yet", () => {
  const d = def([{ id: "a", label: "a", kind: "manual" }]);
  const [untouched] = runningView([d], []);
  assert.equal(untouched.done.length, 0);
  assert.equal(untouched.total, 1);

  const progress = freshProgress("d");
  progress.done = ["a"];
  const [touched] = runningView([d], [progress]);
  assert.deepEqual(touched.done, ["a"]);
});
