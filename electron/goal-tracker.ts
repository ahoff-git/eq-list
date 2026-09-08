/**
 * goal-tracker.ts — the running goals: what's being farmed, how far along it is, and saying so as
 * progress lands (ADR 0198).
 *
 * The rules are next door in [goal-progress.ts](../src/shared/goal-progress.ts), pure and tested;
 * this is the holder that carries them out and the only state involved — the goals themselves, their
 * progress, and which milestones have already been spoken for.
 *
 * Deliberately its own tracker rather than a layer over `store.ts`'s shopping-list counts or
 * `spawn-tracker.ts`'s camps: a list entry's `obtained` is a **lifetime** count with no clock on it,
 * and a spawn timer carries evidence about a named that a farming goal has nothing in common with.
 * Folding either in would mean teaching that tracker a second, timeboxed idea of "how many", or
 * inventing camp/evidence fields on something that is neither a camp nor evidence.
 *
 * Progress is applied and bannered **the moment a matching line lands** (`noteLoot`/`noteKill`), not
 * on the sweep — a milestone is about *count*, which only ever changes on an event, and waiting a
 * second for the next sweep to notice would just be lag. The sweep's only job is the one thing that
 * moves on its own: **time**, which is what turns a goal into `expired` with nothing else happening.
 *
 * The one thing this refuses to do, the same as `spawn-tracker.ts`, is alert about the past: a goal
 * whose clock ran out while the app was shut is marked spoken-for at load and never bannered.
 *
 * A `"streak"` goal (ADR 0199, `Goal.mode`) shares this file rather than getting its own: it is the
 * same shape with a different rule for what a hit and a lapsed clock do — `creditStreak`/`breakStreak`
 * next to `announceProgress`/`stillRunning` are that rule, not a second tracker.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createLogger } from "../src/shared/logging";
import { alertStyle, GOAL_STYLE_ID } from "../src/shared/alert-styles";
import { goalState, goalWantsItem, goalWantsMob, nextMilestone } from "../src/shared/goal-progress";
import type {
  CastAlertEvent,
  CastAlertSettings,
  Goal,
  GoalAlertPayload,
  GoalTarget,
  GoalTemplate,
  GoalView,
  KillEvent,
  LootEvent,
  RunningGoal,
} from "../src/shared/types";
import { createSaver, readJson } from "./json-store";

const log = createLogger("goal-tracker");

/** Edits (progress, a fresh goal) arrive one at a time; coalesce a burst into one write. */
const WRITE_DEBOUNCE_MS = 2000;

/** How often the board is swept for a goal whose time simply ran out. A goal is minutes to hours,
 *  so a second's granularity is far finer than the thing being measured. */
const SWEEP_MS = 1000;

/** What's on disk: the goals themselves, and the saved wants a new one can be started from. */
interface Stored {
  goals: Goal[];
  templates: GoalTemplate[];
}

/** The label a target of kind `"any"` displays. Fixed, since there is nothing to type for it —
 *  every `start`/`saveTemplate` variant runs the target it's handed through this rather than each
 *  deciding separately what an untyped wildcard is called. */
const ANY_KILL_NAME = "Any kill";

/** The name to file a target under: `"any"` always reads as `ANY_KILL_NAME` regardless of what (if
 *  anything) was passed in, so a caller never has to special-case the one kind with nothing to type. */
function targetName(target: GoalTarget): string {
  return target.kind === "any" ? ANY_KILL_NAME : target.name.trim();
}

function load(file: string): Stored {
  const stored = readJson<Partial<Stored>>(file, {});
  // A file written before streak goals existed (ADR 0199) holds only the one mode that could have
  // made it — untagged reads as "target", same rule `Goal.mode`'s own doc gives.
  return {
    goals: (stored.goals ?? []).map((g) => (g.mode ? g : { ...g, mode: "target" as const })),
    templates: (stored.templates ?? []).map((t) => (t.mode ? t : { ...t, mode: "target" as const })),
  };
}

export interface GoalTrackerDeps {
  userDataDir: string;
  /** Current alert settings, so a goal's banner wears whatever the alerts wear. */
  getSettings: () => CastAlertSettings;
  /** Put a banner on the overlay, the same way every other alert reaches it. */
  raise: (alert: CastAlertEvent) => void;
  /** Injectable, so a test of an 8-hour goal takes a millisecond. */
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export interface GoalTracker {
  /** Start a new goal. `null` for a blank name or a non-positive qty/duration — nothing is filed. */
  start(target: GoalTarget, qty: number, durationSec: number): Goal | null;
  /**
   * Start a streak challenge (ADR 0199): no quantity, just a window that re-arms on every
   * qualifying hit until one is missed. `null` for a blank name or a non-positive interval.
   */
  startStreak(target: GoalTarget, intervalSec: number, autoRestart: boolean): Goal | null;
  /** A loot line landed: credit every running item-goal it matches. */
  noteLoot(event: LootEvent): void;
  /** A kill landed that already counted as yours (`combat.countsKill`): credit every running
   *  mob-goal it matches. */
  noteKill(event: KillEvent): void;
  /** Drop a goal early. Nothing measured is lost, so this needs no confirmation. */
  abandon(id: string): void;
  /** Drop every completed/expired goal off the board. */
  clearFinished(): void;
  /** Save a want for reuse, without starting it. */
  saveTemplate(target: GoalTarget, qty: number, durationSec: number, label?: string): void;
  /** Save a streak want for reuse, without starting it. */
  saveStreakTemplate(target: GoalTarget, intervalSec: number, autoRestart: boolean, label?: string): void;
  /** Forget a saved template. Does not touch any goal already started from it. */
  deleteTemplate(id: string): void;
  /** Everything the tab and the floater show. */
  view(): GoalView;
  /** Fires whenever the list changes. */
  onChanged(cb: () => void): void;
  flush(): void;
  /** Stop sweeping — the app is quitting. */
  dispose(): void;
}

export function createGoalTracker({
  userDataDir,
  getSettings,
  raise,
  now = Date.now,
  setInterval: setEvery = (fn, ms) => {
    const t = setInterval(fn, ms);
    t.unref?.();
    return t;
  },
  clearInterval: clearEvery = (h) => clearInterval(h as NodeJS.Timeout),
}: GoalTrackerDeps): GoalTracker {
  const file = path.join(userDataDir, "goals.json");
  const state = load(file);
  const saver = createSaver(file, "goals", () => state, WRITE_DEBOUNCE_MS, { concern: "goals" });
  let listener: (() => void) | null = null;

  const changed = () => {
    saver.save();
    listener?.();
  };

  /** The overlay's own gate: an app the player silenced stays silent. There is no per-goal opt-out
   *  to check alongside it — starting a goal *is* the deliberate act that a spawn timer's `notify`
   *  exists to stand in for elsewhere. */
  function announce(payload: GoalAlertPayload, at: number, styleId: string | undefined): void {
    const settings = getSettings();
    if (!settings.enabled) return;
    raise({
      caster: "",
      spell: payload.target.name,
      at: new Date(at).toISOString(),
      event: "goal",
      goal: payload,
      style: alertStyle(settings, { styleId: styleId ?? GOAL_STYLE_ID }),
    });
  }

  /**
   * Announce whatever progress just produced — every milestone freshly crossed, then completion —
   * in one pass, so a single big loot stack that jumps a goal from 0 of 20 to 15 of 20 still says
   * both 25% and 50% rather than skipping straight to the higher one (`nextMilestone`'s own doc).
   */
  function announceProgress(goal: Goal, at: number): void {
    while (!goal.resultAnnounced) {
      if (goalState(goal, at) === "completed") {
        goal.resultAnnounced = true;
        announce({ kind: "completed", target: goal.target, qty: goal.qty, obtained: goal.obtained }, at, goal.styleId);
        break;
      }
      const m = nextMilestone(goal.obtained, goal.qty, goal.announcedMilestones);
      if (m === null) break;
      goal.announcedMilestones = [...goal.announcedMilestones, m];
      announce(
        { kind: "milestone", target: goal.target, qty: goal.qty, obtained: goal.obtained, pct: Math.round(m * 100) },
        at,
        goal.styleId,
      );
    }
  }

  const isStreak = (goal: Goal) => goal.mode === "streak";

  /**
   * A streak goal's window has lapsed with no qualifying hit: bank the break, then either finish the
   * goal (default — the same terminal state an ordinary goal reaches) or reset it to start again
   * (`autoRestart`) — never both, and never silently, since a break is exactly the news a streak
   * challenge exists to give.
   */
  function breakStreak(goal: Goal, at: number): void {
    announce(
      { kind: "streak-broken", target: goal.target, streak: goal.obtained, bestStreak: goal.bestStreak ?? goal.obtained },
      at,
      goal.styleId,
    );
    if (goal.autoRestart) {
      goal.obtained = 0;
      goal.dueAt = new Date(at + goal.durationSec * 1000).toISOString();
    } else {
      goal.resultAnnounced = true;
    }
  }

  /**
   * A streak goal's target was just hit: extend the streak and push its window out. If the window
   * had already lapsed *live* before this hit landed — the same replayed-batch race `stillRunning`
   * guards against for an ordinary goal — the break is resolved first; an `autoRestart` goal then
   * treats this very hit as the first of its next run, but a goal that just finished does not.
   */
  function creditStreak(goal: Goal, at: number): void {
    if (at >= Date.parse(goal.dueAt)) {
      breakStreak(goal, at);
      if (goal.resultAnnounced) return;
    }
    goal.obtained += 1;
    goal.bestStreak = Math.max(goal.bestStreak ?? 0, goal.obtained);
    goal.dueAt = new Date(at + goal.durationSec * 1000).toISOString();
  }

  /**
   * Whether a goal is still open for credit **right now**.
   *
   * `noteLoot`/`noteKill` used to guard only on `resultAnnounced`, which the 1-second sweep sets — but
   * a burst of *replayed* log lines (a slow disk read, or the app catching up on a gap) is processed
   * in one synchronous pass, and `setInterval`'s sweep callback cannot run in the middle of it. Without
   * this check, a goal whose due time had already passed in real wall-clock terms kept being
   * credited — and could even complete or cross a milestone — for however long the batch took.
   *
   * This is **not** the startup case above: a goal that ran out while the app was shut is already
   * marked spoken-for before the first line of any replay ever reaches here, so what this actually
   * catches is a deadline passing *live*, mid-run, just a moment ahead of the sweep's own schedule —
   * which is still real news and gets the ordinary expired banner, exactly as the sweep would have
   * given it.
   */
  function stillRunning(goal: Goal, at: number): boolean {
    if (goal.resultAnnounced) return false;
    const state = goalState(goal, at);
    if (state === "running") return true;
    // "completed" should already have been caught by `announceProgress` the instant it happened —
    // this branch exists for it anyway rather than assuming "expired", so a future caller of
    // `stillRunning` can't be handed the wrong banner for the terminal state it actually found.
    goal.resultAnnounced = true;
    announce(
      { kind: state === "completed" ? "completed" : "expired", target: goal.target, qty: goal.qty, obtained: goal.obtained },
      at,
      goal.styleId,
    );
    return false;
  }

  function sweep(): void {
    const at = now();
    let any = false;
    for (const goal of state.goals) {
      // A goal already spoken for is done, one way or the other — completion is caught the instant
      // it happens (`announceProgress`), so all that's left for the sweep to catch is a clock running
      // out with nothing else happening. A streak that's still running (whether or not it will ever
      // finish) is never spoken for, so this same guard covers it too.
      if (goal.resultAnnounced) continue;
      if (isStreak(goal)) {
        if (at >= Date.parse(goal.dueAt)) {
          breakStreak(goal, at);
          any = true;
        }
        continue;
      }
      if (goalState(goal, at) === "expired") {
        goal.resultAnnounced = true;
        announce({ kind: "expired", target: goal.target, qty: goal.qty, obtained: goal.obtained }, at, goal.styleId);
        any = true;
      }
    }
    if (any) changed();
  }

  // Anything already finished when we start — in practice, a goal whose time ran out while the app
  // was shut — is not news: mark it spoken for before the first sweep runs, the same rule
  // `spawn-tracker.ts` applies to a timer found already overdue at launch. An `autoRestart` streak
  // has no "spoken for" to reach, so it's picked back up the same way instead — silently reset, not
  // bannered, exactly as `breakStreak` would leave it, minus the banner nothing here is late for.
  {
    const at = now();
    let marked = false;
    for (const goal of state.goals) {
      if (goal.resultAnnounced || goalState(goal, at) === "running") continue;
      if (isStreak(goal) && goal.autoRestart) {
        goal.obtained = 0;
        goal.dueAt = new Date(at + goal.durationSec * 1000).toISOString();
      } else {
        goal.resultAnnounced = true;
      }
      marked = true;
    }
    if (marked) saver.save();
    log.debug("restored", state.goals.length, "goals");
  }

  const handle = setEvery(sweep, SWEEP_MS);

  return {
    start(target, qty, durationSec) {
      const name = targetName(target);
      if (!name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(durationSec) || durationSec <= 0) {
        return null;
      }
      const at = now();
      const goal: Goal = {
        id: randomUUID(),
        mode: "target",
        target: { kind: target.kind, name },
        qty: Math.round(qty),
        obtained: 0,
        startedAt: new Date(at).toISOString(),
        durationSec: Math.round(durationSec),
        dueAt: new Date(at + durationSec * 1000).toISOString(),
        announcedMilestones: [],
        resultAnnounced: false,
      };
      state.goals = [...state.goals, goal];
      log.debug("goal started", { target: goal.target, qty: goal.qty, durationSec: goal.durationSec });
      changed();
      return goal;
    },

    startStreak(target, intervalSec, autoRestart) {
      const name = targetName(target);
      if (!name || !Number.isFinite(intervalSec) || intervalSec <= 0) return null;
      const at = now();
      const goal: Goal = {
        id: randomUUID(),
        mode: "streak",
        target: { kind: target.kind, name },
        qty: 0,
        obtained: 0,
        startedAt: new Date(at).toISOString(),
        durationSec: Math.round(intervalSec),
        dueAt: new Date(at + intervalSec * 1000).toISOString(),
        announcedMilestones: [],
        resultAnnounced: false,
        bestStreak: 0,
        autoRestart,
      };
      state.goals = [...state.goals, goal];
      log.debug("streak goal started", { target: goal.target, intervalSec: goal.durationSec, autoRestart });
      changed();
      return goal;
    },

    noteLoot(event) {
      let any = false;
      for (const goal of state.goals) {
        if (goal.resultAnnounced || !goalWantsItem(goal.target, event.item)) continue;
        const at = now();
        if (isStreak(goal)) {
          creditStreak(goal, at);
          any = true;
          continue;
        }
        if (!stillRunning(goal, at)) {
          any = true; // resolved silently by the check above — the board still needs to know
          continue;
        }
        goal.obtained += event.qty;
        announceProgress(goal, at);
        any = true;
      }
      if (any) changed();
    },

    noteKill(event) {
      let any = false;
      for (const goal of state.goals) {
        if (goal.resultAnnounced || !goalWantsMob(goal.target, event.target)) continue;
        const at = now();
        if (isStreak(goal)) {
          creditStreak(goal, at);
          any = true;
          continue;
        }
        if (!stillRunning(goal, at)) {
          any = true;
          continue;
        }
        goal.obtained += 1;
        announceProgress(goal, at);
        any = true;
      }
      if (any) changed();
    },

    abandon(id) {
      const before = state.goals.length;
      state.goals = state.goals.filter((g) => g.id !== id);
      if (state.goals.length !== before) changed();
    },

    clearFinished() {
      const before = state.goals.length;
      state.goals = state.goals.filter((g) => !g.resultAnnounced);
      if (state.goals.length !== before) changed();
    },

    saveTemplate(target, qty, durationSec, label) {
      const name = targetName(target);
      if (!name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(durationSec) || durationSec <= 0) return;
      const template: GoalTemplate = {
        id: randomUUID(),
        mode: "target",
        target: { kind: target.kind, name },
        qty: Math.round(qty),
        durationSec: Math.round(durationSec),
        label: label?.trim() || undefined,
      };
      state.templates = [...state.templates, template];
      changed();
    },

    saveStreakTemplate(target, intervalSec, autoRestart, label) {
      const name = targetName(target);
      if (!name || !Number.isFinite(intervalSec) || intervalSec <= 0) return;
      const template: GoalTemplate = {
        id: randomUUID(),
        mode: "streak",
        target: { kind: target.kind, name },
        qty: 0,
        durationSec: Math.round(intervalSec),
        label: label?.trim() || undefined,
        autoRestart,
      };
      state.templates = [...state.templates, template];
      changed();
    },

    deleteTemplate(id) {
      const before = state.templates.length;
      state.templates = state.templates.filter((t) => t.id !== id);
      if (state.templates.length !== before) changed();
    },

    view() {
      const at = now();
      const goals: RunningGoal[] = state.goals
        .map((goal) => ({ ...goal, state: goalState(goal, at) }))
        // Running goals first, soonest due leading; finished ones after, most recently due first —
        // so a goal you're still watching is never buried under ones you're done with.
        .sort((a, b) => {
          const running = Number(b.state === "running") - Number(a.state === "running");
          if (running) return running;
          const byDue = Date.parse(a.dueAt) - Date.parse(b.dueAt);
          return a.state === "running" ? byDue : -byDue;
        });
      return { now: new Date(at).toISOString(), goals, templates: state.templates };
    },

    onChanged(cb) {
      listener = cb;
    },

    flush: () => saver.flush(),
    dispose: () => clearEvery(handle),
  };
}
