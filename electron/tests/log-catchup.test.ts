/**
 * Black-box tests for recovering "where am I" from a log's tail.
 *
 * The watcher anchors at the end of an existing log and replays nothing (ADR 0030), which left an
 * app started mid-session not knowing its zone. Only two lines carry *state* rather than news, and
 * the rule that matters is which position is still true after a zone change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { catchUpState, isSameSitting, SAME_SITTING_MS } from "../../src/shared/log-catchup";
import { splitLine } from "../../src/shared/log-parser";

/** Real log lines in, parsed lines out — the shape the watcher hands over. */
const lines = (...raw: string[]) => raw.flatMap((r) => splitLine(r) ?? []);
const at = (time: string) => `[Wed Jul 29 ${time} 2026] `;

test("the last zone entered is the zone you're in", () => {
  const state = catchUpState(
    lines(
      `${at("00:10:00")}You have entered Greater Faydark.`,
      `${at("00:20:00")}You have entered Clan Crushbone.`,
    ),
  );
  assert.equal(state.zone?.zone, "Clan Crushbone");
});

test("a position after the last zone line is kept", () => {
  const state = catchUpState(
    lines(
      `${at("00:10:00")}You have entered Clan Crushbone.`,
      `${at("00:12:00")}Your Location is 400.00, -300.00, 15.00`,
    ),
  );
  assert.equal(state.zone?.zone, "Clan Crushbone");
  assert.deepEqual([state.loc?.y, state.loc?.x, state.loc?.z], [400, -300, 15]);
});

test("a position from the zone you left is discarded", () => {
  // Keeping it would plot yesterday's spot on today's map, which is worse than no dot at all.
  const state = catchUpState(
    lines(
      `${at("00:10:00")}You have entered Greater Faydark.`,
      `${at("00:11:00")}Your Location is 400.00, -300.00, 15.00`,
      `${at("00:20:00")}You have entered Clan Crushbone.`,
    ),
  );
  assert.equal(state.zone?.zone, "Clan Crushbone");
  assert.equal(state.loc, undefined);
});

test("a position with no zone line before it is kept", () => {
  // A long camp in one zone: the tail reaches back past the `/loc` but not past the zoning, so the
  // fix is for wherever we already are.
  const state = catchUpState(lines(`${at("00:11:00")}Your Location is 12.00, 34.00, 5.00`));
  assert.equal(state.zone, undefined);
  assert.deepEqual([state.loc?.y, state.loc?.x], [12, 34]);
});

test("the newest position wins", () => {
  const state = catchUpState(
    lines(
      `${at("00:11:00")}Your Location is 1.00, 1.00, 0.00`,
      `${at("00:12:00")}Your Location is 2.00, 2.00, 0.00`,
    ),
  );
  assert.deepEqual([state.loc?.y, state.loc?.x], [2, 2]);
});

test("nothing else in the log is state", () => {
  // Everything here is history — recovering any of it would re-record kills, re-count experience
  // and fire alerts for fights that ended hours ago (ADR 0030).
  const state = catchUpState(
    lines(
      `${at("00:10:00")}You have slain a gnoll pup!`,
      `${at("00:10:01")}--You have looted a Bone Chips.--`,
      `${at("00:10:02")}You gain experience!!`,
      `${at("00:10:03")}a gnoll pup begins casting Fear.`,
      `${at("00:10:04")}Welcome to level 12!`,
    ),
  );
  assert.deepEqual(state, {});
});

test("an empty or unparseable tail recovers nothing", () => {
  assert.deepEqual(catchUpState([]), {});
  assert.deepEqual(catchUpState(lines("", "not a log line at all", "[garbled")), {});
});

test("a gap you restarted through is the same sitting; one you slept through isn't", () => {
  // This is the only thing that decides whether the live meter keeps its totals across a restart,
  // so both directions matter: a quick restart must not zero the panel, and last night's fights
  // must not be counted into today's rates.
  const now = new Date("2026-07-29T21:00:00").getTime();
  const ago = (ms: number) => new Date(now - ms).toISOString();

  assert.equal(isSameSitting(ago(10_000), now), true, "a ten-second restart");
  assert.equal(isSameSitting(ago(SAME_SITTING_MS - 1), now), true);
  assert.equal(isSameSitting(ago(SAME_SITTING_MS + 1), now), false);
  assert.equal(isSameSitting(ago(9 * 60 * 60 * 1000), now), false, "overnight");
});

test("a gap with no readable time is not claimed as the same sitting", () => {
  // Nothing parsed in the gap, or a mangled stamp: we can't show continuity, so we don't assert it.
  const now = Date.now();
  assert.equal(isSameSitting(undefined, now), false);
  assert.equal(isSameSitting("not a date", now), false);
});

test("the recovered lines keep their own timestamps", () => {
  // Load-bearing: a kill placed against a recovered fix is scored on how old that fix is, so a
  // stale position must arrive stale rather than looking like it was just typed (see `noteLoc`).
  const state = catchUpState(lines(`${at("00:11:00")}Your Location is 5.00, 6.00, 0.00`));
  assert.ok(state.loc);
  assert.equal(new Date(state.loc.at).getHours(), 0);
  assert.equal(new Date(state.loc.at).getMinutes(), 11);
});
