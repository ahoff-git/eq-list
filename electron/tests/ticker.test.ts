/**
 * The real `setInterval`/`clearInterval` a sweep falls back to when a test hasn't injected its own.
 * The one thing worth pinning: it's unref'd, so a sweep alone is never the reason the process stays
 * up after a quit — `hasRef()` is the only portable way to see that from outside.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { realClearInterval, realInterval } from "../ticker";

test("the real interval is unref'd", () => {
  const handle = realInterval(() => {}, 10_000) as NodeJS.Timeout;
  assert.equal(handle.hasRef(), false);
  realClearInterval(handle);
});

test("it actually fires on the interval, and clearing it actually stops it", async () => {
  let calls = 0;
  const handle = realInterval(() => calls++, 5);
  await new Promise((r) => setTimeout(r, 30));
  realClearInterval(handle);
  const seenBeforeClear = calls;
  assert.ok(seenBeforeClear >= 2, "should have fired more than once in 30ms at a 5ms interval");

  await new Promise((r) => setTimeout(r, 30));
  assert.equal(calls, seenBeforeClear, "nothing further once cleared");
});
