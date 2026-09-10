/**
 * The memoizing/de-duplicating shell `eq-maps.ts`'s zone namer and `travel-graph.ts`'s graph builder
 * share: a settled value is never recomputed, two concurrent callers for the same key split one
 * `compute()` rather than each starting their own, and a rejection is neither cached nor left stuck
 * "in flight" forever.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAsyncCache } from "../async-cache";

test("a settled value is returned without calling compute again", async () => {
  const cache = createAsyncCache<number>();
  let calls = 0;
  const compute = async () => {
    calls++;
    return 42;
  };
  assert.equal(await cache.get("a", compute), 42);
  assert.equal(await cache.get("a", compute), 42);
  assert.equal(calls, 1);
});

test("two concurrent callers for the same key share one compute()", async () => {
  const cache = createAsyncCache<number>();
  let calls = 0;
  let resolve!: (n: number) => void;
  const compute = () =>
    new Promise<number>((r) => {
      calls++;
      resolve = r;
    });

  const first = cache.get("a", compute);
  const second = cache.get("a", compute); // asked again before the first ever resolved
  resolve(7);

  assert.deepEqual(await Promise.all([first, second]), [7, 7]);
  assert.equal(calls, 1, "only one compute() for the pair");
});

test("different keys never share a computation", async () => {
  const cache = createAsyncCache<string>();
  const calls: string[] = [];
  const compute = (key: string) => async () => {
    calls.push(key);
    return key;
  };
  assert.deepEqual(await Promise.all([cache.get("a", compute("a")), cache.get("b", compute("b"))]), ["a", "b"]);
  assert.deepEqual(calls.sort(), ["a", "b"]);
});

test("a rejection is not cached, and the key is free to try again", async () => {
  const cache = createAsyncCache<number>();
  let attempt = 0;
  const compute = async () => {
    attempt++;
    if (attempt === 1) throw new Error("first attempt fails");
    return 9;
  };

  await assert.rejects(cache.get("a", compute));
  assert.equal(await cache.get("a", compute), 9, "the key wasn't left stuck on the failed attempt");
  assert.equal(attempt, 2);
});

test("clear() forgets settled values and in-flight callers alike", async () => {
  const cache = createAsyncCache<number>();
  let calls = 0;
  await cache.get("a", async () => {
    calls++;
    return 1;
  });
  cache.clear();
  await cache.get("a", async () => {
    calls++;
    return 1;
  });
  assert.equal(calls, 2, "cleared, so the second get() had to recompute");
});
