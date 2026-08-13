/**
 * Black-box tests for the window of recent log lines — the buffer a rule is replayed against.
 *
 * Small, but two things about it are load-bearing: it must **keep the newest** rather than the
 * first (a rule is tested against what just happened), and it must not get slower as the evening
 * goes on, since every line of a busy raid passes through it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecentLines } from "../recent-lines";
import type { LogLine } from "../../src/shared/types";

const line = (n: number): LogLine => ({ logId: n, at: "2026-07-29T21:00:00", message: `line ${n}`, raw: `line ${n}` });

test("it hands back what it was given, oldest first", () => {
  const recent = createRecentLines(10);
  [1, 2, 3].forEach((n) => recent.add(line(n)));
  assert.deepEqual(recent.all().map((l) => l.logId), [1, 2, 3]);
  assert.equal(recent.size(), 3);
});

test("past the cap it keeps the newest lines, which are the ones a rule is about", () => {
  const recent = createRecentLines(5);
  for (let n = 1; n <= 100; n++) recent.add(line(n));
  const kept = recent.all();
  assert.equal(kept.length, 5);
  assert.deepEqual(kept.map((l) => l.logId), [96, 97, 98, 99, 100]);
  assert.equal(recent.size(), 5);
});

test("a caller can ask for fewer than the whole window", () => {
  const recent = createRecentLines(10);
  for (let n = 1; n <= 10; n++) recent.add(line(n));
  assert.deepEqual(recent.all(3).map((l) => l.logId), [8, 9, 10]);
});

test("clearing empties it", () => {
  const recent = createRecentLines(5);
  recent.add(line(1));
  recent.clear();
  assert.deepEqual(recent.all(), []);
  assert.equal(recent.size(), 0);
});

test("a whole evening of lines stays cheap", () => {
  // The trim is in blocks rather than per line: a shift per line, at a few thousand lines a minute,
  // is the sort of cost a debugging aid must not add to the watcher's poll.
  const recent = createRecentLines(2000);
  const started = process.hrtime.bigint();
  for (let n = 0; n < 200_000; n++) recent.add(line(n));
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.equal(recent.all().length, 2000);
  assert.ok(ms < 1000, `200k lines took ${Math.round(ms)}ms`);
});
