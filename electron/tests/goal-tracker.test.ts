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

test("the overlay's own switch silences a goal alert the same way it silences every other kind", () => {
  const { tracker, raised } = harness({ settings: settings(false) });
  tracker.start({ kind: "item", name: "Powder" }, 5, 3600);
  tracker.noteLoot(loot("Powder", 5, 10));
  assert.equal(raised.length, 0);
});
