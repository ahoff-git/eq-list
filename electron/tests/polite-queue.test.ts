/**
 * Tests for the request queue that keeps us from crowding a borrowed server
 * ([src/shared/polite-queue.ts](../../src/shared/polite-queue.ts)).
 *
 * The clock is injected, so these assert on the *gaps the queue asked for* rather than on elapsed
 * wall time — a timing test that sleeps is slow, and a timing test that sleeps on CI is flaky.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPoliteQueue } from "../../src/shared/polite-queue";

/** A fake clock: `sleep` advances it instead of waiting, and records what it was asked for. */
function fakeClock() {
  let t = 0;
  const naps: number[] = [];
  return {
    naps,
    now: () => t,
    sleep: async (ms: number) => {
      naps.push(ms);
      t += ms;
    },
    /** Pretend some work took this long, so a gap can be shown to close on its own. */
    advance: (ms: number) => {
      t += ms;
    },
  };
}

test("requests run one at a time, in the order they were asked for", async () => {
  const clock = fakeClock();
  const q = createPoliteQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
  const order: string[] = [];
  const work = (name: string) => async () => {
    order.push(`start ${name}`);
    await Promise.resolve();
    order.push(`end ${name}`);
    return name;
  };

  const all = await Promise.all([q.run("a", work("a")), q.run("b", work("b")), q.run("c", work("c"))]);

  assert.deepEqual(all, ["a", "b", "c"]);
  // Serialized, not interleaved: every request ends before the next begins.
  assert.deepEqual(order, ["start a", "end a", "start b", "end b", "start c", "end c"]);
});

test("consecutive requests are spaced by at least the minimum gap", async () => {
  const clock = fakeClock();
  const q = createPoliteQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
  await Promise.all([q.run("a", async () => 1), q.run("b", async () => 2), q.run("c", async () => 3)]);
  // The first goes straight out (nothing to wait for); each of the others waits the full gap.
  assert.deepEqual(clock.naps, [1000, 1000]);
});

test("work that already took longer than the gap isn't slept on again", async () => {
  const clock = fakeClock();
  const q = createPoliteQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
  await q.run("slow", async () => {
    clock.advance(2500); // a slow page — the gap has passed while we waited on it
    return 1;
  });
  await q.run("next", async () => 2);
  assert.deepEqual(clock.naps, [], "no sleep was needed: the previous request covered the gap");
});

test("the same key asked twice while in flight is fetched once", async () => {
  const clock = fakeClock();
  const q = createPoliteQueue({ minGapMs: 1000, now: clock.now, sleep: clock.sleep });
  let calls = 0;
  const work = async () => {
    calls++;
    return "one answer";
  };

  const [a, b] = await Promise.all([q.run("same", work), q.run("same", work)]);

  assert.equal(calls, 1);
  assert.equal(a, "one answer");
  assert.equal(b, "one answer", "the second caller shares the first's answer");
});

test("a key is forgotten once it settles, so it can be asked again later", async () => {
  const clock = fakeClock();
  const q = createPoliteQueue({ minGapMs: 0, now: clock.now, sleep: clock.sleep });
  let calls = 0;
  const work = async () => ++calls;

  await q.run("k", work);
  await q.run("k", work);

  assert.equal(calls, 2, "the queue is a throttle, not a cache");
});

test("one failure doesn't stop the queue", async () => {
  const clock = fakeClock();
  const q = createPoliteQueue({ minGapMs: 10, now: clock.now, sleep: clock.sleep });

  const failed = q.run("bad", async () => {
    throw new Error("HTTP 500");
  });
  const after = q.run("good", async () => "fine");

  await assert.rejects(failed, /HTTP 500/);
  assert.equal(await after, "fine");
  assert.equal(q.pending, 0, "nothing left waiting");
});

test("both callers of an in-flight key see the same rejection", async () => {
  const clock = fakeClock();
  const q = createPoliteQueue({ minGapMs: 0, now: clock.now, sleep: clock.sleep });
  let calls = 0;
  const work = async () => {
    calls++;
    throw new Error("nope");
  };

  const both = await Promise.allSettled([q.run("k", work), q.run("k", work)]);

  assert.equal(calls, 1);
  assert.deepEqual(
    both.map((r) => r.status),
    ["rejected", "rejected"],
  );
});
