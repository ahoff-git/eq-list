/**
 * Black-box tests for the pure Norrath clock math: the 20:1 extrapolation, the day/night split, the
 * midnight-wrap crossing check an alarm's sweep relies on, and the loose "8pm" parser.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  advanceGameMinutes,
  crossedMinute,
  currentGameMinutes,
  DEFAULT_RATE,
  formatGameClock,
  impliedRate,
  isDaytime,
  learnRate,
  minuteDelta,
  parseGameClockTime,
  to24Hour,
  type GameClockAnchor,
} from "../../src/shared/game-clock";

test("to24Hour folds the 12-hour reading the log gives", () => {
  assert.equal(to24Hour(6, "PM"), 18);
  assert.equal(to24Hour(6, "AM"), 6);
  assert.equal(to24Hour(12, "AM"), 0); // midnight
  assert.equal(to24Hour(12, "PM"), 12); // noon
});

test("a reading anchors at the hour's midpoint, not its start (ADR 0187)", () => {
  const anchor: GameClockAnchor = { hour: 18, sampledAtMs: 0 }; // "6 PM"
  assert.equal(currentGameMinutes(anchor, 0), 18 * 60 + 30); // read as 6:30, not 6:00
});

test("the clock advances at the game's fixed pace: 1 real minute is 20 game minutes", () => {
  const anchor: GameClockAnchor = { hour: 18, sampledAtMs: 0 }; // "6 PM" → starts at 6:30
  // 3 real minutes = 1 game hour, so the clock should read 7:30.
  assert.equal(currentGameMinutes(anchor, 3 * 60_000), 19 * 60 + 30);
});

test("the clock wraps at midnight rather than running past it", () => {
  const anchor: GameClockAnchor = { hour: 23, sampledAtMs: 0 }; // "11 PM" → starts at 11:30
  // 6 real minutes = 2 game hours → 1:30 AM the next game day.
  assert.equal(currentGameMinutes(anchor, 6 * 60_000), 90);
});

test("advanceGameMinutes is the same math currentGameMinutes uses, exposed for a renderer's own tick", () => {
  const anchor: GameClockAnchor = { hour: 18, sampledAtMs: 1000 };
  const at = 1000 + 90_000; // 90 real seconds later
  assert.equal(currentGameMinutes(anchor, at), advanceGameMinutes(18 * 60 + 30, 90_000));
});

test("day is 6 AM to 6 PM, night the other half — the classic split", () => {
  assert.equal(isDaytime(6 * 60), true); // 6:00 AM
  assert.equal(isDaytime(17 * 60 + 59), true); // 5:59 PM
  assert.equal(isDaytime(18 * 60), false); // 6:00 PM
  assert.equal(isDaytime(5 * 60 + 59), false); // 5:59 AM
  assert.equal(isDaytime(0), false); // midnight
});

test("formatGameClock reads back in the game's own 12-hour idiom", () => {
  assert.equal(formatGameClock(0), "12:00 AM");
  assert.equal(formatGameClock(12 * 60), "12:00 PM");
  assert.equal(formatGameClock(18 * 60 + 5), "6:05 PM");
  assert.equal(formatGameClock(9 * 60), "9:00 AM");
});

test("parseGameClockTime reads what a player naturally types, and formatGameClock round-trips it", () => {
  for (const [typed, expectedMinutes] of [
    ["8pm", 20 * 60],
    ["8 PM", 20 * 60],
    ["8:30am", 8 * 60 + 30],
    ["20:00", 20 * 60],
    ["12am", 0],
    ["12pm", 12 * 60],
  ] as const) {
    assert.equal(parseGameClockTime(typed), expectedMinutes, typed);
  }
  assert.equal(formatGameClock(parseGameClockTime("8pm")!), "8:00 PM");
});

test("parseGameClockTime refuses what it can't read", () => {
  assert.equal(parseGameClockTime("nonsense"), null);
  assert.equal(parseGameClockTime("13pm"), null); // no such hour with am/pm
  assert.equal(parseGameClockTime("25:00"), null); // no such 24-hour hour
  assert.equal(parseGameClockTime("8:75am"), null); // no such minute
});

test("crossedMinute fires once for the instant an alarm's minute is passed", () => {
  assert.equal(crossedMinute(59, 61, 60), true);
  assert.equal(crossedMinute(60, 60, 60), false); // no movement — a level, not a crossing
  assert.equal(crossedMinute(61, 63, 60), false); // already past it before this tick
});

test("minuteDelta is the shortest signed gap, for comparing a guess against a fresh reading", () => {
  assert.equal(minuteDelta(18 * 60, 19 * 60), 60); // guessed 6, reported 7 — an hour low
  assert.equal(minuteDelta(19 * 60, 18 * 60), -60); // guessed 7, reported 6 — an hour high
  assert.equal(minuteDelta(0, 0), 0);
  // Wraps the short way across midnight rather than the long way around the day.
  assert.equal(minuteDelta(23 * 60 + 58, 2), 4);
  assert.equal(minuteDelta(2, 23 * 60 + 58), -4);
});

test("crossedMinute handles the wrap at midnight", () => {
  // 11:59 PM ticking to 12:01 AM should still fire a midnight (0) alarm.
  assert.equal(crossedMinute(1439, 1, 0), true);
  // ...but not an alarm for 6 PM, which this wrap never comes near.
  assert.equal(crossedMinute(1439, 1, 18 * 60), false);
});

test("impliedRate reads the real pace off two genuine log readings (ADR 0188)", () => {
  // [Thu Sep 03 18:34:02] Game Time: ... - 10 AM
  // [Thu Sep 03 18:48:21] Game Time: ... - 3 PM
  // 859 real seconds, 5 game-hours — the cleanest sample the log offered, and it lands almost
  // exactly on the documented 20:1 pace.
  const rate = impliedRate(DEFAULT_RATE, 10, 15, 859_000);
  assert.ok(rate !== null);
  assert.ok(Math.abs(rate! * 60_000 - 20.95) < 0.01, `expected ~20.95/min, got ${rate! * 60_000}`);
});

test("impliedRate resolves a day-wrap using the rate already trusted, not just the shortest hour gap", () => {
  // 8 AM to 9 AM, 40 real minutes later, read *literally* off the hours alone: 1 game-hour in 40
  // real minutes — an implausible near-standstill. But a prior rate of 40 game-min/real-min already
  // predicts ~1600 game-minutes should have passed, which is closest to a full game day (1440) plus
  // that same 60-minute hour-of-day gap — i.e. **a day rolled over**, not "the clock nearly stopped".
  const prior = 40 / 60_000;
  const implied = impliedRate(prior, 8, 9, 40 * 60_000);
  assert.ok(implied !== null);
  assert.ok(Math.abs(implied! * 60_000 - 37.5) < 0.01, `expected ~37.5/min, got ${implied! * 60_000}`);
});

test("impliedRate refuses a gap too short or too long to trust", () => {
  assert.equal(impliedRate(DEFAULT_RATE, 8, 9, 4_999), null); // just under the floor
  assert.equal(impliedRate(DEFAULT_RATE, 8, 9, 60 * 60_000 + 1), null); // just over the ceiling
  assert.ok(impliedRate(DEFAULT_RATE, 8, 9, 5_000) !== null); // right at the floor is fine
  assert.ok(impliedRate(DEFAULT_RATE, 8, 9, 60 * 60_000) !== null); // right at the ceiling is fine
});

test("impliedRate never reads an apparently-backwards clock as a rate", () => {
  // The same hour reported twice, with nowhere near enough elapsed time for a full lap of the day —
  // that's no signal at all, not a rate of zero.
  assert.equal(impliedRate(DEFAULT_RATE, 8, 8, 10_000), null);
});

test("learnRate nudges the pace toward a trustworthy pair, but not all the way to it", () => {
  const next = learnRate(DEFAULT_RATE, 10, 15, 859_000); // the real 10 AM → 3 PM pair, implying ~20.95
  assert.ok(next > DEFAULT_RATE, "should move toward the higher implied rate");
  assert.ok(next * 60_000 < 20.95, "but only partway — one reading never fully overrides the prior");
});

test("learnRate barely moves the pace for a gap right at the noise floor", () => {
  // The real case that prompted this: 8 AM → 9 AM in 15 real seconds, implying a wildly fast pace
  // (~240/min) that's actually just the truncated hour's own noise. It should nudge, not lurch.
  const next = learnRate(DEFAULT_RATE, 8, 9, 15_000);
  assert.ok(next > DEFAULT_RATE);
  assert.ok(next - DEFAULT_RATE < DEFAULT_RATE * 0.1, "under 10% movement from one noisy sample");
});

test("learnRate leaves the pace untouched when the gap teaches it nothing", () => {
  assert.equal(learnRate(DEFAULT_RATE, 8, 9, 2_000), DEFAULT_RATE); // too short
  assert.equal(learnRate(DEFAULT_RATE, 8, 9, 2 * 60 * 60_000), DEFAULT_RATE); // too long
  assert.equal(learnRate(DEFAULT_RATE, 8, 8, 10_000), DEFAULT_RATE); // no legitimate delta
});

test("learnRate pulls the pace back inside its bounds, even starting from outside them", () => {
  // A corrupted or otherwise implausible stored rate shouldn't compound — one more reading should
  // move it back toward sanity, never let it drift further.
  const next = learnRate(DEFAULT_RATE * 10, 10, 15, 859_000);
  assert.equal(next, DEFAULT_RATE * 4); // clamped at the ceiling
});
