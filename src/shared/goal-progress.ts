/**
 * goal-progress.ts — the rules behind a timeboxed farming goal (ADR 0198): whether it's still
 * running, met, or ran out of time unmet, and which progress milestones it has crossed.
 *
 * Pure and zero-I/O, like `spawn-timers.ts` next door — `now` is always a parameter, never read from
 * the clock — so `electron/goal-tracker.ts` is the only thing that owns a clock, and this is tested
 * without one.
 */
import { parseDuration } from "./duration";
import { stripArticle } from "./log-parser";
import { normalizeItemName } from "./grouping";
import { mobKey } from "./mob-stats";
import type { Goal, GoalMode, GoalState, GoalTarget, RunningGoal } from "./types";

/** The progress fractions a running goal is bannered at, in the order they're crossed. */
export const MILESTONE_FRACTIONS = [0.25, 0.5, 0.75] as const;

/**
 * A farming session is minutes to a few hours — long enough to be worth timeboxing, short enough
 * that "in the next hour" still means something. Its own ceiling, deliberately not `MAX_TIMER_SECONDS`
 * (`spawn-timers.ts`, 7 days): reusing another feature's cap is exactly the bug ADR 0135 already
 * found once, where a duration typed for one feature was silently clamped by another's ceiling.
 */
export const MAX_GOAL_SECONDS = 8 * 3600;

/** `"1h"`, `"30m"`, `"1h 30m"` — minutes and hours only; see `MAX_GOAL_SECONDS`. */
export function parseGoalDuration(text: string | null | undefined): number | null {
  return parseDuration(text, { units: ["m", "h"], max: MAX_GOAL_SECONDS });
}

/**
 * A streak's window is meant to keep the pace tight — long enough to type a target and glance back
 * at the screen, short enough that "streak" still means something rather than reading as an
 * ordinary timed goal wearing a different label. Its own ceiling for the reason `MAX_GOAL_SECONDS`'s
 * comment gives: reusing another feature's cap is how a typed value ends up silently clamped to a
 * limit that was never this feature's own.
 */
export const MAX_STREAK_INTERVAL_SECONDS = 30 * 60;

/** `"10s"`, `"90s"`, `"2m"`, `"1m 30s"` — seconds and minutes only; see `MAX_STREAK_INTERVAL_SECONDS`. */
export function parseStreakInterval(text: string | null | undefined): number | null {
  return parseDuration(text, { units: ["s", "m"], max: MAX_STREAK_INTERVAL_SECONDS });
}

/**
 * Whether a goal is still running, was met, or ran out of time unmet.
 *
 * Completion is checked **before** expiry: a goal whose last loot line landed at the very moment its
 * clock ran out is a goal you met, not one that timed out on you — the two read very differently to
 * the player even though both happened in the same second. Mirrors `spawnState`'s shape, one clause
 * shorter, since a goal has no window/alive/stale phases to speak of.
 *
 * A `"streak"` goal (ADR 0199, absent `mode` reads as `"target"`) has no quantity to complete — it
 * only ever runs or breaks, so the completion clause simply never fires for one and the clock is the
 * whole answer.
 */
export function goalState(
  goal: Pick<Goal, "obtained" | "qty" | "dueAt"> & { mode?: GoalMode },
  nowMs: number,
): GoalState {
  if ((goal.mode ?? "target") === "target" && goal.obtained >= goal.qty) return "completed";
  if (nowMs >= Date.parse(goal.dueAt)) return "expired";
  return "running";
}

/**
 * The next un-announced milestone fraction now crossed by `obtained/qty`, or `null` if none is.
 *
 * Returns the **lowest** unannounced one rather than the highest: a single big loot stack that jumps
 * a goal from 0 of 20 straight to 15 of 20 has crossed both 25% and 50%, and the tracker calls this
 * in a loop, announcing one and recording it before asking again — so a big stack still says both
 * things rather than skipping straight to the higher figure and reading as though 25% never happened.
 */
export function nextMilestone(obtained: number, qty: number, announced: number[]): number | null {
  if (qty <= 0) return null;
  const ratio = obtained / qty;
  for (const fraction of MILESTONE_FRACTIONS) {
    if (ratio >= fraction && !announced.includes(fraction)) return fraction;
  }
  return null;
}

/** The same collapse rule the shopping list matches loot against (`electron/store.ts`'s `normalize`),
 *  so a goal for "Phosphorous Powder" credits the same loot lines a list row for it would. */
function normalizeItem(name: string): string {
  return normalizeItemName(stripArticle(name));
}

/** Whether an item goal's target names this item — a fuzzy either-contains-the-other match, the
 *  same generosity `store.ts`'s default match mode gives the shopping list. */
export function goalWantsItem(target: GoalTarget, itemName: string): boolean {
  if (target.kind !== "item") return false;
  const a = normalizeItem(target.name);
  const b = normalizeItem(itemName);
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Whether a mob goal's target names this mob.
 *
 * `"any"` matches every kill, deliberately with no further check — that's the whole point of the
 * option. Otherwise this is **plain text**, the same rule an alert's own trigger uses
 * (`cast-alerts.ts`'s `triggerHit`): the typed target, folded to a bare lowercase name, need only be
 * a **substring** of the kill's — needle in haystack, same direction a watch matches in — so "gnoll"
 * alone reaches "a gnoll pup", "a gnoll pup guard" and every other variant a camp turns up, rather
 * than requiring the exact name spawn timers key on. A goal is a rougher, faster-to-type ask than a
 * spawn timer's identity, and this is what makes typing "gnoll" for an evening of gnoll country
 * actually work.
 */
export function goalWantsMob(target: GoalTarget, mob: string): boolean {
  if (target.kind === "any") return true;
  if (target.kind !== "mob") return false;
  return mobKey(mob).includes(mobKey(target.name));
}

/**
 * Every currently-**running** goal's want, split by kind — what the List and Hunt tabs' focus mode
 * (ADR 0198) emphasizes or, with focus on, hides everything else in favour of. A finished goal drops
 * out the instant it stops running, the same as it does from the overlay floater: it has nothing left
 * to focus on.
 */
export function runningGoalTargets(goals: readonly RunningGoal[]): { items: GoalTarget[]; mobs: GoalTarget[] } {
  const running = goals.filter((g) => g.state === "running");
  return {
    items: running.filter((g) => g.target.kind === "item").map((g) => g.target),
    // "any" belongs here too: `goalWantsMob` already answers every mob for it, so an "any kill"
    // goal correctly emphasizes (or, with hiding on, keeps) every mob row on the Hunt tab rather
    // than none — the whole point of the wildcard is that every kill is a step toward it.
    mobs: running.filter((g) => g.target.kind === "mob" || g.target.kind === "any").map((g) => g.target),
  };
}
