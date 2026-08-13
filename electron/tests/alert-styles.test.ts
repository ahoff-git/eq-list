/**
 * Black-box tests for the three edit paths a rule's look can take.
 *
 * The property under all of them: **changing how one rule looks never changes how another looks.**
 * A saved style is shared, so the only way to keep that true while still allowing an edit from the
 * rule is to fork — and the tests below are mostly about the cases where forking is and isn't the
 * right answer, since forking every time would bury the list in near-identical copies.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alertStyle,
  applyStyleEdit,
  nameOwnStyle,
  nextStyleName,
  plan,
  styleWearers,
  wornStyle,
} from "../../src/shared/alert-styles";
import type { CastAlertSettings, CastWatch, NamedAlertStyle } from "../../src/shared/types";

const LOUD: NamedAlertStyle = {
  id: "loud",
  name: "Loud",
  style: {
    sound: true,
    flash: true,
    color: "#a371f7",
    soundName: "alarm",
    position: "center",
    durationMs: 9000,
    animation: "wiggle",
  },
};

const watch = (over: Partial<CastWatch> = {}): CastWatch => ({ id: "w1", spell: "Fear", enabled: true, ...over });

function settings(watches: CastWatch[], styles: NamedAlertStyle[] = [LOUD]): CastAlertSettings {
  return {
    enabled: true,
    sound: false,
    flash: false,
    includeSelf: false,
    watches,
    styles,
    color: "#e5534b",
    soundName: "chirp",
    position: "top",
    durationMs: 6000,
    animation: "pulse",
    locations: [],
  };
}

// ── which path an edit takes ───────────────────────────────────────────────────

test("a rule on the defaults forks, because the defaults belong to every rule", () => {
  assert.equal(plan(settings([watch()]), watch()).mode, "fork");
});

test("a rule wearing a style nobody else wears edits it in place", () => {
  const w = watch({ styleId: "loud" });
  assert.equal(plan(settings([w]), w).mode, "in-place");
});

test("a rule wearing a style somebody else wears forks", () => {
  const a = watch({ id: "a", styleId: "loud" });
  const b = watch({ id: "b", styleId: "loud" });
  assert.equal(plan(settings([a, b]), a).mode, "fork");
});

test("a rule with a look of its own edits it in place — nobody else can be wearing it", () => {
  const w = watch({ style: { color: "#46c86b" } });
  assert.equal(plan(settings([w]), w).mode, "own");
});

test("the note says which of the three it is, before the change is made", () => {
  const a = watch({ id: "a", styleId: "loud" });
  const b = watch({ id: "b", styleId: "loud" });
  assert.match(plan(settings([a, b]), a).note, /2 rules wear “Loud”/);
  assert.match(plan(settings([a, b]), a).note, /Saved styles/); // and where the shared edit lives
  assert.match(plan(settings([a]), a).note, /No other rule wears it/);
});

// ── forking ────────────────────────────────────────────────────────────────────

test("forking makes a new style, points the rule at it, and leaves the shared one alone", () => {
  const a = watch({ id: "a", styleId: "loud" });
  const b = watch({ id: "b", styleId: "loud" });
  const before = settings([a, b]);
  const edit = applyStyleEdit(before, a, { color: "#46c86b" });

  assert.equal(edit.styles.length, 2);
  const fresh = edit.styles[1];
  assert.equal(fresh.style.color, "#46c86b");
  assert.equal(edit.watch.styleId, fresh.id);
  // The style the other rule wears is untouched, which is the whole point.
  assert.deepEqual(edit.styles[0], LOUD);
  assert.match(edit.said ?? "", /Made a new style/);
});

test("the copy starts from what the rule looked like a moment ago, not from the defaults", () => {
  const a = watch({ id: "a", styleId: "loud" });
  const b = watch({ id: "b", styleId: "loud" });
  const edit = applyStyleEdit(settings([a, b]), a, { color: "#46c86b" });
  const fresh = edit.styles[1].style;
  assert.equal(fresh.soundName, "alarm"); // …from Loud
  assert.equal(fresh.animation, "wiggle");
  assert.equal(fresh.color, "#46c86b"); // …plus the one change
});

test("a fork off the defaults carries the defaults' own values", () => {
  const w = watch();
  const edit = applyStyleEdit(settings([w], []), w, { animation: "float" });
  assert.equal(edit.styles.length, 1);
  assert.equal(edit.styles[0].style.color, "#e5534b"); // the default red
  assert.equal(edit.styles[0].style.animation, "float");
  assert.equal(edit.watch.styleId, edit.styles[0].id);
});

test("forking clears the rule's own layer, so the picker can't be lying", () => {
  // Both fields set is only reachable from an older build; after any edit it must not persist.
  const a = watch({ id: "a", styleId: "loud", style: { color: "#ffffff" } });
  const b = watch({ id: "b", styleId: "loud" });
  const edit = applyStyleEdit(settings([a, b]), a, { durationMs: 3000 });
  assert.equal(edit.watch.style, undefined);
  // …and what it looked like — its own white — is baked into the copy rather than lost.
  assert.equal(edit.styles[1].style.color, "#ffffff");
  assert.equal(edit.styles[1].style.durationMs, 3000);
});

test("a forked rule then edits its own copy in place, rather than forking again", () => {
  const a = watch({ id: "a", styleId: "loud" });
  const b = watch({ id: "b", styleId: "loud" });
  const first = applyStyleEdit(settings([a, b]), a, { color: "#46c86b" });
  const after = settings([{ ...a, ...first.watch }, b], first.styles);
  assert.equal(plan(after, after.watches[0]).mode, "in-place");
  const second = applyStyleEdit(after, after.watches[0], { durationMs: 3000 });
  assert.equal(second.styles.length, 2); // no third style
  assert.equal(second.styles[1].style.durationMs, 3000);
});

// ── the other two paths ────────────────────────────────────────────────────────

test("editing in place changes the style itself, and the rule not at all", () => {
  const w = watch({ styleId: "loud" });
  const edit = applyStyleEdit(settings([w]), w, { color: "#46c86b" });
  assert.equal(edit.styles.length, 1);
  assert.equal(edit.styles[0].style.color, "#46c86b");
  assert.deepEqual(edit.watch, {});
});

test("editing a rule's own look touches nothing shared", () => {
  const w = watch({ style: { color: "#46c86b" } });
  const edit = applyStyleEdit(settings([w]), w, { durationMs: 3000 });
  assert.deepEqual(edit.styles, [LOUD]);
  assert.deepEqual(edit.watch.style, { color: "#46c86b", durationMs: 3000 });
});

test("a rule's own look can be promoted into the shared list, looking identical either side", () => {
  const w = watch({ style: { color: "#46c86b" } });
  const before = settings([w]);
  const edit = nameOwnStyle(before, w);
  const fresh = edit.styles[edit.styles.length - 1];
  assert.equal(edit.watch.styleId, fresh.id);
  assert.equal(edit.watch.style, undefined);
  // The point of promoting: nothing about how it looks changes.
  const after = settings([{ ...w, ...edit.watch }], edit.styles);
  assert.deepEqual(alertStyle(after, after.watches[0]), alertStyle(before, w));
});

// ── names and counting ─────────────────────────────────────────────────────────

test("a copy is named after what it came from, and never collides", () => {
  assert.equal(nextStyleName([LOUD], "Loud"), "Loud copy");
  assert.equal(nextStyleName([LOUD, { ...LOUD, id: "x", name: "Loud copy" }], "Loud"), "Loud copy 2");
  assert.equal(nextStyleName([LOUD]), "Style 2");
});

test("wearers are counted, which is what makes shared visible before it bites", () => {
  const a = watch({ id: "a", styleId: "loud" });
  const b = watch({ id: "b", styleId: "loud" });
  const c = watch({ id: "c" });
  assert.equal(styleWearers(settings([a, b, c]), "loud"), 2);
  assert.equal(styleWearers(settings([c]), "loud"), 0);
});

test("a style that was deleted is worn by nobody, and edits fork off the defaults", () => {
  const w = watch({ styleId: "gone" });
  const s = settings([w], []);
  assert.equal(wornStyle(s, w), undefined);
  assert.equal(plan(s, w).mode, "fork");
});
