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
  ALERT_SOURCES,
  BUILT_IN_STYLES,
  LOOT_STYLE_ID,
  RECORD_STYLE_ID,
  SPAWN_STYLE_ID,
  alertStyle,
  applyStyleEdit,
  defaultsUse,
  describeArmed,
  describeUse,
  nameOwnStyle,
  nextStyleName,
  plan,
  stickySource,
  styleUse,
  styleWearers,
  withStyleName,
  withoutStyle,
  wornStyle,
} from "../../src/shared/alert-styles";
import type { AlertSource } from "../../src/shared/alert-styles";
import type { CastAlertSettings, CastWatch, NamedAlertStyle } from "../../src/shared/types";

/** A source by id, so a test names the feature it means rather than an index. */
const source = (id: AlertSource["id"]): AlertSource => {
  const found = ALERT_SOURCES.find((s) => s.id === id);
  assert.ok(found, `no ${id} source`);
  return found;
};

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
  assert.match(plan(settings([a, b]), a).note, /“Loud” is worn by 2 rules/);
  assert.match(plan(settings([a, b]), a).note, /Saved styles/); // and where the shared edit lives
  assert.match(plan(settings([a]), a).note, /Nothing else wears it/);
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

// ── the app's own alert sources, and the looks they're built on ────────────────
//
// The property under these: **a style is worn by whoever wears it, not just by the rules.** Counting
// rules alone made two different things wrong in the same direction — a ✕ that claimed nothing would
// happen, and an in-place edit that changed something the player wasn't looking at — and both were
// the one missing count.

/** With the shipped looks present, which is how every real settings file arrives. */
const shipped = (watches: CastWatch[] = [], extra: NamedAlertStyle[] = [LOUD]): CastAlertSettings =>
  settings(watches, [...BUILT_IN_STYLES, ...extra]);

test("the look a feature is built on is sticky; a hand-made one is not", () => {
  assert.equal(stickySource(LOOT_STYLE_ID)?.label, "Loot drops");
  assert.equal(stickySource(SPAWN_STYLE_ID)?.label, "Spawn timers");
  assert.equal(stickySource(RECORD_STYLE_ID)?.label, "Personal bests");
  assert.equal(stickySource("loud"), undefined);
});

test("every shipped look is sticky, so a fourth source can't arrive un-protected", () => {
  for (const style of BUILT_IN_STYLES) assert.ok(stickySource(style.id), `${style.name} is deletable`);
});

test("a sticky look survives deletion; an ordinary one goes", () => {
  const styles = [...BUILT_IN_STYLES, LOUD];
  assert.equal(withoutStyle(styles, LOOT_STYLE_ID).length, styles.length);
  assert.ok(withoutStyle(styles, LOOT_STYLE_ID).some((s) => s.id === LOOT_STYLE_ID));
  assert.equal(withoutStyle(styles, "loud").length, styles.length - 1);
});

test("a sticky look keeps its name — a feature's row names it, so the name can't drift", () => {
  const styles = [...BUILT_IN_STYLES, LOUD];
  const renamed = withStyleName(styles, LOOT_STYLE_ID, "Whatever");
  assert.equal(renamed.find((s) => s.id === LOOT_STYLE_ID)?.name, "Loot");
  assert.equal(withStyleName(styles, "loud", "Quiet").find((s) => s.id === "loud")?.name, "Quiet");
});

// ── who wears what ─────────────────────────────────────────────────────────────

test("loot alerts are counted as a wearer of their look, which is what read “worn by 0”", () => {
  const use = styleUse(shipped(), LOOT_STYLE_ID);
  assert.deepEqual(use.features, ["Loot drops"]);
  assert.equal(use.rules, 0);
  assert.equal(use.total, 1);
  assert.equal(describeUse(use), "worn by Loot drops");
});

test("rules and features are counted together", () => {
  const w = watch({ styleId: LOOT_STYLE_ID });
  const use = styleUse(shipped([w]), LOOT_STYLE_ID);
  assert.equal(use.rules, 1);
  assert.deepEqual(use.features, ["Loot drops"]);
  assert.equal(describeUse(use), "worn by 1 rule · Loot drops");
});

test("a style nothing wears says so, rather than showing a bare nought", () => {
  assert.equal(describeUse(styleUse(shipped(), "loud")), "worn by nobody");
});

test("a spawn timer wearing a hand-made look is a wearer of it", () => {
  const use = styleUse(shipped(), "loud", { spawns: [{ notify: true, styleId: "loud" }, { notify: false }] });
  assert.deepEqual(use.features, ["Spawn timers"]);
  assert.equal(use.total, 1);
});

test("every timer that picked nothing wears the shipped spawn look", () => {
  const spawns = [{ notify: true }, { notify: false }, { notify: true, styleId: "loud" }];
  assert.equal(styleUse(shipped(), SPAWN_STYLE_ID, { spawns }).total, 2);
});

test("the celebration is only a wearer of what it actually points at", () => {
  const pointed = { highScores: { celebrate: true, styleId: "loud" } };
  assert.deepEqual(styleUse(shipped(), "loud", pointed).features, ["Personal bests"]);
  assert.deepEqual(styleUse(shipped(), RECORD_STYLE_ID, pointed).features, []);
  // Pointed at the alert defaults — no saved style — so it wears none of them.
  const defaults = { highScores: { celebrate: true } };
  assert.deepEqual(styleUse(shipped(), RECORD_STYLE_ID, defaults).features, []);
});

test("wearing is counted whether or not the thing is armed — arming flips at any moment", () => {
  const silent = { spawns: [{ notify: false, styleId: "loud" }], lootArmed: 0 };
  assert.equal(styleUse(shipped(), "loud", silent).total, 1);
  assert.equal(styleUse(shipped(), LOOT_STYLE_ID, silent).total, 1);
});

// ── what a row says ───────────────────────────────────────────────────────────

test("a source says how many things are armed, in words rather than a nought", () => {
  assert.equal(describeArmed(source("loot"), { lootArmed: 2 }), "2 list rows armed");
  assert.equal(describeArmed(source("loot"), { lootArmed: 0 }), "nothing armed");
  assert.equal(describeArmed(source("loot"), {}), "nothing armed");
  assert.equal(describeArmed(source("spawn"), { spawns: [{ notify: true }, { notify: false }] }), "1 timer armed");
});

test("a source that is one switch says on or off, having nothing to count", () => {
  assert.equal(describeArmed(source("record"), { highScores: { celebrate: true } }), "on");
  assert.equal(describeArmed(source("record"), { highScores: { celebrate: false } }), "off");
});

// ── and what that means for an edit from a rule ───────────────────────────────

test("a rule wearing a feature's look forks — “make this rule green” must not repaint every drop", () => {
  const w = watch({ styleId: LOOT_STYLE_ID });
  const before = shipped([w]);
  assert.equal(plan(before, w).mode, "fork");
  assert.match(plan(before, w).note, /Loot drops/);

  const edit = applyStyleEdit(before, w, { color: "#46c86b" });
  // The shipped look is untouched, and the rule wears a copy of it.
  assert.equal(edit.styles.find((s) => s.id === LOOT_STYLE_ID)?.style.color, "#d4a03c");
  assert.equal(edit.styles.find((s) => s.id === edit.watch.styleId)?.style.color, "#46c86b");
  assert.notEqual(edit.watch.styleId, LOOT_STYLE_ID);
});

test("a rule sharing a hand-made look with a spawn timer forks too, once the timer is known about", () => {
  const w = watch({ styleId: "loud" });
  const before = shipped([w]);
  // Nobody told it about the timer: the only wearer it can see is the rule itself.
  assert.equal(plan(before, w).mode, "in-place");
  assert.equal(plan(before, w, { spawns: [{ notify: true, styleId: "loud" }] }).mode, "fork");
});

test("the defaults are worn by the rules that picked nothing, and by a celebration pointed here", () => {
  const bare = watch({ id: "bare" });
  const dressed = watch({ id: "dressed", styleId: "loud" });
  const pointed = { highScores: { celebrate: true, styleId: RECORD_STYLE_ID } };
  assert.equal(describeUse(defaultsUse(shipped([bare, dressed]), pointed)), "worn by 1 rule");
  // Pointed at "Alert defaults" on the Records board: the defaults gain a wearer no id could find.
  const off = { highScores: { celebrate: true } };
  assert.deepEqual(defaultsUse(shipped([bare]), off).features, ["Personal bests"]);
});
