/**
 * Black-box tests for the alert *schedule*: reading the delay a watch was given, and deciding
 * whether the cue it makes is one your death should call off.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alertCue,
  COMBAT_CUE_WITHIN_SECONDS,
  formatDelay,
  MAX_DELAY_SECONDS,
  MAX_REPEAT,
  parseDelay,
} from "../../src/shared/alert-schedule";

// ── the syntax ─────────────────────────────────────────────────────────────────
// A bare number is seconds, because the common cue ("recast that") is seconds long. `m` is the
// one abbreviation, because the other common cue (a respawn) is minutes long.

test("a bare number is seconds, and `m` is minutes", () => {
  assert.equal(parseDelay("25"), 25);
  assert.equal(parseDelay("25s"), 25);
  assert.equal(parseDelay("8m"), 480);
  assert.equal(parseDelay("1.5m"), 90);
});

test("spacing and case don't matter, since the field is typed in a hurry", () => {
  assert.equal(parseDelay(" 8 M "), 480);
  assert.equal(parseDelay("30 s"), 30);
});

test("nothing typed means fire now — which is every watch until one says otherwise", () => {
  assert.equal(parseDelay(""), 0);
  assert.equal(parseDelay("   "), 0);
  assert.equal(parseDelay(undefined), 0);
  assert.equal(parseDelay(null), 0);
  assert.equal(parseDelay("0"), 0);
});

test("text we can't read is null, not a guess", () => {
  // The field is flagged where it was typed; the scheduler treats null as "now" on purpose.
  assert.equal(parseDelay("soon"), null);
  assert.equal(parseDelay("8 minutes"), null);
  assert.equal(parseDelay("-5"), null);
  assert.equal(parseDelay("5h"), null);
  assert.equal(parseDelay("1m x"), null);
});

test("a compound delay adds up, so what formatDelay prints can be typed back in", () => {
  assert.equal(parseDelay("1m30s"), 90);
  assert.equal(parseDelay("1m 30s"), 90);
  assert.equal(parseDelay(formatDelay(90)), 90);
  assert.equal(parseDelay(formatDelay(480)), 480);
  assert.equal(parseDelay(formatDelay(45)), 45);
});

test("a delay longer than the cap is clamped, never turned into an immediate alert", () => {
  assert.equal(parseDelay("45m"), MAX_DELAY_SECONDS);
  assert.equal(parseDelay("99999"), MAX_DELAY_SECONDS);
  assert.equal(parseDelay("30m"), MAX_DELAY_SECONDS); // the cap itself is allowed
});

test("seconds are whole, since a cue is not a stopwatch", () => {
  assert.equal(parseDelay("2.4"), 2);
  assert.equal(parseDelay("2.6"), 3);
});

test("formatDelay says the shortest true thing", () => {
  assert.equal(formatDelay(0), "");
  assert.equal(formatDelay(-5), "");
  assert.equal(formatDelay(45), "45s");
  assert.equal(formatDelay(60), "1m");
  assert.equal(formatDelay(480), "8m");
  assert.equal(formatDelay(90), "1m 30s");
});

// ── what the cue is ────────────────────────────────────────────────────────────

test("no delay is an immediate alert with nothing to cancel", () => {
  for (const w of [{}, { delay: "" }]) {
    const cue = alertCue(w);
    assert.equal(cue.delayMs, 0);
    assert.equal(cue.cancelOnDeath, false);
    assert.equal(cue.repeat, 0);
  }
});

test("an unreadable delay alerts immediately — a missed alert is the worse failure", () => {
  assert.equal(alertCue({ delay: "whenever" }).delayMs, 0);
});

test("a short cue is about the fight you're in, so dying calls it off", () => {
  // "Recast the mez" is noise from a corpse.
  assert.equal(alertCue({ delay: "25" }).cancelOnDeath, true);
  assert.equal(alertCue({ delay: `${COMBAT_CUE_WITHIN_SECONDS}` }).cancelOnDeath, true);
  assert.equal(alertCue({ delay: "25" }).delayMs, 25_000);
});

test("a long cue outlives your death, because dying doesn't move a spawn", () => {
  assert.equal(alertCue({ delay: `${COMBAT_CUE_WITHIN_SECONDS + 1}` }).cancelOnDeath, false);
  assert.equal(alertCue({ delay: "8m" }).cancelOnDeath, false);
});

// ── saying so outright ─────────────────────────────────────────────────────────
// The length rule is a good guess and sometimes the wrong one: a 10-second "the port lands now"
// isn't about the fight, and a 5-minute mez in a raid is.

test("a watch can override the death rule in either direction", () => {
  assert.equal(alertCue({ delay: "25", cancelOnDeath: "never" }).cancelOnDeath, false);
  assert.equal(alertCue({ delay: "8m", cancelOnDeath: "always" }).cancelOnDeath, true);
  // `auto` is what unset already meant, said out loud.
  assert.equal(alertCue({ delay: "25", cancelOnDeath: "auto" }).cancelOnDeath, true);
});

test("with no delay there is nothing to cancel, whatever the watch asked for", () => {
  assert.equal(alertCue({ cancelOnDeath: "always" }).cancelOnDeath, false);
});

// ── repeats, and refusing the unstoppable one ──────────────────────────────────

const stopper = [{ field: "line" as const, op: "contains" as const, text: "is dead" }];

test("a repeat needs something able to end it", () => {
  // Nothing can stop this one: a long cue (so no death rule) with no cancelling words.
  assert.equal(alertCue({ delay: "8m", repeat: 5 }).repeat, 0);
  // Either kind of brake is enough.
  assert.equal(alertCue({ delay: "8m", repeat: 5, cancelWhen: stopper }).repeat, 5);
  assert.equal(alertCue({ delay: "8m", repeat: 5, cancelOnDeath: "always" }).repeat, 5);
  assert.equal(alertCue({ delay: "25", repeat: 5 }).repeat, 5); // short: dies with you already
});

test("a repeat is bounded, whole, and never negative", () => {
  assert.equal(alertCue({ delay: "25", repeat: 999 }).repeat, MAX_REPEAT);
  assert.equal(alertCue({ delay: "25", repeat: -3 }).repeat, 0);
  assert.equal(alertCue({ delay: "25", repeat: 2.7 }).repeat, 2);
});

test("a repeat means nothing without a wait", () => {
  assert.equal(alertCue({ repeat: 5, cancelWhen: stopper }).repeat, 0);
});

test("an inverted cancel is no brake at all, so it can't licence a repeat", () => {
  // "cancel when the line *doesn't* say X" would end the cue on the very next line, so the queue
  // refuses it — and the count of what can stop a cue has to agree with the queue, not the UI.
  const inverted = [{ field: "line" as const, op: "contains" as const, text: "is dead", exclude: true }];
  assert.equal(alertCue({ delay: "8m", repeat: 5, cancelWhen: inverted }).repeat, 0);
  assert.equal(alertCue({ delay: "8m", cancelWhen: inverted }).stoppable, false);
});

test("retrigger defaults to restarting — a re-mez means the old countdown is wrong", () => {
  assert.equal(alertCue({ delay: "25" }).retrigger, "restart");
  assert.equal(alertCue({ delay: "8m", retrigger: "queue" }).retrigger, "queue");
});
