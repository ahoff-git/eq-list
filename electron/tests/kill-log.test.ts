/**
 * Tests for where kills get placed, and how much the placement is trusted. The whole point
 * is honesty about a guess: EQ only reports a position when the player asks it to, so these
 * pin the *confidence* rules as much as the arithmetic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createKillLog } from "../kill-log";
import type { LocEvent } from "../../src/shared/types";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-kills-"));
}

/** `sec` seconds past midnight, as the parsers write timestamps. */
function stamp(sec: number): string {
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  return `2026-07-29T00:${mm}:${String(sec % 60).padStart(2, "0")}`;
}

function loc(y: number, x: number, sec: number): LocEvent {
  return { kind: "loc", y, x, z: 0, logId: 1, raw: "Your Location is", at: stamp(sec) };
}

test("a kill with no position yet is still recorded, with no confidence", () => {
  const k = createKillLog(tempDir());
  k.record("a coyote", "Steamfont Mountains", stamp(10), 5);

  const [kill] = k.kills();
  assert.equal(kill.mob, "a coyote");
  assert.equal(kill.y, undefined);
  assert.equal(kill.confidence, 0);
});

test("a fresh fix from a stationary player is trusted completely", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(100, 200, 10));
  k.noteLoc(loc(100, 200, 20)); // same spot: parked
  k.record("a coyote", "Steamfont Mountains", stamp(25), 9);

  const [kill] = k.kills();
  assert.equal(kill.y, 100);
  assert.equal(kill.x, 200);
  assert.equal(kill.fixAgeSec, 5);
  assert.equal(kill.speed, 0);
  assert.equal(kill.confidence, 1);
});

test("confidence decays as the fix goes stale, and is gone past the horizon", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(0, 0, 0));
  k.record("mid", null, stamp(35), 1); // 35s old: partway down
  k.record("stale", null, stamp(90), 2); // past a minute: don't plot as fact

  const [stale, mid] = k.kills(); // newest first
  assert.ok(mid.confidence > 0 && mid.confidence < 1, `expected a middling score, got ${mid.confidence}`);
  assert.equal(stale.confidence, 0);
  // Both are still recorded — the position is kept even when it isn't to be believed.
  assert.equal(stale.y, 0);
});

test("a player who was moving is trusted less than one who was parked", () => {
  const moving = createKillLog(tempDir());
  moving.noteLoc(loc(0, 0, 0));
  moving.noteLoc(loc(300, 0, 10)); // covered ground
  moving.record("a coyote", null, stamp(12), 1);

  const parked = createKillLog(tempDir());
  parked.noteLoc(loc(0, 0, 0));
  parked.noteLoc(loc(0, 0, 10));
  parked.record("a coyote", null, stamp(12), 1);

  assert.equal(moving.kills()[0].speed, 30); // 300 units in 10s
  assert.ok(
    moving.kills()[0].confidence < parked.kills()[0].confidence,
    "movement should cost confidence",
  );
});

test("a moving player gets a dead-reckoned guess as well as the raw fix", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(0, 0, 0));
  k.noteLoc(loc(100, 50, 10)); // 10 units/s north, 5 east
  k.record("a coyote", null, stamp(14), 1); // 4s past the fix

  const [kill] = k.kills();
  assert.equal(kill.y, 100); // the fix itself, untouched
  assert.equal(kill.guessedY, 140); // …and where the course would have taken them
  assert.equal(kill.guessedX, 70);
  assert.equal(kill.movedUnits, 112);
});

test("a stationary player gets no guess — there's no course to extend", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(10, 10, 0));
  k.noteLoc(loc(10, 10, 10));
  k.record("a coyote", null, stamp(12), 1);
  assert.equal(k.kills()[0].guessedY, undefined);
});

test("kills can be read back per zone, newest first", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(1, 1, 0));
  k.record("first", "Ak'Anon", stamp(1), 1);
  k.record("second", "Steamfont Mountains", stamp(2), 2);
  k.record("third", "Ak'Anon", stamp(3), 3);

  assert.deepEqual(
    k.kills("Ak'Anon").map((x) => x.mob),
    ["third", "first"],
  );
  assert.equal(k.kills().length, 3);
});

test("the log survives a restart, and a corrupt file is not fatal", () => {
  const dir = tempDir();
  const first = createKillLog(dir);
  first.noteLoc(loc(5, 5, 0));
  first.record("a coyote", "Ak'Anon", stamp(2), 1);
  first.flush();
  assert.equal(createKillLog(dir).kills().length, 1);

  const broken = tempDir();
  fs.writeFileSync(path.join(broken, "kill-log.json"), "{nope");
  assert.deepEqual(createKillLog(broken).kills(), []);
});
