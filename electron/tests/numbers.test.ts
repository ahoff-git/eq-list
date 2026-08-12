/**
 * The two bits of arithmetic the whole app shares.
 *
 * Worth pinning despite being three lines each, because of what they replaced: twenty-odd hand-written
 * copies of `d ? Math.round((n / d) * 10) / 10 : 0`, where the guard and the scale factor are both easy
 * to get wrong and neither failure is visible in a review. What's pinned is the contract the call sites
 * lean on — an empty denominator is 0 (or `undefined`, deliberately), and `places` is not assumed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { over, ratio, round } from "../../src/shared/numbers";

test("round keeps the decimals asked for", () => {
  assert.equal(round(1.2345, 2), 1.23);
  assert.equal(round(1.2355, 2), 1.24);
  assert.equal(round(1.5), 2);
  assert.equal(round(0.0004, 3), 0);
  // Negatives round away from zero at the half, the way Math.round does — no call site has one, but
  // silently differing from Math.round would be a surprise.
  assert.equal(round(-1.25, 1), -1.2);
});

test("round with no places is whole numbers", () => {
  assert.equal(round(3.7), 4);
  assert.equal(round(3.2), 3);
});

test("a ratio is the quotient, rounded only when asked", () => {
  assert.equal(ratio(1, 3), 1 / 3); // untouched — a share is a fraction
  assert.equal(ratio(1, 3, 3), 0.333);
  assert.equal(ratio(150, 4, 1), 37.5);
  assert.equal(ratio(7, 2, 0), 4); // 3.5 → 4
});

test("nothing to divide by is 0, not Infinity or NaN", () => {
  // The bug this exists to prevent: an unguarded rate reaching a panel as `NaN%` or a blank.
  assert.equal(ratio(5, 0), 0);
  assert.equal(ratio(0, 0), 0);
  assert.equal(ratio(5, 0, 2), 0);
  for (const empty of [0, NaN, undefined as unknown as number, null as unknown as number]) {
    assert.equal(ratio(5, empty), 0, `whole = ${String(empty)}`);
  }
});

test("`places` is never assumed — a fraction stays a fraction", () => {
  // The trap in the first draft of this module: `places = 0` by default would have turned every
  // share, crit rate and hit rate in the damage tree into 0 or 1.
  assert.equal(ratio(1, 4), 0.25);
  assert.notEqual(ratio(1, 4), 0);
});

test("over says `undefined` where zero would be a lie", () => {
  assert.equal(over(1, 4), 0.25);
  assert.equal(over(5, 0), undefined);
  assert.equal(over(5, undefined), undefined);
  // Damage on your own side isn't in the fight total, so its share of the fight is unknown — not none.
  assert.equal(over(0, 10), 0); // but a real zero over a real total is still zero
});
