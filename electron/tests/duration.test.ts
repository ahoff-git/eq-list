/**
 * Black-box tests for the one duration syntax and its two contracts (ADR 0135).
 *
 * The bug this module exists to have prevented is the reason for half of these: the spawn panel
 * parsed with the *alert cue's* parser, so a typed `4h` was refused as unreadable and a typed `240m`
 * became 30m without a word. What each caller accepts is therefore tested as a **contract** — the
 * units it takes and the ceiling it clamps at — rather than as one shared answer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatDuration, parseDuration } from "../../src/shared/duration";

const CUE = { units: ["s", "m"] as const, max: 30 * 60 };
const TIMER = { units: ["s", "m", "h", "d"] as const, max: 7 * 24 * 3600 };

const cue = (text?: string) => parseDuration(text, { units: [...CUE.units], max: CUE.max });
const timer = (text?: string) => parseDuration(text, { units: [...TIMER.units], max: TIMER.max });

// ── the syntax, which is the same for everyone ────────────────────────────────

test("a bare number is seconds, and a unit says otherwise", () => {
  assert.equal(timer("25"), 25);
  assert.equal(timer("25s"), 25);
  assert.equal(timer("8m"), 480);
  assert.equal(timer("4h"), 4 * 3600);
  assert.equal(timer("3d"), 3 * 86400);
  assert.equal(timer("1.5m"), 90);
});

test("compound parts add up, spaced or not", () => {
  assert.equal(timer("1m30s"), 90);
  assert.equal(timer("1m 30s"), 90);
  assert.equal(timer("3d 4h 22m"), 3 * 86400 + 4 * 3600 + 22 * 60);
  assert.equal(timer(" 8 M "), 480);
});

test("blank is nothing to wait for, and unreadable text is refused rather than guessed at", () => {
  assert.equal(timer(""), 0);
  assert.equal(timer("   "), 0);
  assert.equal(timer(undefined), 0);
  assert.equal(timer("soon"), null);
  assert.equal(timer("8 minutes"), null, "a sentence is not eight minutes with a comment after it");
  assert.equal(timer("-5"), null);
  assert.equal(timer("1m x"), null);
  assert.equal(timer("4y"), null, "a unit nobody defined");
});

// ── the contracts, which differ ───────────────────────────────────────────────

test("a unit outside the caller's set is unreadable, not converted", () => {
  // The point of refusing rather than clamping: a cue that can't wait four hours must say so, not
  // quietly agree to something the player didn't type.
  assert.equal(cue("5h"), null);
  assert.equal(cue("2d"), null);
  assert.equal(timer("5h"), 5 * 3600);
});

test("too long is clamped, because the number was still meant", () => {
  assert.equal(cue("45m"), CUE.max);
  assert.equal(cue("99999"), CUE.max);
  assert.equal(cue("30m"), CUE.max, "the cap itself is allowed");
  assert.equal(timer("45m"), 45 * 60, "the timer's ceiling is nowhere near");
  assert.equal(timer("30d"), TIMER.max);
});

// ── and back again ────────────────────────────────────────────────────────────

test("what it prints can be typed straight back in", () => {
  for (const seconds of [45, 90, 480, 3600, 6 * 3600 + 30 * 60, 3 * 86400 + 4 * 3600 + 22 * 60]) {
    assert.equal(timer(formatDuration(seconds)), seconds, `round trip of ${seconds}s`);
  }
});

test("printing omits the parts that are zero, and says nothing about nothing", () => {
  assert.equal(formatDuration(0), "");
  assert.equal(formatDuration(-5), "");
  assert.equal(formatDuration(45), "45s");
  assert.equal(formatDuration(90), "1m 30s");
  assert.equal(formatDuration(3600), "1h");
  assert.equal(formatDuration(86400 + 60), "1d 1m");
});
