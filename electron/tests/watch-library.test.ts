/**
 * A review of the shipped rule library, in the spirit of `zone-gazetteer.test.ts`: this is data
 * meant to be read and copied, so what's pinned is that **every entry is sound by the app's own
 * rules** — checked with the same `checkWatch` a hand-made rule is held to.
 *
 * A preset that warns the moment it's added would teach the wrong lesson twice over: it would look
 * like the app is broken, and it would be a worked example of a mistake.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdded, WATCH_LIBRARY, type LibraryRule } from "../../src/shared/watch-library";
import { checkWatch } from "../../src/shared/watch-check";
import { alertCue } from "../../src/shared/alert-schedule";
import type { CastWatch } from "../../src/shared/types";

const rules: LibraryRule[] = WATCH_LIBRARY.flatMap((g) => g.rules);

/** A name has to be more than an abbreviation, and an explanation more than a label. */
const SHORTEST_NAME = 3;
const SHORTEST_EXPLANATION = 40;
/** Example words a preset can't know for the player — each one obliges a `fill` note. */
const PLACEHOLDER_WORDS = /placeholder|Nagafen|Lower Guk/;
const asWatch = (rule: LibraryRule): CastWatch => ({ id: rule.id, enabled: true, ...rule.watch });

test("every library rule passes the same check a hand-made one does", () => {
  for (const rule of rules) {
    const issues = checkWatch(asWatch(rule));
    assert.deepEqual(issues, [], `${rule.id}: ${issues.map((i) => i.message).join(" | ")}`);
  }
});

test("every rule is identifiable, named, and explains itself", () => {
  const ids = new Set<string>();
  for (const rule of rules) {
    assert.equal(ids.has(rule.id), false, `duplicate id ${rule.id}`);
    ids.add(rule.id);
    assert.ok(rule.name.length >= SHORTEST_NAME, `${rule.id} needs a name`);
    // The sentence is the whole reason a library beats an empty row, so it isn't optional.
    assert.ok(rule.what.length > SHORTEST_EXPLANATION, `${rule.id} needs to say what it is for`);
  }
});

test("a rule whose trigger only the player knows says so", () => {
  // The failure this prevents: a preset that looks finished, matches nothing, and reads as a bug.
  for (const rule of rules) {
    const placeholder = PLACEHOLDER_WORDS.test(rule.watch.spell + JSON.stringify(rule.watch.conditions ?? []));
    if (placeholder) assert.ok(rule.fill, `${rule.id} carries an example word, so it needs a fill note`);
  }
});

test("every repeating rule can be stopped, and its repeat is actually granted", () => {
  // Not every cue needs a brake — an 8-minute spawn reminder should fire once and be done, and
  // saying so is deliberate. A cue that keeps *coming back* is the one that must be endable.
  for (const rule of rules) {
    if (!rule.watch.repeat) continue;
    const cue = alertCue(rule.watch);
    assert.ok(cue.stoppable, `${rule.id} repeats with nothing able to stop it`);
    assert.equal(cue.repeat, rule.watch.repeat, `${rule.id}'s repeat was refused`);
  }
});

test("a rule that reads its own casts says so per watch, not by asking for the group setting", () => {
  // "Recast your mez" is only ever about you; it must not need `includeSelf` turned on for everything.
  const remez = rules.find((r) => r.id === "remez");
  assert.equal(remez?.watch.includeSelf, true);
});

test("the groups are named and none is empty", () => {
  for (const group of WATCH_LIBRARY) {
    assert.ok(group.category.length >= SHORTEST_NAME);
    assert.ok(group.rules.length > 0, `${group.category} is empty`);
  }
});

test("isAdded matches on what a rule catches, not on what it's called", () => {
  const rule = rules[0];
  const added: CastWatch = { ...asWatch(rule), id: "mine", message: "my own wording" };
  assert.equal(isAdded([added], rule), true);
  assert.equal(isAdded([], rule), false);
  // Same words pointed at a different kind of line is a different rule.
  assert.equal(isAdded([{ ...added, onLine: !rule.watch.onLine }], rule), false);
});
