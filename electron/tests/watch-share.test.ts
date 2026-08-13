/**
 * Black-box tests for handing a rule to somebody else.
 *
 * Two properties matter, and they pull in opposite directions: a rule has to survive the round trip
 * **whole** — every field that makes it work — while an import has to treat the string as what it is,
 * text from a stranger's clipboard. Most of what follows is the second half.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeWatches, encodeWatches, SHARE_PREFIX } from "../../src/shared/watch-share";
import type { CastWatch } from "../../src/shared/types";

let n = 0;
const newId = () => `id-${++n}`;
const watch = (over: Partial<CastWatch> = {}): CastWatch => ({ id: "local", spell: "Mesmeri", enabled: true, ...over });

/** The full-fat rule: every field a share string has to carry. */
const RICH = watch({
  spell: "Mesmeri",
  message: "RECAST MEZ",
  match: "any",
  onCast: true,
  onFade: true,
  onLine: true,
  includePlayers: true,
  includeSelf: true,
  delay: "25",
  repeat: 2,
  retrigger: "queue",
  cancelOnDeath: "never",
  conditions: [
    { field: "caster", op: "contains", text: "warder", exclude: true },
    { field: "zone", op: "exact", text: "Lower Guk" },
  ],
  cancelWhen: [{ field: "line", op: "contains", text: "has been slain" }],
});

test("a rule survives the round trip whole, but for what shouldn't travel", () => {
  const { watches, errors } = decodeWatches(encodeWatches([RICH]), newId);
  assert.deepEqual(errors, []);
  assert.equal(watches.length, 1);
  const { id, enabled, ...back } = watches[0];
  const { id: _id, enabled: _enabled, ...sent } = RICH;
  assert.deepEqual(back, sent);
  assert.notEqual(id, RICH.id); // a fresh id, so an import can't overwrite a rule you already have
  assert.equal(enabled, true);
});

test("a share code is one line, prefixed, and survives being pasted into chat", () => {
  const code = encodeWatches([RICH]);
  assert.ok(code.startsWith(SHARE_PREFIX));
  assert.equal(code.includes("\n"), false);
  assert.deepEqual(decodeWatches(`  ${code}  `, newId).errors, []);
});

test("the sender's look stays the sender's", () => {
  // A styleId points at a saved style the recipient hasn't got; a full style imposes their colours.
  const styled = watch({ styleId: "theirs", style: { color: "#ff0000" } });
  const [back] = decodeWatches(encodeWatches([styled]), newId).watches;
  assert.equal(back.styleId, undefined);
  assert.equal(back.style, undefined);
});

test("several rules travel together", () => {
  const { watches } = decodeWatches(encodeWatches([watch({ spell: "Fear" }), watch({ spell: "Charm" })]), newId);
  assert.deepEqual(watches.map((w) => w.spell), ["Fear", "Charm"]);
  // …with ids that differ from each other, not just from the originals.
  assert.notEqual(watches[0].id, watches[1].id);
});

test("hand-written JSON is accepted, in all three shapes a person ends up with", () => {
  const one = '{"spell":"Fear","onLine":true}';
  assert.equal(decodeWatches(one, newId).watches[0].spell, "Fear");
  assert.equal(decodeWatches(`[${one}]`, newId).watches[0].onLine, true);
  assert.equal(decodeWatches(`{"v":1,"watches":[${one}]}`, newId).watches.length, 1);
});

// ── text from a stranger ───────────────────────────────────────────────────────

test("nonsense is refused with a sentence, not an exception", () => {
  for (const junk of ["", "   ", "hello", "EQLW1:not-base-64!!", "EQLW1:" + btoa("{oops"), "[1,2,3]", '"a string"']) {
    const result = decodeWatches(junk, newId);
    assert.deepEqual(result.watches, []);
    assert.ok(result.errors.length, `expected an error for ${JSON.stringify(junk)}`);
  }
});

test("a rule that can't match anything is refused rather than added as a dud", () => {
  const { watches, errors } = decodeWatches('{"spell":"   "}', newId);
  assert.deepEqual(watches, []);
  assert.match(errors[0], /couldn't be read/);
});

test("unknown keys are dropped rather than carried", () => {
  const [back] = decodeWatches('{"spell":"Fear","evil":true,"__proto__":{"x":1}}', newId).watches;
  assert.equal("evil" in back, false);
  assert.equal(({} as Record<string, unknown>).x, undefined); // nothing leaked onto Object.prototype
});

test("values of the wrong type are dropped, not coerced into something surprising", () => {
  const [back] = decodeWatches(
    '{"spell":"Fear","delay":25,"repeat":"lots","match":"whatever","retrigger":"explode","cancelOnDeath":1,"onFade":"yes"}',
    newId,
  ).watches;
  assert.equal(back.delay, undefined); // a delay is text; a number isn't the syntax
  assert.equal(back.repeat, undefined);
  assert.equal(back.match, undefined);
  assert.equal(back.retrigger, undefined);
  assert.equal(back.cancelOnDeath, undefined);
  assert.equal(back.onFade, undefined);
});

test("a condition that isn't one is dropped without failing the rule around it", () => {
  const [back] = decodeWatches(
    '{"spell":"Fear","conditions":[{"field":"nope","op":"contains","text":"x"},{"field":"line","op":"regex","text":"x"},{"field":"line","op":"contains","text":""},{"field":"line","op":"contains","text":"real"}]}',
    newId,
  ).watches;
  assert.deepEqual(back.conditions, [{ field: "line", op: "contains", text: "real" }]);
});

test("a hostile paste is capped rather than accepted whole", () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ spell: `w${i}` }));
  const { watches, errors } = decodeWatches(JSON.stringify(many), newId);
  assert.equal(watches.length, 50);
  assert.match(errors.join(" "), /Only the first 50/);
  // Long text is clamped rather than stored whole.
  const [long] = decodeWatches(JSON.stringify({ spell: "x".repeat(5000) }), newId).watches;
  assert.equal(long.spell.length, 200);
});

test("what fails partly says what it refused", () => {
  const { watches, errors } = decodeWatches('[{"spell":"Fear"},{"nothing":true},{"spell":"Charm"}]', newId);
  assert.deepEqual(watches.map((w) => w.spell), ["Fear", "Charm"]);
  assert.match(errors[0], /Rule 2/);
});

test("text EQ actually prints survives the encoding", () => {
  // The backtick in a pet's name, and anything above ASCII, are why this isn't plain btoa.
  const odd = watch({ spell: "Kainos`s warder", message: "★ ré-cast — now" });
  const [back] = decodeWatches(encodeWatches([odd]), newId).watches;
  assert.equal(back.spell, "Kainos`s warder");
  assert.equal(back.message, "★ ré-cast — now");
});
