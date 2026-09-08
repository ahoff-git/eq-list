/**
 * Tests for the pure rules behind a timeboxed goal (ADR 0198): whether it's running, met, or ran out
 * of time unmet, which milestones a stack of progress crosses, and the goal-duration parser's own
 * ceiling — deliberately not `spawn-timers.ts`'s, per the lesson ADR 0135 already paid for once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  goalState,
  goalWantsItem,
  goalWantsMob,
  MAX_GOAL_SECONDS,
  MAX_STREAK_INTERVAL_SECONDS,
  nextMilestone,
  parseGoalDuration,
  parseStreakInterval,
  runningGoalTargets,
} from "../../src/shared/goal-progress";
import type { RunningGoal } from "../../src/shared/types";

const T0 = Date.parse("2026-08-17T12:00:00.000Z");

test("running while short of the target and time remains", () => {
  assert.equal(goalState({ obtained: 5, qty: 20, dueAt: new Date(T0 + 1000).toISOString() }, T0), "running");
});

test("completed as soon as obtained reaches the target, whatever the clock says", () => {
  assert.equal(goalState({ obtained: 20, qty: 20, dueAt: new Date(T0 - 1).toISOString() }, T0), "completed");
});

test("completion is checked before expiry — met at the very moment time runs out reads as met", () => {
  assert.equal(goalState({ obtained: 20, qty: 20, dueAt: new Date(T0).toISOString() }, T0), "completed");
});

test("expired once the clock passes the due time with the target unmet", () => {
  assert.equal(goalState({ obtained: 5, qty: 20, dueAt: new Date(T0).toISOString() }, T0), "expired");
});

test("nextMilestone offers the lowest unannounced fraction the current ratio has reached", () => {
  assert.equal(nextMilestone(3, 20, []), null); // 15%, nothing crossed yet
  assert.equal(nextMilestone(5, 20, []), 0.25);
  assert.equal(nextMilestone(5, 20, [0.25]), null); // already said
});

test("a single big stack that crosses two thresholds at once still offers each in turn", () => {
  // 0 of 20 to 12 of 20 in one loot line crosses 25% and 50% together, but not 75% (12/20 = 0.6).
  const announced: number[] = [];
  let m = nextMilestone(12, 20, announced);
  assert.equal(m, 0.25);
  announced.push(m!);
  m = nextMilestone(12, 20, announced);
  assert.equal(m, 0.5);
  announced.push(m!);
  assert.equal(nextMilestone(12, 20, announced), null); // 75% not yet reached
});

test("nextMilestone never fires on a goal with no real target", () => {
  assert.equal(nextMilestone(5, 0, []), null);
});

test("parseGoalDuration reads minutes and hours, and refuses what it can't", () => {
  assert.equal(parseGoalDuration("1h"), 3600);
  assert.equal(parseGoalDuration("30m"), 1800);
  assert.equal(parseGoalDuration("1h 30m"), 5400);
  assert.equal(parseGoalDuration(""), 0);
  assert.equal(parseGoalDuration("nonsense"), null);
});

test("parseGoalDuration clamps at its own ceiling, not the spawn timer's 7-day one", () => {
  assert.equal(parseGoalDuration("100h"), MAX_GOAL_SECONDS);
  assert.ok(MAX_GOAL_SECONDS < 24 * 3600, "a farming session is hours, not days");
});

test("parseGoalDuration refuses a unit it doesn't accept, rather than silently reinterpreting it", () => {
  // Days are a spawn timer's unit, not a goal's (ADR 0135's lesson) — must be refused, not read as
  // some other quantity.
  assert.equal(parseGoalDuration("2d"), null);
});

test("a streak goal has no completion — running while its window hasn't lapsed, whatever its (unused) obtained/qty say", () => {
  const streak = { mode: "streak" as const, obtained: 0, qty: 0, dueAt: new Date(T0 + 1000).toISOString() };
  assert.equal(goalState(streak, T0), "running");
});

test("a streak goal expires the instant its window lapses — there is no obtained/qty check to beat it there", () => {
  const streak = { mode: "streak" as const, obtained: 50, qty: 0, dueAt: new Date(T0).toISOString() };
  assert.equal(goalState(streak, T0), "expired");
});

test("mode absent reads as \"target\", so a file written before streaks existed behaves exactly as before", () => {
  assert.equal(goalState({ obtained: 20, qty: 20, dueAt: new Date(T0 - 1).toISOString() }, T0), "completed");
});

test("parseStreakInterval reads seconds and minutes, and refuses what it can't", () => {
  assert.equal(parseStreakInterval("10s"), 10);
  assert.equal(parseStreakInterval("2m"), 120);
  assert.equal(parseStreakInterval("1m 30s"), 90);
  assert.equal(parseStreakInterval(""), 0);
  assert.equal(parseStreakInterval("nonsense"), null);
});

test("parseStreakInterval clamps at its own ceiling, not the goal duration's", () => {
  assert.equal(parseStreakInterval("1h"), null, "hours are a goal duration's unit, not a streak's");
  assert.equal(parseStreakInterval("45m"), MAX_STREAK_INTERVAL_SECONDS);
  assert.ok(MAX_STREAK_INTERVAL_SECONDS < MAX_GOAL_SECONDS, "a streak window is meant to stay tight");
});

test("goalWantsItem matches the same way the shopping list does — either name containing the other", () => {
  assert.ok(goalWantsItem({ kind: "item", name: "Phosphorous Powder" }, "a Phosphorous Powder"));
  assert.ok(goalWantsItem({ kind: "item", name: "Powder" }, "Phosphorous Powder"));
  assert.ok(!goalWantsItem({ kind: "item", name: "Powder" }, "Rusty Dagger"));
});

test("goalWantsItem never matches a mob goal, and goalWantsMob never matches an item goal", () => {
  assert.ok(!goalWantsItem({ kind: "mob", name: "gnoll pup" }, "gnoll pup"));
  assert.ok(!goalWantsMob({ kind: "item", name: "gnoll pup" }, "gnoll pup"));
});

test("goalWantsMob folds the article and case the same way a kill line does", () => {
  assert.ok(goalWantsMob({ kind: "mob", name: "a Gnoll Pup" }, "gnoll pup"));
  assert.ok(!goalWantsMob({ kind: "mob", name: "gnoll pup" }, "orc pawn"));
});

test("goalWantsMob is plain text — a substring of the mob's name, the same rule an alert trigger uses", () => {
  assert.ok(goalWantsMob({ kind: "mob", name: "gnoll" }, "a gnoll pup"));
  assert.ok(goalWantsMob({ kind: "mob", name: "gnoll" }, "a gnoll pup guard"));
  // Needle in haystack, not the item match's either-way generosity: the mob's own name must
  // contain what was typed, not the other way round — typing the whole sentence back matches
  // nothing real, the same way an alert's trigger wouldn't.
  assert.ok(!goalWantsMob({ kind: "mob", name: "a gnoll pup that also fights orcs" }, "gnoll pup"));
});

test("goalWantsMob's \"any\" kind matches every kill, and needs no name at all", () => {
  assert.ok(goalWantsMob({ kind: "any", name: "" }, "a gnoll pup"));
  assert.ok(goalWantsMob({ kind: "any", name: "" }, "Lord Nagafen"));
});

function goal(over: Partial<RunningGoal>): RunningGoal {
  return {
    id: over.id ?? "g1",
    target: over.target ?? { kind: "item", name: "Powder" },
    qty: over.qty ?? 20,
    obtained: over.obtained ?? 0,
    startedAt: over.startedAt ?? new Date(T0).toISOString(),
    durationSec: over.durationSec ?? 3600,
    dueAt: over.dueAt ?? new Date(T0 + 3600_000).toISOString(),
    announcedMilestones: over.announcedMilestones ?? [],
    resultAnnounced: over.resultAnnounced ?? false,
    state: over.state ?? "running",
  };
}

test("runningGoalTargets splits by kind and drops anything not running", () => {
  const goals = [
    goal({ id: "a", target: { kind: "item", name: "Powder" }, state: "running" }),
    goal({ id: "b", target: { kind: "mob", name: "gnoll pup" }, state: "running" }),
    goal({ id: "c", target: { kind: "item", name: "Finished" }, state: "completed" }),
  ];
  const { items, mobs } = runningGoalTargets(goals);
  assert.deepEqual(items.map((t) => t.name), ["Powder"]);
  assert.deepEqual(mobs.map((t) => t.name), ["gnoll pup"]);
});

test("runningGoalTargets buckets an \"any\" target with the mobs — it answers every one of them", () => {
  const goals = [goal({ id: "a", target: { kind: "any", name: "Any kill" }, state: "running" })];
  const { items, mobs } = runningGoalTargets(goals);
  assert.equal(items.length, 0);
  assert.deepEqual(mobs.map((t) => t.kind), ["any"]);
});
