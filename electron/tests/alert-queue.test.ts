/**
 * Black-box tests for the alert queue: which alerts go straight to the overlay, which wait, and
 * what a death or a switched-off setting does to the ones still waiting.
 *
 * Timers are injected, so the 8-minute cue is tested in a millisecond.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createAlertQueue, type CueWatch, type Timers } from "../alert-queue";
import { lineSubject } from "../../src/shared/cast-alerts";
import type { CastAlertEvent } from "../../src/shared/types";

/** A hand-cranked clock: nothing fires until the test says how far to move. */
function fakeTimers() {
  let next = 1;
  const due = new Map<number, { fn: () => void; at: number }>();
  let now = 0;
  const timers: Timers = {
    set: (fn, ms) => {
      const id = next++;
      due.set(id, { fn, at: now + ms });
      return id;
    },
    clear: (handle) => void due.delete(handle as number),
  };
  return {
    timers,
    /** Move time on, firing everything that comes due (soonest first, like a real loop). */
    advance(ms: number) {
      now += ms;
      const ready = [...due.entries()].filter(([, t]) => t.at <= now).sort((a, b) => a[1].at - b[1].at);
      for (const [id, t] of ready) {
        due.delete(id);
        t.fn();
      }
    },
    /** Timers still armed — the queue's own `pending()` should agree with this. */
    armed: () => due.size,
  };
}

const ALERT = (spell: string): CastAlertEvent => ({ caster: "a gnoll", spell, at: "2026-07-29T21:00:00", event: "cast" });
/** A watch as the queue sees it: an id to collide on, and whatever timing the test is about. */
const watch = (delay?: string, over: Partial<CueWatch> = {}): CueWatch => ({ id: "w1", delay, ...over });

function harness() {
  const clock = fakeTimers();
  const raised: string[] = [];
  const queue = createAlertQueue((a) => raised.push(a.spell), clock.timers);
  return { clock, raised, queue };
}

test("a watch with no delay is raised at once, and no timer is created at all", () => {
  const { clock, raised, queue } = harness();
  queue.schedule(ALERT("Fear"), watch());
  assert.deepEqual(raised, ["Fear"]);
  assert.equal(queue.pending(), 0);
  assert.equal(clock.armed(), 0); // the path that existed before cues did, unchanged
});

test("a delayed watch says nothing until its cue is due", () => {
  const { clock, raised, queue } = harness();
  queue.schedule(ALERT("Mesmerize"), watch("25"));
  assert.deepEqual(raised, []);
  assert.equal(queue.pending(), 1);
  clock.advance(24_000);
  assert.deepEqual(raised, []);
  clock.advance(1_000);
  assert.deepEqual(raised, ["Mesmerize"]);
  assert.equal(queue.pending(), 0);
});

test("the alert that fires is the one that matched, held whole", () => {
  const clock = fakeTimers();
  const raised: CastAlertEvent[] = [];
  const queue = createAlertQueue((a) => raised.push(a), clock.timers);
  queue.schedule({ ...ALERT("Mesmerize"), message: "RECAST MEZ", style: undefined }, watch("25"));
  clock.advance(25_000);
  assert.equal(raised[0].message, "RECAST MEZ");
  assert.equal(raised[0].caster, "a gnoll");
});

test("cues fire in the order they come due, not the order they were scheduled", () => {
  const { clock, raised, queue } = harness();
  queue.schedule(ALERT("respawn"), watch("8m", { id: "ph" }));
  queue.schedule(ALERT("recast"), watch("25", { id: "mez" }));
  clock.advance(8 * 60_000);
  assert.deepEqual(raised, ["recast", "respawn"]);
});

test("a death cancels a short cue and leaves a long one alone", () => {
  const { clock, raised, queue } = harness();
  queue.schedule(ALERT("recast"), watch("25", { id: "mez" })); // a cue about this fight
  queue.schedule(ALERT("respawn"), watch("8m", { id: "ph" })); // a spawn, which your death doesn't move
  queue.noteDeath();
  assert.equal(queue.pending(), 1);
  clock.advance(8 * 60_000);
  assert.deepEqual(raised, ["respawn"]);
  assert.equal(clock.armed(), 0); // the cancelled cue's timer is really gone, not just ignored
});

test("a death with nothing waiting, and a second death, are both no-ops", () => {
  const { clock, raised, queue } = harness();
  queue.noteDeath();
  queue.schedule(ALERT("recast"), watch("25"));
  queue.noteDeath();
  queue.noteDeath();
  clock.advance(60_000);
  assert.deepEqual(raised, []);
  assert.equal(queue.pending(), 0);
});

test("an immediate alert can't be cancelled by a death — it already happened", () => {
  const { clock, raised, queue } = harness();
  queue.schedule(ALERT("Fear"), watch());
  queue.noteDeath();
  clock.advance(60_000);
  assert.deepEqual(raised, ["Fear"]);
});

test("clear drops every cue, long ones included — alerts off means silence", () => {
  const { clock, raised, queue } = harness();
  queue.schedule(ALERT("recast"), watch("25", { id: "mez" }));
  queue.schedule(ALERT("respawn"), watch("8m", { id: "ph" }));
  queue.clear();
  assert.equal(queue.pending(), 0);
  assert.equal(clock.armed(), 0);
  clock.advance(30 * 60_000);
  assert.deepEqual(raised, []);
});

test("an unreadable delay is raised immediately rather than swallowed", () => {
  const { raised, queue } = harness();
  queue.schedule(ALERT("Fear"), watch("dunno"));
  assert.deepEqual(raised, ["Fear"]);
});

// ── a second match of a watch already waiting ──────────────────────────────────

test("by default a second match restarts the countdown, and there's still only one cue", () => {
  // Re-mez at 10 s and the recast reminder belongs 25 s from *now*, not from the first cast.
  const { clock, raised, queue } = harness();
  queue.schedule(ALERT("mez A"), watch("25"));
  clock.advance(10_000);
  queue.schedule(ALERT("mez B"), watch("25"));
  assert.equal(queue.pending(), 1);
  clock.advance(15_000); // 25 s after the *first* — the restarted cue isn't due yet
  assert.deepEqual(raised, []);
  clock.advance(10_000);
  assert.deepEqual(raised, ["mez B"]); // and it's the newer alert that speaks
});

test("`queue` keeps both, which is what two placeholders dying means", () => {
  const { clock, raised, queue } = harness();
  const ph = (delay: string) => watch(delay, { retrigger: "queue" });
  queue.schedule(ALERT("ph A"), ph("8m"));
  clock.advance(60_000);
  queue.schedule(ALERT("ph B"), ph("8m"));
  assert.equal(queue.pending(), 2);
  clock.advance(7 * 60_000);
  assert.deepEqual(raised, ["ph A"]);
  clock.advance(60_000);
  assert.deepEqual(raised, ["ph A", "ph B"]);
});

test("`ignore` keeps the first cue's timing and drops the newcomer", () => {
  const { clock, raised, queue } = harness();
  const w = watch("25", { retrigger: "ignore" });
  queue.schedule(ALERT("first"), w);
  clock.advance(10_000);
  queue.schedule(ALERT("second"), w);
  assert.equal(queue.pending(), 1);
  clock.advance(15_000);
  assert.deepEqual(raised, ["first"]); // the original alert, at the original time
});

test("two different watches never collide, whatever their retrigger says", () => {
  const { clock, raised, queue } = harness();
  queue.schedule(ALERT("mez"), watch("25", { id: "mez" }));
  queue.schedule(ALERT("root"), watch("25", { id: "root" }));
  assert.equal(queue.pending(), 2);
  clock.advance(25_000);
  assert.deepEqual(raised, ["mez", "root"]);
});

// ── the log calling a cue off ──────────────────────────────────────────────────

const DEAD = lineSubject("a wild tiger has been slain by Kainos!");
const stopper = (text: string, exclude = false) => [{ field: "line" as const, op: "contains" as const, text, exclude }];

test("a line whose words a cue is waiting for calls it off", () => {
  const { clock, raised, queue } = harness();
  queue.schedule(ALERT("re-mez"), watch("25", { cancelWhen: stopper("has been slain") }));
  queue.noteLine(lineSubject("a wild tiger hits YOU for 12 points of damage."));
  assert.equal(queue.pending(), 1); // an ordinary line changes nothing
  queue.noteLine(DEAD);
  assert.equal(queue.pending(), 0);
  clock.advance(60_000);
  assert.deepEqual(raised, []);
});

test("a cue with no cancelling words ignores the whole log", () => {
  const { clock, raised, queue } = harness();
  queue.schedule(ALERT("re-mez"), watch("25"));
  queue.noteLine(DEAD);
  clock.advance(25_000);
  assert.deepEqual(raised, ["re-mez"]);
});

test("an inverted cancel is refused rather than firing on everything else", () => {
  // "cancel when the line doesn't say X" would end the cue on the next line of any kind.
  const { clock, raised, queue } = harness();
  queue.schedule(ALERT("re-mez"), watch("25", { cancelWhen: stopper("has been slain", true) }));
  queue.noteLine(lineSubject("you have entered Befallen."));
  clock.advance(25_000);
  assert.deepEqual(raised, ["re-mez"]);
});

test("watchesLines answers whether reading the log for cancels is worth it at all", () => {
  const { queue } = harness();
  assert.equal(queue.watchesLines(), false);
  queue.schedule(ALERT("plain"), watch("25"));
  assert.equal(queue.watchesLines(), false); // a cue nothing can cancel doesn't need the lines
  queue.schedule(ALERT("re-mez"), watch("25", { id: "mez", cancelWhen: stopper("has been slain") }));
  assert.equal(queue.watchesLines(), true);
  queue.clear();
  assert.equal(queue.watchesLines(), false);
});

// ── repeats ────────────────────────────────────────────────────────────────────

test("a repeat says it again at the same interval, the stated number of times", () => {
  const { clock, raised, queue } = harness();
  queue.schedule(ALERT("re-mez"), watch("25", { repeat: 2 }));
  clock.advance(25_000);
  assert.deepEqual(raised, ["re-mez"]);
  clock.advance(25_000);
  assert.deepEqual(raised, ["re-mez", "re-mez"]);
  clock.advance(25_000);
  assert.deepEqual(raised, ["re-mez", "re-mez", "re-mez"]);
  clock.advance(60_000); // and then it stops, rather than going on all evening
  assert.equal(raised.length, 3);
  assert.equal(queue.pending(), 0);
});

test("a repeat can be cut short by the line it was waiting for", () => {
  const { clock, raised, queue } = harness();
  queue.schedule(ALERT("re-mez"), watch("25", { repeat: 10, cancelWhen: stopper("has been slain") }));
  clock.advance(25_000);
  assert.deepEqual(raised, ["re-mez"]);
  queue.noteLine(DEAD);
  clock.advance(5 * 60_000);
  assert.deepEqual(raised, ["re-mez"]);
  assert.equal(queue.pending(), 0);
});

test("a repeat can be cut short by dying", () => {
  const { clock, raised, queue } = harness();
  queue.schedule(ALERT("re-mez"), watch("25", { repeat: 10 }));
  clock.advance(25_000);
  queue.noteDeath();
  clock.advance(5 * 60_000);
  assert.equal(raised.length, 1);
});

test("a repeat nothing could ever stop is refused — it fires once", () => {
  const { clock, raised, queue } = harness();
  queue.schedule(ALERT("ph"), watch("8m", { repeat: 10, cancelOnDeath: "never" }));
  clock.advance(30 * 60_000);
  assert.deepEqual(raised, ["ph"]);
});
