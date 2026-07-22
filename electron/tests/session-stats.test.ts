/**
 * Tests for the session tracker: counting XP/kills and attributing each XP gain
 * to the mob killed just before it (within the time window).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionStats } from "../session-stats";
import type { XpEvent } from "../../src/shared/types";

const xp = (at: string, party = false, pct?: number): XpEvent => ({ kind: "xp", party, pct, raw: "", at });

test("counts kills and xp, attributing xp to the most recent kill", () => {
  const s = createSessionStats(() => "2026-07-20T00:00:00");
  s.recordKill("a large rat", "2026-07-20T19:03:05");
  s.recordXp(xp("2026-07-20T19:03:06", false, 0.5));
  s.recordKill("an orc pawn", "2026-07-20T19:03:20");
  s.recordXp(xp("2026-07-20T19:03:21", true, 0.019));

  const snap = s.snapshot();
  assert.equal(snap.kills, 2);
  assert.equal(snap.totalXp, 2);
  assert.equal(snap.soloXp, 1);
  assert.equal(snap.partyXp, 1);
  assert.equal(snap.totalPct, 0.519);

  const rat = snap.byMob.find((m) => m.mob === "a large rat");
  const orc = snap.byMob.find((m) => m.mob === "an orc pawn");
  assert.equal(rat!.xp, 1);
  assert.equal(orc!.xp, 1);
});

test("xp long after a kill is not attributed to it", () => {
  const s = createSessionStats(() => "t0");
  s.recordKill("a bat", "2026-07-20T19:00:00");
  s.recordXp(xp("2026-07-20T19:05:00")); // 5 min later — outside the window
  const bat = s.snapshot().byMob.find((m) => m.mob === "a bat");
  assert.equal(bat!.kills, 1);
  assert.equal(bat!.xp, 0);
  assert.equal(s.snapshot().totalXp, 1);
});

test("reset clears everything", () => {
  const s = createSessionStats(() => "t0");
  s.recordKill("a bat", "2026-07-20T19:00:00");
  s.recordXp(xp("2026-07-20T19:00:01"));
  s.reset();
  const snap = s.snapshot();
  assert.equal(snap.kills, 0);
  assert.equal(snap.totalXp, 0);
  assert.equal(snap.byMob.length, 0);
});
