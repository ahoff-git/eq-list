/**
 * Black-box tests for picking the marker under the cursor. The arithmetic is trivial; what needs
 * pinning is the crowded case — a map can have a pin, a kill and a zone label within a few pixels
 * of each other, and only one of them is what you meant.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickHit, type Hittable } from "../../src/shared/map/hit-test";

const at = (x: number, y: number, radius = 8, priority = 0): Hittable & { id: string } => ({
  id: `${x},${y}`,
  at: { x, y },
  radius,
  priority,
});

test("nothing under the cursor means nothing is picked", () => {
  assert.equal(pickHit([at(100, 100)], { x: 200, y: 200 }), undefined);
  assert.equal(pickHit([], { x: 0, y: 0 }), undefined);
});

test("a marker is picked from anywhere inside its radius, and not outside it", () => {
  const marker = at(100, 100, 8);
  assert.equal(pickHit([marker], { x: 106, y: 100 })?.id, "100,100");
  assert.equal(pickHit([marker], { x: 100, y: 108 })?.id, "100,100"); // exactly on the edge
  assert.equal(pickHit([marker], { x: 100, y: 109 }), undefined);
});

test("each marker keeps its own radius — a pin is easier to hit than a kill dot", () => {
  const pin = at(0, 0, 9);
  const kill = at(40, 0, 6);
  // 7px from each: inside the pin, outside the kill dot.
  assert.equal(pickHit([pin, kill], { x: 7, y: 0 })?.id, "0,0");
  assert.equal(pickHit([pin, kill], { x: 33, y: 0 }), undefined);
});

test("the nearer marker wins when they're clearly apart", () => {
  const near = at(100, 100, 10, 0);
  const far = at(112, 100, 10, 3); // higher priority, but plainly further from the cursor
  assert.equal(pickHit([near, far], { x: 100, y: 100 })?.id, "100,100");
});

test("priority settles an overlap — what you placed beats what was inferred under it", () => {
  // A pin and a kill dot all but on top of each other: the pin is the thing you aimed at.
  const kill = at(100, 100, 8, 2);
  const pin = at(102, 100, 9, 4);
  assert.equal(pickHit([kill, pin], { x: 100, y: 100 })?.id, "102,100");
  // With the priorities the other way round, the same geometry picks the other one — so it really
  // is priority deciding, not the order they were listed in.
  const dullPin = at(102, 100, 9, 0);
  assert.equal(pickHit([kill, dullPin], { x: 100, y: 100 })?.id, "100,100");
});

test("priority can't drag a pick across a visible gap", () => {
  // Twelve pixels apart is not an overlap, so the near one wins whatever its priority.
  const near = at(100, 100, 20, 0);
  const far = at(112, 100, 20, 2);
  assert.equal(pickHit([near, far], { x: 100, y: 100 })?.id, "100,100");
});

test("listing order doesn't decide anything", () => {
  const a = at(100, 100, 10, 1);
  const b = at(103, 100, 10, 1);
  const first = pickHit([a, b], { x: 100, y: 100 })?.id;
  const second = pickHit([b, a], { x: 100, y: 100 })?.id;
  assert.equal(first, second);
  assert.equal(first, "100,100"); // the nearer of two equals
});
