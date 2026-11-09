/**
 * Tests for the journal of levels and abilities that move your stats (`electron/stat-changes.ts`): what
 * it keeps, what it ignores, that a log read twice is one entry, and that it survives a restart.
 * Real disk (a temp directory), no Electron.
 * Only need re-running if that module, `stats-drift.ts` or `stat-buffs.ts` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStatChanges } from "../stat-changes";
import type { AbilityEvent, LevelEvent } from "../../src/shared/types";

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "eql-statchanges-"));
const level = (at: string, n?: number): LevelEvent => ({ kind: "level", level: n, at, logId: 0, raw: "" });
const ability = (at: string, name: string, rank?: number, cost = 2): AbilityEvent => ({ kind: "ability", name, rank, cost, at, logId: 0, raw: "" });

test("a level and a stat-moving ability are kept, with when and what", () => {
  const journal = createStatChanges(tempDir());
  journal.noteLevel(level("2026-11-08T15:00:24", 32));
  journal.noteAbility(ability("2026-11-08T15:05:00", "Innate Eminence", 2));
  assert.deepEqual(journal.all(), [
    { at: "2026-11-08T15:00:24", kind: "level", level: 32 },
    { at: "2026-11-08T15:05:00", kind: "ability", name: "Innate Eminence", rank: 2 },
  ]);
});

test("an ability that moves no stat, and a free toggle, never enter the journal — they would crowd out the levels", () => {
  const journal = createStatChanges(tempDir());
  journal.noteAbility(ability("2026-11-08T15:01:00", "Mental Clarity", 2));
  journal.noteAbility(ability("2026-11-08T15:01:05", "Symphonic Aura: Enabled", 2, 0));
  assert.deepEqual(journal.all(), []);
});

test("a level line that names no number is a level all the same", () => {
  const journal = createStatChanges(tempDir());
  journal.noteLevel(level("2026-11-08T15:00:24"));
  assert.deepEqual(journal.all(), [{ at: "2026-11-08T15:00:24", kind: "level" }]);
});

test("the same line read again is one entry, and says nothing the second time", () => {
  const journal = createStatChanges(tempDir());
  let said = 0;
  journal.onChange(() => (said += 1));
  for (let i = 0; i < 3; i++) journal.noteLevel(level("2026-11-08T15:00:24", 32));
  assert.equal(journal.all().length, 1);
  assert.equal(said, 1, "a catch-up that re-reads a night of log must not broadcast a night of changes");
});

test("it survives a restart: written on flush, read back in order", () => {
  const dir = tempDir();
  const first = createStatChanges(dir);
  first.noteLevel(level("2026-11-08T16:00:00", 33));
  first.noteLevel(level("2026-11-08T15:00:24", 32));
  first.flush();
  assert.deepEqual(createStatChanges(dir).all().map((c) => c.at), ["2026-11-08T15:00:24", "2026-11-08T16:00:00"]);
});

test("a level gained while the app was closed arrives with its own timestamp on the next launch", () => {
  const dir = tempDir();
  const earlier = createStatChanges(dir);
  earlier.noteLevel(level("2026-11-08T14:00:00", 31));
  earlier.flush();
  // The next launch catches up on the log it missed, and the missed level lands with the log's clock.
  const next = createStatChanges(dir);
  next.noteLevel(level("2026-11-08T15:00:24", 32));
  assert.deepEqual(next.all().map((c) => c.at), ["2026-11-08T14:00:00", "2026-11-08T15:00:24"]);
});

test("a hand-edited or damaged file costs the bad entries, not the page", () => {
  const dir = tempDir();
  fs.writeFileSync(
    path.join(dir, "stat-changes.json"),
    JSON.stringify([
      { at: "2026-11-08T15:00:24", kind: "level", level: 32 },
      { at: "not a date", kind: "level" },
      { at: "2026-11-08T15:01:00", kind: "ability" },
      { at: "2026-11-08T15:02:00", kind: "mystery" },
      "nonsense",
      null,
    ]),
  );
  assert.deepEqual(createStatChanges(dir).all(), [{ at: "2026-11-08T15:00:24", kind: "level", level: 32 }]);
  fs.writeFileSync(path.join(dir, "stat-changes.json"), "{ this is not json");
  assert.deepEqual(createStatChanges(dir).all(), []);
});

test("it keeps the newest, not the first, when it is full", () => {
  const journal = createStatChanges(tempDir());
  for (let i = 0; i < 100; i++) journal.noteLevel(level(`2026-11-08T${String(Math.floor(i / 60)).padStart(2, "0")}:${String(i % 60).padStart(2, "0")}:00`, i));
  const all = journal.all();
  assert.equal(all.length, 80);
  const newest = all[all.length - 1];
  assert.equal(newest.kind === "level" ? newest.level : undefined, 99);
});
