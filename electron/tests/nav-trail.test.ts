/**
 * Black-box tests for the in-app trail (ADR 0173): back means "the screen before this one",
 * whether that screen was a tab or a page. Guards the rules the button rests on — a move appends,
 * an arrival where you already are does not, going somewhere new drops forward history — plus the
 * breadcrumb window and the tolerance the persisted trail is read back with.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canStepBack,
  canStepForward,
  crumbTrail,
  goTo,
  here,
  placeLabel,
  readTrail,
  samePlace,
  stepBack,
  stepForward,
  stepTo,
  trailOf,
  TRAIL_LIMIT,
  type NavTrail,
} from "../../src/shared/nav-trail";

/** Walk a trail through a list of places, as a reader clicking through the window would. */
function walk(start: string, ...places: { tab: string; page?: string }[]): NavTrail {
  return places.reduce((t, p) => goTo(t, p), trailOf(start));
}

const labels = (t: NavTrail) => t.places.map(placeLabel);

test("a fresh trail is one place, with nowhere to go", () => {
  const t = trailOf("list");
  assert.deepEqual(here(t), { tab: "list" });
  assert.equal(canStepBack(t), false);
  assert.equal(canStepForward(t), false);
});

test("back returns to the tab you came from, not to an empty search box", () => {
  // The bug this exists for: Hunt → click a mob name (which opens the page on Search) → back.
  const t = walk("list", { tab: "hunt" }, { tab: "search", page: "Froglok Shaman" });
  assert.deepEqual(here(t), { tab: "search", page: "Froglok Shaman" });
  const back = stepBack(t);
  assert.deepEqual(here(back), { tab: "hunt" });
  assert.deepEqual(here(stepBack(back)), { tab: "list" });
});

test("forward retraces exactly what back undid", () => {
  const t = walk("list", { tab: "search" }, { tab: "search", page: "Rusty Short Sword" });
  const back = stepBack(stepBack(t));
  assert.deepEqual(here(back), { tab: "list" });
  assert.equal(canStepForward(back), true);
  assert.deepEqual(here(stepForward(stepForward(back))), { tab: "search", page: "Rusty Short Sword" });
});

test("arriving where you already are changes nothing at all", () => {
  const t = walk("list", { tab: "hunt" });
  // Same object back, so a re-clicked tab neither doubles a crumb nor re-renders.
  assert.equal(goTo(t, { tab: "hunt" }), t);
  assert.equal(goTo(t, { tab: "hunt", page: undefined }), t);
});

test("a page and its tab are different places", () => {
  const t = walk("list", { tab: "search" }, { tab: "search", page: "Fine Steel Long Sword" });
  assert.equal(t.places.length, 3);
  assert.equal(samePlace({ tab: "search" }, { tab: "search", page: "x" }), false);
  // Closing the page is a move of its own, so back re-opens it.
  const closed = goTo(t, { tab: "search" });
  assert.deepEqual(here(closed), { tab: "search" });
  assert.deepEqual(here(stepBack(closed)), { tab: "search", page: "Fine Steel Long Sword" });
});

test("going somewhere new after going back drops the forward history", () => {
  const t = walk("list", { tab: "hunt" }, { tab: "timers" });
  const then = goTo(stepBack(t), { tab: "loot" });
  assert.deepEqual(labels(then), ["List", "Hunt", "Loot"]);
  assert.equal(canStepForward(then), false);
});

test("a breadcrumb click jumps to that place and keeps everything after it", () => {
  const t = walk("list", { tab: "hunt" }, { tab: "search", page: "Ghoulbane" });
  const jumped = stepTo(t, 0);
  assert.deepEqual(here(jumped), { tab: "list" });
  assert.equal(jumped.places.length, 3); // still ahead of you, as forward
  assert.equal(stepTo(t, 9), t); // out of range: nothing happens
  assert.equal(stepTo(t, t.at), t);
});

test("the trail is capped, keeping the newest places", () => {
  const many = Array.from({ length: TRAIL_LIMIT + 10 }, (_, i) => ({ tab: `t${i}` }));
  const t = walk("list", ...many);
  assert.equal(t.places.length, TRAIL_LIMIT);
  assert.equal(t.at, TRAIL_LIMIT - 1);
  assert.deepEqual(here(t), { tab: `t${TRAIL_LIMIT + 9}` });
  assert.equal(canStepBack(t), true);
});

test("a crumb is named by its page, or by its tab", () => {
  assert.equal(placeLabel({ tab: "peers" }), "Peers");
  assert.equal(placeLabel({ tab: "search", page: "Rusty Short Sword" }), "Rusty Short Sword");
});

test("the breadcrumb shows the way in, and counts what it left out", () => {
  const t = walk("list", { tab: "hunt" }, { tab: "loot" }, { tab: "search" }, { tab: "search", page: "Ghoulbane" });
  const { crumbs, hidden } = crumbTrail(t, 3);
  assert.deepEqual(
    crumbs.map((c) => placeLabel(c.place)),
    ["Loot", "Search", "Ghoulbane"],
  );
  assert.equal(hidden, 2);
  assert.deepEqual(
    crumbs.map((c) => c.index),
    [2, 3, 4],
  );
  assert.equal(crumbs.at(-1)?.current, true);
});

test("the breadcrumb names only where you have been, never the forward places", () => {
  const t = stepBack(walk("list", { tab: "hunt" }, { tab: "loot" }));
  const { crumbs, hidden } = crumbTrail(t);
  assert.deepEqual(
    crumbs.map((c) => placeLabel(c.place)),
    ["List", "Hunt"],
  );
  assert.equal(hidden, 0);
});

test("a stored trail is read back as it was left", () => {
  const t = walk("list", { tab: "hunt" }, { tab: "search", page: "Ghoulbane" });
  assert.deepEqual(readTrail(JSON.parse(JSON.stringify(t)), "list"), t);
});

test("the tab name the old key held becomes a trail at that tab", () => {
  assert.deepEqual(readTrail("peers", "list"), trailOf("peers"));
});

test("an unreadable stored trail falls back home rather than throwing", () => {
  for (const junk of [null, undefined, 0, "", {}, { places: "no" }, { places: [] }, { places: [{ tab: 7 }] }]) {
    assert.deepEqual(readTrail(junk, "list"), trailOf("list"), `for ${JSON.stringify(junk)}`);
  }
});

test("a stored index outside the stored places is pulled back in range", () => {
  const places = [{ tab: "list" }, { tab: "hunt" }];
  assert.equal(readTrail({ places, at: 99 }, "list").at, 1);
  assert.equal(readTrail({ places, at: -3 }, "list").at, 0);
  assert.equal(readTrail({ places }, "list").at, 1); // no index: you were at the newest
});

test("rubbish places are dropped and the rest still read", () => {
  const stored = { places: [{ tab: "list" }, null, { tab: "hunt", page: 4 }, { tab: "loot" }], at: 3 };
  const t = readTrail(stored, "list");
  assert.deepEqual(labels(t), ["List", "Loot"]);
  assert.equal(t.at, 1);
});
