/**
 * Black-box tests for hover-card placement. The invariant is that the card never covers the text it
 * explains; the preference is beside it — right, then left — with below/above only as the
 * narrow-window fallback.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { besideWidth, placeTooltip, type AnchorBox } from "../../src/shared/tooltip";

const view = { width: 800, height: 600 };
const card = { width: 300, height: 120 };
/** A name mid-window, with room on both sides. */
const name: AnchorBox = { left: 100, right: 180, top: 200, bottom: 214 };

test("a card goes to the right of the words, aligned with their top", () => {
  const p = placeTooltip(name, card, view);
  assert.equal(p.left, name.right + 6);
  assert.equal(p.top, name.top);
  assert.equal(p.bottom, undefined);
});

test("with no room on the right, it goes to the left of the words", () => {
  const rightish: AnchorBox = { left: 600, right: 700, top: 200, bottom: 214 };
  const p = placeTooltip(rightish, card, view);
  assert.equal(p.left, rightish.left - 6 - card.width, "its right edge is clear of the name");
  assert.ok(p.left + card.width <= rightish.left, "and it stops before the name starts");
  assert.equal(p.top, rightish.top);
});

test("beside a name near the foot of the window, the card slides up to fit", () => {
  const low: AnchorBox = { left: 100, right: 180, top: 560, bottom: 574 };
  const p = placeTooltip(low, card, view);
  assert.equal(p.left, low.right + 6, "still to the right — only the vertical had to give");
  assert.equal(p.top, view.height - card.height - 6);
  assert.ok(p.top! + card.height + 6 <= view.height);
});

// A 300px card in a 320px window fits beside nothing, so it falls back to below/above — which
// still can't cover the name.
const narrow = { width: 320, height: 600 };

test("in a window too narrow for either side, the card drops below the words", () => {
  const p = placeTooltip(name, card, narrow);
  assert.equal(p.top, name.bottom + 6);
  assert.equal(p.left, narrow.width - card.width - 6, "slid in off the right edge");
});

// The original regression: the flip used to be measured from the anchor's *bottom*, so a card near
// the window's foot was placed with its own bottom just above the name's bottom — over the word.
test("with no room below either, it flips above without covering the name", () => {
  const low: AnchorBox = { left: 10, right: 90, top: 520, bottom: 534 };
  const p = placeTooltip(low, card, narrow);
  assert.equal(p.top, undefined, "pinned by its bottom edge, so a late-loading icon grows upward");
  assert.equal(p.bottom, narrow.height - low.top + 6);
  // Read back as a top edge: the card ends above where the name starts.
  const top = narrow.height - p.bottom! - card.height;
  assert.ok(top + card.height <= low.top, "the card's foot is above the name's head");
});

test("with room nowhere the card is clipped on the roomier side, not moved over the name", () => {
  // Taller than the window as well as wider: in a small overlay this is a real case.
  const tall = { width: 300, height: 900 };
  const nearTop = placeTooltip({ left: 10, right: 90, top: 40, bottom: 54 }, tall, narrow);
  assert.ok(nearTop.top !== undefined && nearTop.top > 54, "more room below → hangs below");

  const nearBottom = placeTooltip({ left: 10, right: 90, top: 560, bottom: 574 }, tall, narrow);
  assert.equal(nearBottom.top, undefined, "more room above → sits above");
  assert.equal(nearBottom.bottom, narrow.height - 560 + 6);
});

// ── how wide it may be, to stay beside the name ────────────────────────────────────────────────
//
// The overlay's real shape: a 460px window is 444px of page, and a name in a list row ends a third
// of the way across it. At full width the card fitted beside nothing and every hover dropped it
// onto the rows above and below, which is the one thing the placement above exists to prevent.
const overlay = { width: 444, height: 715 };

test("a name with room on both sides is not capped at all", () => {
  const room = besideWidth(name, view);
  assert.ok(room !== null && room >= card.width, "nothing to give up, so the card keeps its width");
});

test("a card narrows to the room beside a list row's name rather than dropping below it", () => {
  const inRow: AnchorBox = { left: 12, right: 260, top: 100, bottom: 117 };
  const room = besideWidth(inRow, overlay);
  assert.equal(room, overlay.width - inRow.right - 6 - 6, "everything right of the name, less the gaps");
  // Capped to that, the rule above places it beside the name — the rows around it stay readable.
  const p = placeTooltip(inRow, { width: room!, height: 120 }, overlay);
  assert.equal(p.left, inRow.right + 6);
  assert.equal(p.top, inRow.top);
});

test("the roomier side wins, and the placement agrees with it", () => {
  const rightish: AnchorBox = { left: 300, right: 400, top: 100, bottom: 117 };
  const room = besideWidth(rightish, overlay);
  assert.equal(room, 300 - 12, "the left has far more room than the 32px on the right");
  const p = placeTooltip(rightish, { width: room!, height: 120 }, overlay);
  assert.equal(p.left, rightish.left - 6 - room!, "so it goes left, at the width that fits there");
});

test("with no legible room on either side there is no cap, and the fallbacks stand", () => {
  // A long name in a window dragged narrow: 74px to the right of it, none to the left.
  const cramped: AnchorBox = { left: 10, right: 240, top: 100, bottom: 117 };
  assert.equal(besideWidth(cramped, { width: 320, height: 600 }), null);
  // Uncapped means unchanged, not "beside at any cost" — a small card still fits beside.
  const small = placeTooltip(cramped, { width: 60, height: 40 }, { width: 320, height: 600 });
  assert.equal(small.left, cramped.right + 6);
});
