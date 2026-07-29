/**
 * Tests for the experience-into-level tracker — the figure the log can't give us.
 * Touches a temp dir, because surviving a restart is half the point.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createXpProgress } from "../xp-progress";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-xp-"));
}

const tracker = (dir = tempDir()) => createXpProgress(dir, () => "2026-07-29T01:00:00.000Z");

test("nothing is known until the player says so", () => {
  const xp = tracker();
  assert.equal(xp.state().known, false);
  assert.equal(xp.state().intoLevel, 0);
});

test("gains before the player states a baseline are ignored", () => {
  // Adding them would invent a total from an unknown starting point.
  const xp = tracker();
  xp.addGain(5);
  assert.equal(xp.state().intoLevel, 0);
  assert.equal(xp.state().known, false);
});

test("gains accumulate onto what the player stated", () => {
  const xp = tracker();
  xp.set(40);
  xp.addGain(1.5);
  xp.addGain(0.5);
  assert.equal(xp.state().intoLevel, 42);
  assert.equal(xp.state().known, true);
  assert.equal(xp.state().statedAt, "2026-07-29T01:00:00.000Z");
});

test("a level-up zeroes the counter and takes the log's level", () => {
  const xp = tracker();
  xp.set(98, 13);
  xp.addGain(1);
  xp.levelUp(14);
  assert.equal(xp.state().intoLevel, 0);
  assert.equal(xp.state().level, 14);
  assert.equal(xp.state().known, true);
});

test("a level-up with no number in the log still advances the level", () => {
  const xp = tracker();
  xp.set(90, 13);
  xp.levelUp(); // "You have gained a level!" carries no number
  assert.equal(xp.state().level, 14);
  assert.equal(xp.state().intoLevel, 0);
});

test("progress can't run past the end of a level or below zero", () => {
  const xp = tracker();
  xp.set(99);
  xp.addGain(50); // the level-up line is what resets it; until then, clamp
  assert.ok(xp.state().intoLevel < 100);
  xp.set(-5);
  assert.equal(xp.state().intoLevel, 0);
});

test("progress survives a restart", () => {
  const dir = tempDir();
  const first = tracker(dir);
  first.set(37.5, 12);
  first.addGain(2.5);
  first.flush();

  const reopened = tracker(dir);
  assert.equal(reopened.state().intoLevel, 40);
  assert.equal(reopened.state().level, 12);
  assert.equal(reopened.state().known, true);
});

test("a corrupt file falls back to 'unknown' rather than failing", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "xp-progress.json"), "{oops");
  assert.equal(tracker(dir).state().known, false);
});

test("changes are announced so the windows can update", () => {
  const xp = tracker();
  const seen: number[] = [];
  xp.onChange((s) => seen.push(s.intoLevel));
  xp.set(10);
  xp.addGain(5);
  xp.levelUp(3);
  assert.deepEqual(seen, [10, 15, 0]);
});
