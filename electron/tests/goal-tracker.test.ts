/**
 * Tests for the holder: starting a goal, crediting it from loot/kill lines, and the two things it
 * refuses to do — alert about a milestone or an expiry that already happened, and speak twice about
 * the same result. The clock and the sweep are both injected, so an 8-hour goal is exercised in a
 * millisecond, the same as `spawn-tracker.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createGoalTracker, type GoalTracker } from "../goal-tracker";
import { BUILT_IN_STYLES } from "../../src/shared/alert-styles";
import type { CastAlertEvent, CastAlertSettings, KillEvent, LootEvent } from "../../src/shared/types";

const T0 = Date.parse("2026-08-17T12:00:00.000Z");

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "eql-goals-"));

const settings = (enabled = true) =>
  ({ enabled, color: "#e5534b", position: "top", styles: [...BUILT_IN_STYLES] }) as unknown as CastAlertSettings;

function loot(item: string, qty: number, atSec: number): LootEvent {
  return { kind: "loot", logId: atSec, at: new Date(T0 + atSec * 1000).toISOString(), raw: "", fate: "kept", item, qty, source: "a corpse" };
}

function kill(target: string, atSec: number, killer = "You"): KillEvent {
  return {
    kind: "kill",
    logId: atSec,
    at: new Date(T0 + atSec * 1000).toISOString(),
    raw: "",
    target,
    killer,
    named: false,
    killerNamed: false,
  };
}

interface Harness {
  tracker: GoalTracker;
  raised: CastAlertEvent[];
  tick(toSec: number): void;
  /** Move the clock **without** running the sweep — a synchronous burst of replayed log lines is
   *  exactly this: real time has moved on, but nothing has told the tracker so yet. */
  advanceClock(toSec: number): void;
  dir: string;
}

function harness(options: { settings?: CastAlertSettings; dir?: string; startSec?: number } = {}): Harness {
  const raised: CastAlertEvent[] = [];
  let nowSec = options.startSec ?? 0;
  let sweep: (() => void) | null = null;
  const dir = options.dir ?? tempDir();
  const tracker = createGoalTracker({
    userDataDir: dir,
    getSettings: () => options.settings ?? settings(),
    raise: (a) => raised.push(a),
    now: () => T0 + nowSec * 1000,
    setInterval: (fn) => {
      sweep = fn;
      return 1;
    },
    clearInterval: () => {
      sweep = null;
    },
  });
  return {
    tracker,
    raised,
    tick(toSec) {
      nowSec = toSec;
      sweep?.();
    },
    advanceClock(toSec) {
      nowSec = toSec;
    },
    dir,
  };
}

test("starting a goal files it as running, due at start + duration", () => {
  const { tracker } = harness();
  const goal = tracker.start({ kind: "item", name: "Phosphorous Powder" }, 20, 3600);
  assert.ok(goal);
  assert.equal(goal!.dueAt, new Date(T0 + 3600_000).toISOString());
  const view = tracker.view();
  assert.equal(view.goals.length, 1);
  assert.equal(view.goals[0].state, "running");
});

test("start refuses a blank name or a non-positive qty/duration, and files nothing", () => {
  const { tracker } = harness();
  assert.equal(tracker.start({ kind: "item", name: "  " }, 20, 3600), null);
  assert.equal(tracker.start({ kind: "item", name: "Powder" }, 0, 3600), null);
  assert.equal(tracker.start({ kind: "item", name: "Powder" }, 20, 0), null);
  assert.equal(tracker.view().goals.length, 0);
});

test("a loot line credits every running item goal it matches, and only those", () => {
  const { tracker } = harness();
  tracker.start({ kind: "item", name: "Phosphorous Powder" }, 20, 3600);
  tracker.start({ kind: "item", name: "Rusty Dagger" }, 5, 3600);
  tracker.noteLoot(loot("Phosphorous Powder", 3, 10));
  const [powder, dagger] = tracker.view().goals.sort((a, b) => b.qty - a.qty);
  assert.equal(powder.obtained, 3);
  assert.equal(dagger.obtained, 0);
});

test("a kill credits a matching mob goal by one, regardless of a stack size that doesn't apply to kills", () => {
  const { tracker } = harness();
  tracker.start({ kind: "mob", name: "gnoll pup" }, 3, 3600);
  tracker.noteKill(kill("a gnoll pup", 1));
  tracker.noteKill(kill("a gnoll pup", 2));
  assert.equal(tracker.view().goals[0].obtained, 2);
});

test("a mob goal is plain text: typing just \"gnoll\" credits every gnoll variant, not only an exact name", () => {
  const { tracker } = harness();
  tracker.start({ kind: "mob", name: "gnoll" }, 5, 3600);
  tracker.noteKill(kill("a gnoll pup", 1));
  tracker.noteKill(kill("a gnoll pup guard", 2));
  tracker.noteKill(kill("an orc pawn", 3)); // no "gnoll" in it — must not count
  assert.equal(tracker.view().goals[0].obtained, 2);
});

test("an \"any\" goal is credited by every kill, needs no typed name, and files under a fixed label", () => {
  const { tracker } = harness();
  const goal = tracker.start({ kind: "any", name: "" }, 5, 3600);
  assert.ok(goal);
  assert.equal(goal!.target.name, "Any kill");
  tracker.noteKill(kill("a gnoll pup", 1));
  tracker.noteKill(kill("Lord Nagafen", 2));
  assert.equal(tracker.view().goals[0].obtained, 2);
});

test("milestones announce once each, lowest first, even when one line crosses two", () => {
  const { tracker, raised } = harness();
  tracker.start({ kind: "item", name: "Powder" }, 20, 3600);
  tracker.noteLoot(loot("Powder", 12, 10)); // 0 -> 12 of 20 (60%): crosses 25% and 50% at once, not 75%
  const kinds = raised.map((a) => a.goal?.kind);
  assert.deepEqual(kinds, ["milestone", "milestone"]);
  assert.deepEqual(
    raised.map((a) => a.goal?.pct),
    [25, 50],
  );
});

test("completion fires once, says done, and nothing further is credited or spoken afterward", () => {
  const { tracker, raised } = harness();
  tracker.start({ kind: "item", name: "Powder" }, 5, 3600);
  tracker.noteLoot(loot("Powder", 5, 10)); // exactly met
  assert.equal(raised.at(-1)?.goal?.kind, "completed");
  assert.equal(tracker.view().goals[0].state, "completed");
  raised.length = 0;
  tracker.noteLoot(loot("Powder", 5, 20)); // more of the same item, goal already finished
  assert.equal(raised.length, 0);
  assert.equal(tracker.view().goals[0].obtained, 5, "a finished goal doesn't keep counting");
});

test("a loot line arriving after the clock has already run out is not credited, even if the sweep hasn't caught up yet", () => {
  const { tracker, raised, advanceClock } = harness({ startSec: 0 });
  tracker.start({ kind: "item", name: "Powder" }, 20, 60);
  // The clock moves on, but the sweep interval is never invoked — a synchronous burst of replayed
  // log lines looks exactly like this to the tracker: real time has passed the due time, but
  // nothing has told this goal so yet.
  advanceClock(61);
  tracker.noteLoot(loot("Powder", 5, 61));
  const goal = tracker.view().goals[0];
  assert.equal(goal.obtained, 0, "a line that arrives after time is up must not still be credited");
  assert.equal(goal.state, "expired");
  assert.equal(raised.filter((a) => a.goal?.kind === "expired").length, 1, "resolved as expired exactly once");
  assert.equal(raised.some((a) => a.goal?.kind === "milestone" || a.goal?.kind === "completed"), false);
});

test("a goal left unmet at its due time expires exactly once, from the sweep", () => {
  const { tracker, raised, tick } = harness();
  tracker.start({ kind: "item", name: "Powder" }, 20, 60);
  tick(61);
  assert.equal(tracker.view().goals[0].state, "expired");
  assert.equal(raised.filter((a) => a.goal?.kind === "expired").length, 1);
  raised.length = 0;
  tick(62);
  assert.equal(raised.length, 0, "an already-expired goal doesn't expire twice");
});

test("a goal that ran out of time while the app was shut is shown but never bannered", () => {
  const dir = tempDir();
  {
    const first = harness({ dir, startSec: 0 });
    first.tracker.start({ kind: "item", name: "Powder" }, 20, 60);
    first.tracker.flush();
  }
  // Reopen far past the due time, as if the app had been closed for an hour.
  const second = harness({ dir, startSec: 3600 });
  assert.equal(second.tracker.view().goals[0].state, "expired");
  assert.equal(second.raised.length, 0, "no banner for something that happened while we were shut");
});

test("abandon drops a goal outright; clearFinished only drops finished ones", () => {
  const { tracker } = harness();
  const running = tracker.start({ kind: "item", name: "Running" }, 20, 3600)!;
  tracker.start({ kind: "item", name: "Done" }, 1, 3600);
  tracker.noteLoot(loot("Done", 1, 0));
  tracker.clearFinished();
  assert.deepEqual(
    tracker.view().goals.map((g) => g.target.name),
    ["Running"],
  );
  tracker.abandon(running.id);
  assert.equal(tracker.view().goals.length, 0);
});

test("a saved template can be started, edited independently, and deleted without touching a running goal", () => {
  const { tracker } = harness();
  tracker.saveTemplate({ kind: "item", name: "Powder" }, 20, 3600, "Powder run");
  const [template] = tracker.view().templates;
  assert.equal(template.label, "Powder run");
  const started = tracker.start(template.target, template.qty, template.durationSec)!;
  assert.equal(started.qty, 20);
  tracker.deleteTemplate(template.id);
  assert.equal(tracker.view().templates.length, 0);
  assert.equal(tracker.view().goals.length, 1, "deleting the template leaves the goal it started alone");
});

test("goals and templates persist across a restart", () => {
  const dir = tempDir();
  {
    const first = harness({ dir });
    first.tracker.start({ kind: "item", name: "Powder" }, 20, 3600);
    first.tracker.saveTemplate({ kind: "mob", name: "gnoll pup" }, 3, 1800, "Gnoll hunt");
    first.tracker.flush();
  }
  const second = harness({ dir });
  assert.equal(second.tracker.view().goals.length, 1);
  assert.equal(second.tracker.view().templates.length, 1);
});

test("starting a streak files it running, due at start + interval, with no streak yet", () => {
  const { tracker } = harness();
  const goal = tracker.startStreak({ kind: "mob", name: "gnoll pup" }, 10, false);
  assert.ok(goal);
  assert.equal(goal!.dueAt, new Date(T0 + 10_000).toISOString());
  assert.equal(goal!.obtained, 0);
  assert.equal(tracker.view().goals[0].state, "running");
});

test("startStreak refuses a blank name or a non-positive interval, and files nothing", () => {
  const { tracker } = harness();
  assert.equal(tracker.startStreak({ kind: "mob", name: " " }, 10, false), null);
  assert.equal(tracker.startStreak({ kind: "mob", name: "gnoll pup" }, 0, false), null);
  assert.equal(tracker.view().goals.length, 0);
});

test("a hit within the window extends the streak, tracks the best, and pushes the window out again", () => {
  const { tracker, tick } = harness();
  tracker.startStreak({ kind: "mob", name: "gnoll pup" }, 10, false);
  tick(4);
  tracker.noteKill(kill("a gnoll pup", 4));
  let goal = tracker.view().goals[0];
  assert.equal(goal.obtained, 1);
  assert.equal(goal.bestStreak, 1);
  assert.equal(goal.dueAt, new Date(T0 + 4000 + 10_000).toISOString());
  tick(8);
  tracker.noteKill(kill("a gnoll pup", 8));
  goal = tracker.view().goals[0];
  assert.equal(goal.obtained, 2);
  assert.equal(goal.bestStreak, 2);
});

test("a streak left unhit at its due time breaks exactly once, from the sweep, and finishes by default", () => {
  const { tracker, raised, tick } = harness();
  tracker.startStreak({ kind: "mob", name: "gnoll pup" }, 10, false);
  tracker.noteKill(kill("a gnoll pup", 1));
  tick(20);
  const goal = tracker.view().goals[0];
  assert.equal(goal.state, "expired");
  const broken = raised.filter((a) => a.goal?.kind === "streak-broken");
  assert.equal(broken.length, 1);
  assert.equal(broken[0].goal?.streak, 1);
  assert.equal(broken[0].goal?.bestStreak, 1);
  raised.length = 0;
  tick(21);
  assert.equal(raised.length, 0, "an already-broken streak doesn't break twice");
});

test("auto-restart resets the streak to 0 and keeps running instead of finishing", () => {
  const { tracker, raised, tick } = harness();
  tracker.startStreak({ kind: "mob", name: "gnoll pup" }, 10, true);
  tracker.noteKill(kill("a gnoll pup", 1));
  tracker.noteKill(kill("a gnoll pup", 5));
  tick(20);
  const goal = tracker.view().goals[0];
  assert.equal(goal.state, "running", "auto-restart never finishes on its own");
  assert.equal(goal.obtained, 0, "the live streak resets");
  assert.equal(goal.bestStreak, 2, "the best is kept across the reset");
  assert.equal(raised.filter((a) => a.goal?.kind === "streak-broken").length, 1);
});

test("a kill arriving after the window has already lapsed breaks it first, non-auto-restart doesn't also start counting it", () => {
  const { tracker, raised, advanceClock } = harness();
  tracker.startStreak({ kind: "mob", name: "gnoll pup" }, 10, false);
  // Mirrors the target-goal race: real time has passed the window, but nothing has told this goal
  // so yet (the sweep interval is never invoked).
  advanceClock(11);
  tracker.noteKill(kill("a gnoll pup", 11));
  const goal = tracker.view().goals[0];
  assert.equal(goal.state, "expired");
  assert.equal(goal.obtained, 0, "the late hit isn't credited to a goal that just finished");
  assert.equal(raised.filter((a) => a.goal?.kind === "streak-broken").length, 1);
});

test("a kill arriving after the window has lapsed on an auto-restart goal breaks it, then starts the next streak at 1", () => {
  const { tracker, advanceClock } = harness();
  tracker.startStreak({ kind: "mob", name: "gnoll pup" }, 10, true);
  advanceClock(11);
  tracker.noteKill(kill("a gnoll pup", 11));
  const goal = tracker.view().goals[0];
  assert.equal(goal.state, "running");
  assert.equal(goal.obtained, 1, "the hit that discovered the break also starts the next run");
  assert.equal(goal.dueAt, new Date(T0 + 11_000 + 10_000).toISOString());
});

test("a streak that broke while the app was shut is picked back up silently if auto-restart, finished silently otherwise", () => {
  const dir = tempDir();
  {
    const first = harness({ dir, startSec: 0 });
    first.tracker.startStreak({ kind: "mob", name: "gnoll pup" }, 10, false);
    first.tracker.startStreak({ kind: "item", name: "Loot" }, 10, true);
    first.tracker.flush();
  }
  const second = harness({ dir, startSec: 3600 });
  const [finished, restarted] = second.tracker.view().goals.sort((a, b) => Number(a.autoRestart) - Number(b.autoRestart));
  assert.equal(finished.state, "expired");
  assert.equal(restarted.state, "running", "auto-restart has nothing to finish, so it's simply picked back up");
  assert.equal(restarted.obtained, 0);
  assert.equal(second.raised.length, 0, "no banner for something that happened while we were shut");
});

test("a saved streak template can be started, and started templates don't touch each other", () => {
  const { tracker } = harness();
  tracker.saveStreakTemplate({ kind: "mob", name: "gnoll pup" }, 15, true, "Gnoll streak");
  const [template] = tracker.view().templates;
  assert.equal(template.label, "Gnoll streak");
  assert.equal(template.autoRestart, true);
  const started = tracker.startStreak(template.target, template.durationSec, template.autoRestart ?? false)!;
  assert.equal(started.durationSec, 15);
  assert.equal(started.autoRestart, true);
});

test("a file written before streaks existed (no mode field) is read as an ordinary target goal", () => {
  const dir = tempDir();
  fs.writeFileSync(
    path.join(dir, "goals.json"),
    JSON.stringify({
      goals: [
        {
          id: "g1",
          target: { kind: "item", name: "Powder" },
          qty: 20,
          obtained: 5,
          startedAt: new Date(T0).toISOString(),
          durationSec: 3600,
          dueAt: new Date(T0 + 3600_000).toISOString(),
          announcedMilestones: [],
          resultAnnounced: false,
        },
      ],
      templates: [],
    }),
  );
  const { tracker } = harness({ dir });
  assert.equal(tracker.view().goals[0].state, "running");
  tracker.noteLoot(loot("Powder", 1, 10));
  assert.equal(tracker.view().goals[0].obtained, 6, "an untagged goal still credits normally");
});

test("the overlay's own switch silences a goal alert the same way it silences every other kind", () => {
  const { tracker, raised } = harness({ settings: settings(false) });
  tracker.start({ kind: "item", name: "Powder" }, 5, 3600);
  tracker.noteLoot(loot("Powder", 5, 10));
  assert.equal(raised.length, 0);
});
