/**
 * Tests for the holder: a `/time` reading sets the clock, alarms fire once per crossing rather than
 * once per sweep, and nothing here alerts about a game day the clock already passed through while the
 * app was shut — the same rule `spawn-tracker.ts` holds for a due timer found already overdue.
 *
 * The clock and the sweep are both injected, so hours of game time are exercised in a millisecond.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createGameClockTracker, type GameClockTracker } from "../game-clock-tracker";
import { advanceGameMinutes, DEFAULT_RATE } from "../../src/shared/game-clock";
import type { CastAlertEvent, CastAlertSettings } from "../../src/shared/types";

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "eql-gameclock-"));
const T0 = Date.parse("2026-08-17T12:00:00.000Z");

const settings = (enabled = true) => ({ enabled, color: "#e5534b", position: "top", styles: [] }) as unknown as CastAlertSettings;

interface Harness {
  tracker: GameClockTracker;
  raised: CastAlertEvent[];
  /** Move the wall clock and run the sweep the interval would have run. */
  tick(toMs: number): void;
}

function harness(options: { dir?: string; startMs?: number; settings?: CastAlertSettings } = {}): Harness {
  const raised: CastAlertEvent[] = [];
  let nowMs = options.startMs ?? 0;
  let sweep: (() => void) | null = null;
  const tracker = createGameClockTracker({
    userDataDir: options.dir ?? tempDir(),
    getSettings: () => options.settings ?? settings(),
    raise: (a) => raised.push(a),
    now: () => T0 + nowMs,
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
    tick(toMs) {
      nowMs = toMs;
      sweep?.();
    },
  };
}

test("a /time reading sets the clock, extrapolated forward from there", () => {
  const { tracker } = harness();
  tracker.noteReading(18, T0); // 6 PM
  // Anchored at the hour's midpoint, not its start (ADR 0187) — "6 PM" reads as 6:30.
  assert.equal(tracker.view().minutes, 18 * 60 + 30);
  assert.equal(tracker.view().daytime, false);
});

test("with no reading yet, the clock is unknown rather than midnight", () => {
  const { tracker } = harness();
  const view = tracker.view();
  assert.equal(view.minutes, null);
  assert.equal(view.daytime, null);
});

test("an alarm fires once, at the moment the clock crosses it", () => {
  const h = harness();
  h.tracker.noteReading(18, T0); // "6 PM" — anchored at 6:30 (ADR 0187), game-minute 1110
  h.tracker.add(19 * 60, "check the auction"); // 7 PM, game-minute 1140 — 30 game-minutes away
  // 1 game-minute is 3 real seconds, so 30 of them is 90 real seconds (90_000 ms).
  h.tick(89_000); // just short of it
  assert.equal(h.raised.length, 0);
  h.tick(91_000); // just past it
  assert.equal(h.raised.length, 1);
  assert.equal(h.raised[0].message, "check the auction");
  // Sweeping again without the clock moving past it again must not re-fire.
  h.tick(92_000);
  assert.equal(h.raised.length, 1);
});

test("an alarm with no message speaks the time itself", () => {
  const h = harness();
  h.tracker.noteReading(18, T0);
  h.tracker.add(19 * 60);
  h.tick(95_000);
  assert.match(h.raised[0].message ?? "", /7:00 PM/);
});

test("a disabled alarm never fires", () => {
  const h = harness();
  h.tracker.noteReading(18, T0);
  const id = h.tracker.add(19 * 60);
  h.tracker.toggle(id, false);
  h.tick(95_000);
  assert.equal(h.raised.length, 0);
});

test("restoring an existing reading never alerts about a game day already passed", () => {
  // A restart is not the moment an alarm the game day already went past should speak — the same
  // "never alert about the past" rule `spawn-tracker.ts` applies to an overdue timer.
  const dir = tempDir();
  const first = harness({ dir });
  first.tracker.noteReading(18, T0); // 6 PM
  first.tracker.add(19 * 60); // 7 PM — already behind by the time the next run starts
  first.tracker.flush();

  // A fresh process, well past 7 PM in real time — the alarm's moment has already gone by.
  const second = harness({ dir, startMs: 10 * 60_000 });
  second.tick(10 * 60_000 + 1000);
  assert.equal(second.raised.length, 0);
});

test("alerts respect the enabled switch on cast-alert settings, same as every other alert", () => {
  const h = harness({ settings: settings(false) });
  h.tracker.noteReading(18, T0);
  h.tracker.add(19 * 60);
  h.tick(95_000);
  assert.equal(h.raised.length, 0);
});

test("update changes the time and message without changing the alarm's id", () => {
  const h = harness();
  h.tracker.noteReading(0, T0); // midnight
  const id = h.tracker.add(60, "one");
  h.tracker.update(id, 120, "two");
  const alarm = h.tracker.view().alarms.find((a) => a.id === id);
  assert.equal(alarm?.minute, 120);
  assert.equal(alarm?.message, "two");
});

test("a second reading replaces the anchor outright, whatever the running guess said", () => {
  // The debug comparison this logs (guess vs. the fresh reading) is for a real evening to read, not
  // an assertion here — what a test can pin is that the reading itself always wins.
  const h = harness();
  h.tracker.noteReading(18, T0); // 6 PM
  h.tick(90_000); // clock has since ticked forward on its own
  h.tracker.noteReading(20, T0 + 90_000); // /time now says 8 PM, wherever our guess had drifted to
  assert.equal(h.tracker.view().minutes, 20 * 60 + 30); // anchored at 8:30, per ADR 0187
});

test("the view starts at the documented default pace before any pair of readings can inform it", () => {
  const h = harness();
  h.tracker.noteReading(18, T0); // one reading alone teaches nothing — nothing to compare it against
  assert.equal(h.tracker.view().rate, DEFAULT_RATE);
});

test("a fresh reading with a real gap nudges the learned pace, live (ADR 0188)", () => {
  const h = harness();
  h.tracker.noteReading(10, T0); // the real 10 AM → 3 PM pair from the log that prompted this
  h.tick(859_000);
  h.tracker.noteReading(15, T0 + 859_000);
  const { rate } = h.tracker.view();
  assert.ok(rate > DEFAULT_RATE, "should have nudged faster, toward the ~20.95/min this pair implies");
  assert.ok(rate * 60_000 < 20.95, "but only partway — one reading never fully overrides the prior");
});

test("the learned pace actually drives the clock, not just sits in the view", () => {
  const h = harness();
  h.tracker.noteReading(10, T0);
  h.tick(859_000);
  h.tracker.noteReading(15, T0 + 859_000);
  const { rate } = h.tracker.view();
  assert.notEqual(rate, DEFAULT_RATE);
  h.tick(859_000 + 60_000); // one more real minute
  assert.equal(h.tracker.view().minutes, advanceGameMinutes(15 * 60 + 30, 60_000, rate));
});

test("a pair too short or too long to trust never moves the pace", () => {
  const h = harness();
  h.tracker.noteReading(8, T0);
  h.tick(15_000); // the real 8 AM → 9 AM-in-15-seconds fluke that started this whole investigation
  h.tracker.noteReading(9, T0 + 15_000);
  // Still nudges a hair (learnRate's floor weight isn't literally zero) — the claim worth pinning is
  // that it stays close, not that a single noisy sample is ignored outright.
  assert.ok(Math.abs(h.tracker.view().rate - DEFAULT_RATE) < DEFAULT_RATE * 0.1);
});

test("the learned pace survives a restart, the same as the anchor and the alarms do", () => {
  const dir = tempDir();
  const first = harness({ dir });
  first.tracker.noteReading(10, T0);
  first.tick(859_000);
  first.tracker.noteReading(15, T0 + 859_000);
  const learned = first.tracker.view().rate;
  assert.notEqual(learned, DEFAULT_RATE);
  first.tracker.flush();

  const second = harness({ dir, startMs: 859_000 });
  assert.equal(second.tracker.view().rate, learned);
});

test("reading() hands back exactly what a /time line last said, for sharing with peers", () => {
  const h = harness();
  assert.equal(h.tracker.reading(), null, "nothing to share before any /time has been read");
  h.tracker.noteReading(18, T0);
  assert.deepEqual(h.tracker.reading(), { hour: 18, at: new Date(T0).toISOString() });
});

test("a peer's reading is applied when it's newer than what we have (ADR 0189)", () => {
  const h = harness();
  h.tracker.noteReading(18, T0); // our own 6 PM
  h.tracker.notePeerReading(19, T0 + 60_000); // a peer's 7 PM, a minute later — genuinely newer
  assert.equal(h.tracker.reading()?.hour, 19);
});

test("a peer's reading older than or equal to ours teaches us nothing", () => {
  const h = harness();
  h.tracker.noteReading(18, T0);
  h.tracker.notePeerReading(17, T0 - 60_000); // older
  assert.equal(h.tracker.reading()?.hour, 18);
  h.tracker.notePeerReading(20, T0); // same instant — not strictly newer
  assert.equal(h.tracker.reading()?.hour, 18);
});

test("a peer can seed the clock before we've ever read a /time line ourselves", () => {
  const h = harness();
  h.tracker.notePeerReading(9, T0);
  assert.equal(h.tracker.view().minutes, 9 * 60 + 30);
});

test("a peer's reading still learns the pace, exactly as our own would", () => {
  const h = harness();
  h.tracker.noteReading(10, T0);
  h.tick(859_000);
  h.tracker.notePeerReading(15, T0 + 859_000); // the real 10 AM → 3 PM pair, from a peer this time
  assert.ok(h.tracker.view().rate > DEFAULT_RATE);
});

test("remove takes the alarm off the board", () => {
  const h = harness();
  h.tracker.noteReading(18, T0);
  const id = h.tracker.add(19 * 60);
  h.tracker.remove(id);
  h.tick(181_000);
  assert.equal(h.raised.length, 0);
  assert.equal(h.tracker.view().alarms.length, 0);
});
