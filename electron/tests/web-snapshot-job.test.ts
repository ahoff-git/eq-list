/**
 * Tests for the scheduling/catch-up logic alone (ADR 0278) — `runExport` is faked out, so a
 * multi-day timeline runs in milliseconds with no real worker thread involved. `runWebSnapshotExport`
 * itself (the real `runExport`, which does spawn a worker) is exercised end to end by
 * `scripts/build-web-snapshot.mjs` already sharing its underlying `buildWebSnapshot`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWebSnapshotJob } from "../web-snapshot-job";

const HOUR = 60 * 60 * 1000;
const INTERVAL_MS = 6 * HOUR;
/** A realistic epoch-scale base, not 0 — `lastRunAt() === 0` ("never run") must read as overdue
 *  against real wall-clock time, and a clock starting at 0 would defeat that check by accident. */
const T0 = Date.parse("2026-01-01T00:00:00.000Z");

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "eql-web-snapshot-"));

/** Fake timers: `tick(ms)` fires everything due, in order — including timers a fired one schedules. */
function harness(userDataDir = tempDir()) {
  let nowMs = T0;
  let runCount = 0;
  const pending: { at: number; fn: () => void }[] = [];
  const job = createWebSnapshotJob({
    userDataDir,
    intervalMs: INTERVAL_MS,
    now: () => nowMs,
    setTimeout: (fn, ms) => {
      const entry = { at: nowMs + ms, fn };
      pending.push(entry);
      return entry;
    },
    clearTimeout: (handle) => {
      const i = pending.indexOf(handle as (typeof pending)[number]);
      if (i >= 0) pending.splice(i, 1);
    },
    runExport: () => {
      runCount++;
      return Promise.resolve();
    },
  });
  return {
    job,
    runCount: () => runCount,
    /** Fires everything due, in order — and flushes a microtask after each, since `runOnce`'s own
     *  in-flight guard only clears once `runExport`'s promise settles (a plain `.finally()`, even
     *  on an already-resolved promise, lands on the microtask queue rather than synchronously). */
    async tick(ms: number) {
      nowMs += ms;
      for (;;) {
        const due = pending.filter((p) => p.at <= nowMs).sort((a, b) => a.at - b.at)[0];
        if (!due) return;
        pending.splice(pending.indexOf(due), 1);
        due.fn();
        await Promise.resolve();
      }
    },
  };
}

test("never run before: catches up immediately, then waits a full interval", async () => {
  const h = harness();
  h.job.start();
  await Promise.resolve();
  assert.equal(h.runCount(), 1, "no prior run recorded — starts overdue");

  await h.tick(INTERVAL_MS - 1);
  assert.equal(h.runCount(), 1, "not due yet");

  await h.tick(1);
  assert.equal(h.runCount(), 2, "interval elapsed — runs again");
});

test("a run within the interval is not repeated on the next open", async () => {
  const dir = tempDir();
  harness(dir).job.start();
  await Promise.resolve(); // let `recordRun`'s `.finally()` land on disk before reading it back

  const second = harness(dir);
  await second.tick(HOUR); // reopened an hour later — well inside the 6-hour interval
  second.job.start();
  assert.equal(second.runCount(), 0, "ran recently — not overdue on this open");
});

test("closed for many intervals: catches up exactly once, not once per missed interval", async () => {
  const dir = tempDir();
  harness(dir).job.start();
  await Promise.resolve(); // let `recordRun`'s `.finally()` land on disk before reading it back

  let runs = 0;
  const reopenedMuchLater = createWebSnapshotJob({
    userDataDir: dir,
    intervalMs: INTERVAL_MS,
    now: () => T0 + INTERVAL_MS * 5, // as if the app were closed for 5 missed intervals
    setTimeout: () => ({}),
    clearTimeout: () => {},
    runExport: () => {
      runs++;
      return Promise.resolve();
    },
  });
  reopenedMuchLater.start();
  assert.equal(runs, 1, "one catch-up run regardless of how many intervals were missed");
});

test("dispose stops further scheduled runs", async () => {
  const h = harness();
  h.job.start();
  await Promise.resolve();
  assert.equal(h.runCount(), 1);
  h.job.dispose();
  await h.tick(INTERVAL_MS * 5);
  assert.equal(h.runCount(), 1, "nothing fires once disposed");
});
