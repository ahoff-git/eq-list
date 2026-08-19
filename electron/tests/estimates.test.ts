/**
 * Black-box tests for the rules behind a number the app **worked out** rather than read.
 *
 * These are decisions, not arithmetic — which is the reason they are named functions and the reason
 * they are pinned here. Each test says which rule it is holding in place, because the failure mode
 * is never a crash: it is a figure that is quietly, permanently wrong.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  confidenceOf,
  contradicts,
  disagrees,
  plausible,
  settle,
  tighten,
  tightestOf,
} from "../../src/shared/estimates";

// ── a bound only moves one way ─────────────────────────────────────────────────

test("an upper bound falls and never rises; a lower bound does the opposite", () => {
  assert.equal(tighten(100, 60, "upper"), 60);
  assert.equal(tighten(100, 140, "upper"), 100, "a looser observation says nothing");
  assert.equal(tighten(100, 140, "lower"), 140);
  assert.equal(tighten(100, 60, "lower"), 100);
});

test("nothing known yet takes the first observation whole", () => {
  assert.equal(tighten(undefined, 60, "upper"), 60);
  assert.equal(tighten(undefined, 60, "lower"), 60);
});

// ── which is why implausible input is discarded, not clamped ───────────────────

test("an observation outside the range is refused rather than trimmed to fit", () => {
  const range = { min: 90, max: 43_200 };
  assert.equal(plausible(600, range), true);
  assert.equal(plausible(30, range), false);
  assert.equal(plausible(50_000, range), false);
  // The pairing is the point: clamping 30 to 90 would ratchet a figure to a number nobody observed,
  // and against a bound that only falls there is no way back from it.
  assert.equal(tighten(600, 90, "upper"), 90, "which is what clamping would have handed us");
});

test("nonsense is not a number", () => {
  const range = { min: 0, max: 10 };
  assert.equal(plausible(Number.NaN, range), false);
  assert.equal(plausible(Number.POSITIVE_INFINITY, range), false);
});

// ── the two ends crossing ──────────────────────────────────────────────────────

test("bounds that cross are a contradiction — the truth cannot be both", () => {
  assert.equal(contradicts(600, 900), true, "at most 600 and at least 900 cannot both hold");
  assert.equal(contradicts(900, 600), false);
  // Equal is a contradiction too: "at most 600" and "at least 600" leave no room to be wrong about.
  assert.equal(contradicts(600, 600), true);
});

test("one end alone contradicts nothing", () => {
  assert.equal(contradicts(600, undefined), false);
  assert.equal(contradicts(undefined, 900), false);
});

// ── a source disagreeing with itself ───────────────────────────────────────────

test("a wide spread means soft, where crossed bounds mean wrong", () => {
  assert.equal(disagrees(100, 140, 1.5), false, "observations that cluster agree");
  assert.equal(disagrees(100, 200, 1.5), true);
  assert.equal(disagrees(100, undefined, 1.5), false, "one observation can't disagree with itself");
});

// ── sample size is part of the figure ──────────────────────────────────────────

test("how much a figure is worth is a function of how much is behind it", () => {
  const scale = { fair: 3, solid: 8 };
  assert.equal(confidenceOf(0, scale), "none");
  assert.equal(confidenceOf(1, scale), "thin", "a figure from one sample is a hint, not a figure");
  assert.equal(confidenceOf(3, scale), "fair");
  assert.equal(confidenceOf(8, scale), "solid");
  assert.equal(confidenceOf(99, scale), "solid");
});

// ── what the player said outranks what we worked out ───────────────────────────

test("a stated figure wins, and says that it is stated", () => {
  assert.deepEqual(settle(1200, 900), { value: 1200, stated: true });
});

test("clearing a stated figure falls back to the inference rather than to nothing", () => {
  // The inference is passed in rather than replaced, which is the whole reason this can happen.
  assert.deepEqual(settle(undefined, 900), { value: 900, stated: false });
});

test("neither is no answer, not a default", () => {
  assert.equal(settle(undefined, undefined), undefined);
});

test("a cleared field arrives as zero, and zero is not a claim", () => {
  assert.deepEqual(settle(0, 900), { value: 900, stated: false });
  assert.deepEqual(settle(-5, 900), { value: 900, stated: false });
  assert.deepEqual(settle(Number.NaN, 900), { value: 900, stated: false });
});

// ── the tightest claim, and which source it was ────────────────────────────────

test("the tightest claim wins and carries its source with it", () => {
  const best = tightestOf([
    { value: 900, source: "kills" },
    { value: 540, source: "sighting" },
  ]);
  assert.equal(best?.value, 540);
  // The provenance is the point: two sources agreeing is not the same as one guessing, and the
  // reader has to be able to tell which they are reading.
  assert.equal(best?.source, "sighting");
});

test("a tie goes to the first claim, so a caller orders by how much it trusts them", () => {
  const best = tightestOf([
    { value: 600, source: "sighting" },
    { value: 600, source: "kills" },
  ]);
  assert.equal(best?.source, "sighting");
});

test("a lower-bound contest picks the largest instead", () => {
  const best = tightestOf(
    [
      { value: 300, source: "early" },
      { value: 900, source: "late" },
    ],
    "lower",
  );
  assert.equal(best?.source, "late");
});

test("absent sources are skipped, and none at all is no answer", () => {
  assert.equal(tightestOf([undefined, undefined]), undefined);
  assert.equal(tightestOf([undefined, { value: 5, source: "only" }])?.source, "only");
});
