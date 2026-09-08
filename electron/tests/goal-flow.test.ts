/**
 * End-to-end tests for the goal **flow**: raw log text in, a board out — the same shape as
 * `spawn-flow.test.ts` and for the same reason. `goal-progress.test.ts` pins the rules and
 * `goal-tracker.test.ts` pins the holder, both by calling it directly; this instead starts where the
 * app starts — a string of log lines — and runs them through the real
 * `splitLine` → `parseSplitLine` → `tracker.noteLoot`/`noteKill` path `main.ts` does, which is where a
 * mismatch between how the parser spells a name and how the tracker matches one would actually show up.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { splitLine } from "../../src/shared/log-parser";
import { parseSplitLine } from "../../src/shared/parse-line";
import { createGoalTracker, type GoalTracker } from "../goal-tracker";
import type { CastAlertEvent, CastAlertSettings } from "../../src/shared/types";

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "eql-goal-flow-"));

/** EQ's own timestamp format, which is what the parser has to read. */
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

function stamp(atMs: number): string {
  const d = new Date(atMs);
  return `[${DOW[d.getDay()]} ${MON[d.getMonth()]} ${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getFullYear()}]`;
}

const looted = (atMs: number, item: string, qty?: number) =>
  `${stamp(atMs)} --You have looted ${qty ? `${qty} ` : "a "}${item} from an orc's corpse.--`;
const slain = (atMs: number, mob: string) => `${stamp(atMs)} You have slain ${mob}!`;

/** The app, as far as this feature is concerned: a goal tracker, a clock under our control, and the
 *  main-loop wiring that decides which parsed events reach it. */
function app(startMs: number) {
  const dir = tempDir();
  const raised: CastAlertEvent[] = [];
  let nowMs = startMs;
  let sweep: (() => void) | null = null;
  const tracker: GoalTracker = createGoalTracker({
    userDataDir: dir,
    getSettings: () => ({ enabled: true }) as CastAlertSettings,
    raise: (a) => raised.push(a),
    now: () => nowMs,
    setInterval: (fn) => {
      sweep = fn;
      return 1;
    },
    clearInterval: () => {
      sweep = null;
    },
  });

  function feed(text: string): void {
    let logId = 1;
    for (const raw of text.split("\n")) {
      const line = splitLine(raw, logId);
      if (!line) continue;
      logId += 1;
      const at = Date.parse(line.at);
      if (!Number.isNaN(at)) nowMs = at;
      const event = parseSplitLine(line);
      if (!event) continue;
      if (event.kind === "loot") tracker.noteLoot(event);
      // Stands in for `combat.countsKill`: main only ever tells the goal tracker about a kill it has
      // already decided is yours, and every fixture kill below is a plain "You have slain X!" one.
      if (event.kind === "kill" && event.killer === "You") tracker.noteKill(event);
    }
  }

  return {
    tracker,
    raised,
    feed,
    tick(ms: number) {
      nowMs = ms;
      sweep?.();
    },
    view: () => tracker.view(),
  };
}

const T0 = Date.parse("2026-08-17T19:00:00");
const MIN = 60_000;

test("flow: a farming session credits real loot lines for the item it's watching, and nothing else", () => {
  const a = app(T0);
  a.tracker.start({ kind: "item", name: "Phosphorous Powder" }, 20, 3600);
  a.feed(
    [looted(T0 + 1 * MIN, "Phosphorous Powder"), looted(T0 + 2 * MIN, "Rusty Dagger"), looted(T0 + 3 * MIN, "Phosphorous Powder", 2)].join(
      "\n",
    ),
  );
  assert.equal(a.view().goals[0].obtained, 3);
});

test("flow: a kill quota credits real kill lines for the mob it's watching", () => {
  const a = app(T0);
  a.tracker.start({ kind: "mob", name: "gnoll pup" }, 2, 3600);
  a.feed([slain(T0 + 1 * MIN, "a gnoll pup"), slain(T0 + 2 * MIN, "an orc pawn"), slain(T0 + 3 * MIN, "a gnoll pup")].join("\n"));
  const goal = a.view().goals[0];
  assert.equal(goal.obtained, 2);
  assert.equal(goal.state, "completed");
  assert.equal(a.raised.at(-1)?.goal?.kind, "completed");
});

test("flow: a session that never gets there expires from the sweep, once", () => {
  const a = app(T0);
  a.tracker.start({ kind: "item", name: "Phosphorous Powder" }, 20, 60);
  a.feed(looted(T0 + 10_000, "Phosphorous Powder"));
  a.tick(T0 + 120_000);
  assert.equal(a.view().goals[0].state, "expired");
  assert.equal(a.raised.filter((r) => r.goal?.kind === "expired").length, 1);
});

test("flow: real loot text drives a milestone banner mid-session", () => {
  const a = app(T0);
  a.tracker.start({ kind: "item", name: "Phosphorous Powder" }, 4, 3600);
  a.feed([looted(T0 + 1 * MIN, "Phosphorous Powder"), looted(T0 + 2 * MIN, "Phosphorous Powder")].join("\n"));
  assert.equal(a.raised.at(-1)?.goal?.kind, "milestone");
  assert.equal(a.raised.at(-1)?.goal?.pct, 50);
});
