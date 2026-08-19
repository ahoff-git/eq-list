/**
 * Black-box tests for the app's brief notices: what the stack does when a second one arrives about
 * the thing the first is still on screen for, and how long a card lives.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_TOAST_MS,
  TOAST_LEAVE_MS,
  TOAST_MS,
  queueToast,
  toastTiming,
  type Toast,
} from "../../src/shared/toasts";

const toast = (id: number, title: string, key?: string): Toast => ({ id, title, key });

test("an unrelated notice stacks under the ones already up", () => {
  const all = queueToast([toast(1, "+ Bone Chips", "item:bone chips")], toast(2, "+ Rat Ears", "item:rat ears"));
  assert.deepEqual(all.map((t) => t.title), ["+ Bone Chips", "+ Rat Ears"]);
});

test("a second notice about the same thing replaces the first, in its own slot", () => {
  const up = [
    toast(1, "+ Bone Chips", "item:bone chips"),
    toast(2, "+ Rat Ears", "item:rat ears"),
  ];
  const all = queueToast(up, { id: 3, title: "+ Bone Chips", detail: "+1 · 2 needed in total", key: "item:bone chips" });
  assert.equal(all.length, 2);
  // Same position — the reader is already looking there — and the newer figures.
  assert.equal(all[0].id, 3);
  assert.equal(all[0].detail, "+1 · 2 needed in total");
  assert.equal(all[1].title, "+ Rat Ears");
});

test("a keyless notice never replaces anything", () => {
  const up = [toast(1, "Something happened")];
  const all = queueToast(up, toast(2, "Something happened"));
  assert.equal(all.length, 2);
});

test("the stack is capped, dropping the oldest", () => {
  const up = [toast(1, "a", "k:a"), toast(2, "b", "k:b"), toast(3, "c", "k:c")];
  const all = queueToast(up, toast(4, "d", "k:d"), 3);
  assert.deepEqual(all.map((t) => t.title), ["b", "c", "d"]);
});

test("a replacement at the cap pushes nothing off — it isn't a new notice", () => {
  const up = [toast(1, "a", "k:a"), toast(2, "b", "k:b"), toast(3, "c", "k:c")];
  const all = queueToast(up, toast(4, "a again", "k:a"), 3);
  assert.deepEqual(all.map((t) => t.title), ["a again", "b", "c"]);
});

test("a life is clamped, and leaving always precedes being dropped", () => {
  const normal = toastTiming();
  assert.equal(normal.life, TOAST_MS);
  assert.equal(normal.leaveAt, TOAST_MS - TOAST_LEAVE_MS);
  // A caller asking for something too short to read gets the floor, not a flicker.
  const tiny = toastTiming(100);
  assert.equal(tiny.life, MIN_TOAST_MS);
  assert.ok(tiny.leaveAt > 0 && tiny.leaveAt < tiny.life);
  // A long one is honoured as asked.
  assert.equal(toastTiming(9000).life, 9000);
});
