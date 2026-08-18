/**
 * Bounding a promise in time.
 *
 * Worth pinning because the screengrab lookup leans on it for something the user feels directly: its
 * selector covers the screen and swallows clicks while OCR reads, so a read that never returns took
 * the mouse with it. The behaviours below are the ones that guarantee it can't — including the quiet
 * one (a late rejection must not surface as an unhandled rejection and take the app down).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TimeoutError, withTimeout } from "../../src/shared/deadline";

const after = <T>(ms: number, value: T): Promise<T> => new Promise((r) => setTimeout(() => r(value), ms));
const failsAfter = (ms: number, why: string): Promise<never> =>
  new Promise((_r, reject) => setTimeout(() => reject(new Error(why)), ms));

test("a promise that beats its deadline is passed straight through", async () => {
  assert.equal(await withTimeout(after(1, "Cloak of Flames"), 200, "read"), "Cloak of Flames");
});

test("a promise that misses its deadline rejects, and says what and how long", async () => {
  await assert.rejects(withTimeout(after(200, "too late"), 10, "read"), (e: Error) => {
    assert.ok(e instanceof TimeoutError, "a timeout is distinguishable from the work's own failure");
    assert.match(e.message, /read timed out after 10ms/);
    return true;
  });
});

test("the work's own failure is reported as itself, not as a timeout", async () => {
  await assert.rejects(withTimeout(failsAfter(1, "no worker"), 200, "read"), (e: Error) => {
    assert.ok(!(e instanceof TimeoutError));
    assert.equal(e.message, "no worker");
    return true;
  });
});

test("a result arriving after the deadline is dropped, not thrown at the process", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (e: unknown) => unhandled.push(e);
  process.on("unhandledRejection", onUnhandled);
  try {
    // Both shapes of late settle: the abandoned work succeeding, and it failing.
    await assert.rejects(withTimeout(after(30, "late"), 5, "slow read"));
    await assert.rejects(withTimeout(failsAfter(30, "late failure"), 5, "slow read"));
    await after(60, null); // outlive both, so a stray rejection would have landed by now
    assert.deepEqual(unhandled, [], "an abandoned promise must not crash the app when it settles");
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});

test("the timer does not outlive the promise", async () => {
  // A deadline left armed would hold the event loop open (and, in the app, fire against a lookup
  // that has already finished). If it were leaking, this test would take ~10s to exit rather than ms.
  const started = process.hrtime.bigint();
  await withTimeout(after(1, "done"), 10_000, "read");
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(ms < 1_000, `resolved promptly (took ${ms.toFixed(0)}ms)`);
});
