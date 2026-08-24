/**
 * Black-box tests for the log's own clock. The wall clock is a parameter, so these are exact —
 * no sleeps, no fake timers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLogClock } from "../../src/shared/log-clock";

/** A log timestamp in the shape `splitLine` produces — local, no zone. */
const stamp = "2026-07-29T21:00:00";
const at = Date.parse(stamp);

/** A settable wall clock, so "three seconds passed" is a statement rather than a wait. */
function fakeClock(start = 1_000_000) {
  let now = start;
  return { now: () => now, pass: (ms: number) => void (now += ms) };
}

test("with no line seen there is no clock, which every caller reads as 'no idea'", () => {
  const wall = fakeClock();
  const clock = createLogClock(wall.now);
  assert.equal(clock.now(), 0);
  wall.pass(60_000);
  assert.equal(clock.now(), 0);
});

test("the clock is the last line's stamp plus however long ago it arrived", () => {
  const wall = fakeClock();
  const clock = createLogClock(wall.now);
  clock.note(stamp);
  assert.equal(clock.now(), at);
  wall.pass(12_000);
  assert.equal(clock.now(), at + 12_000);
});

test("a replay's old timestamps keep the clock anchored to the replay, not to the wall", () => {
  // The point of the thing: `scripts/replay-log.mjs --relative` writes an evening in seconds, and
  // the app must read the *log's* gaps. An hour-old line means the log's clock is an hour ago.
  const wall = fakeClock();
  const clock = createLogClock(wall.now);
  clock.note(stamp);
  wall.pass(1000);
  clock.note("2026-07-29T21:00:30"); // 30s later in the log…
  // …so the clock jumped 30 log-seconds, not the one wall-second it took to write both lines.
  assert.equal(clock.now() - at, 30_000);
});

test("re-reading an older line doesn't wind the clock back", () => {
  // The watcher re-reads a log's tail to recover the zone before following it, so older lines do
  // arrive after newer ones.
  const wall = fakeClock();
  const clock = createLogClock(wall.now);
  clock.note(stamp);
  clock.note("2026-07-29T20:50:00");
  assert.equal(clock.now(), at);
});

test("an unreadable stamp is ignored rather than resetting the clock", () => {
  const wall = fakeClock();
  const clock = createLogClock(wall.now);
  clock.note(stamp);
  clock.note("");
  clock.note("not a timestamp");
  assert.equal(clock.now(), at);
});
