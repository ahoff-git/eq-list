/**
 * Integration tests for the log watcher. Unlike the pure log-parser tests, these
 * exercise the real filesystem tailing: they write to a temp eqlog, run the
 * watcher, and assert loot events arrive. They cover the behaviors that can't be
 * unit-tested — reading only newly-appended lines, and resetting on truncation.
 *
 * The watcher polls every 500ms, so these use short real-time waits.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogWatcher } from "../log-watcher";
import type { LootEvent } from "../../src/shared/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(pred: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await sleep(50);
  }
  throw new Error("timed out waiting for condition");
}

function tempLogDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-watch-"));
}

const LOOT = "--You have looted a Bone Chips from a decaying skeleton's corpse.--";
const stamp = (msg: string) => `[Mon Jul 20 19:03:45 2026] ${msg}`;

test("emits loot for lines appended after start, ignoring backlog and chatter", async () => {
  const dir = tempLogDir();
  const file = path.join(dir, "eqlog_Tester_test.txt");
  // Pre-existing content must NOT be replayed — we only want new drops.
  fs.writeFileSync(file, stamp("--You have looted a Backlog Item from a rat's corpse.--") + "\n");

  const watcher = createLogWatcher();
  const events: LootEvent[] = [];
  watcher.onLoot((e) => events.push(e));
  watcher.start(dir, "");

  try {
    await sleep(700); // let the watcher anchor at end-of-file
    fs.appendFileSync(file, stamp("You say, 'Hail, a guard'") + "\n"); // chatter → ignored
    fs.appendFileSync(file, stamp(LOOT) + "\n");
    await waitFor(() => events.length >= 1);
    assert.equal(events.length, 1);
    assert.equal(events[0].item, "Bone Chips");
    assert.equal(events[0].source, "decaying skeleton");
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("reads a log that appears after watching starts, from the top (the sim case)", async () => {
  const dir = tempLogDir();
  const watcher = createLogWatcher();
  const events: LootEvent[] = [];
  watcher.onLoot((e) => events.push(e));
  watcher.start(dir, ""); // empty dir — no target yet

  try {
    await sleep(700);
    // A fresh session log appears with content already written (like `npm run sim`).
    fs.writeFileSync(path.join(dir, "eqlog_New_test.txt"), stamp(LOOT) + "\n");
    await waitFor(() => events.length >= 1);
    assert.equal(events[0].item, "Bone Chips");
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Switching to a character you haven't played since launch used to replay their whole log as
// if it were happening now — 120 phantom kills in a measured run, plus re-counted experience,
// re-matched loot and an alert for every spell they were ever cast at.
test("switching to a log that already existed does not replay its history", async () => {
  const dir = tempLogDir();
  const idle = path.join(dir, "eqlog_Idle_test.txt");
  const active = path.join(dir, "eqlog_Active_test.txt");
  // Both characters have a past, and the active one was written most recently.
  fs.writeFileSync(idle, stamp("--You have looted a Ancient History from a rat's corpse.--") + "\n");
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(idle, old, old);
  fs.writeFileSync(active, stamp("--You have looted a Also History from a rat's corpse.--") + "\n");

  const watcher = createLogWatcher();
  const events: LootEvent[] = [];
  watcher.onLoot((e) => events.push(e));
  watcher.start(dir, "");

  try {
    await sleep(700);
    assert.equal(events.length, 0, "neither log's history should be replayed at startup");

    // The player switches characters: the idle log starts being written again.
    fs.appendFileSync(idle, stamp(LOOT) + "\n");
    await waitFor(() => events.length >= 1);
    await sleep(700); // let a replay show up, if it were going to

    assert.deepEqual(
      events.map((e) => e.item),
      ["Bone Chips"],
      "only the newly written line, not the whole file",
    );
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Two characters in one sitting swap which eqlog is newest. Coming back to the first one used
// to re-read it from the top, replaying every kill, drop and fight in it a second time.
test("switching characters and back does not replay the first log", async () => {
  const dir = tempLogDir();
  const first = path.join(dir, "eqlog_First_test.txt");
  const second = path.join(dir, "eqlog_Second_test.txt");
  fs.writeFileSync(first, "");

  const watcher = createLogWatcher();
  const events: LootEvent[] = [];
  watcher.onLoot((e) => events.push(e));
  watcher.start(dir, "");

  try {
    await sleep(700);
    fs.appendFileSync(first, stamp(LOOT) + "\n");
    await waitFor(() => events.length >= 1);

    // Play the second character: its log is now the most recently written.
    fs.writeFileSync(second, stamp("--You have looted a Rat Ear from a rat's corpse.--") + "\n");
    await waitFor(() => events.length >= 2);
    assert.equal(events[1].item, "Rat Ear");

    // Back to the first: appending makes it newest again. Only the new line should arrive.
    fs.appendFileSync(first, stamp("--You have looted a Snake Fang from a snake's corpse.--") + "\n");
    await waitFor(() => events.length >= 3);
    await sleep(700); // give a replay time to show up, if it were going to

    assert.deepEqual(
      events.map((e) => e.item),
      ["Bone Chips", "Rat Ear", "Snake Fang"],
    );
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("resumes after the log is truncated / rotated", async () => {
  const dir = tempLogDir();
  const file = path.join(dir, "eqlog_Tester_test.txt");
  fs.writeFileSync(file, "");

  const watcher = createLogWatcher();
  const events: LootEvent[] = [];
  watcher.onLoot((e) => events.push(e));
  watcher.start(dir, "");

  try {
    await sleep(700);
    fs.appendFileSync(file, stamp(LOOT) + "\n");
    await waitFor(() => events.length >= 1);

    // Truncate + write fresh content, as a new game session would.
    fs.writeFileSync(file, stamp("--You have looted a Fire Beetle Eye from a fire beetle's corpse.--") + "\n");
    await waitFor(() => events.length >= 2);
    assert.equal(events[1].item, "Fire Beetle Eye");
  } finally {
    watcher.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
