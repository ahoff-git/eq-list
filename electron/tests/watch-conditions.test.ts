/**
 * Black-box tests for a watch's conditions: the fields, the operators, all-versus-any, and
 * exclusions — plus the property everything else rests on, that a watch with no conditions behaves
 * exactly as it did when a watch was one substring.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  activeConditions,
  conditionHolds,
  conditionMatches,
  conditionsHold,
  describeCondition,
  watchSpeaks,
  type WatchSubject,
} from "../../src/shared/watch-conditions";
import type { CastWatch, WatchCondition } from "../../src/shared/types";

const CAST: WatchSubject = {
  subject: "Mesmerize",
  caster: "a dark elf priest",
  line: "a dark elf priest begins casting Mesmerize.",
  zone: "Lower Guk",
};

const cond = (over: Partial<WatchCondition>): WatchCondition => ({
  field: "subject",
  op: "contains",
  text: "",
  ...over,
});
const watch = (over: Partial<CastWatch> = {}): CastWatch => ({ id: "w", spell: "Mesmeri", enabled: true, ...over });

// ── the fields ─────────────────────────────────────────────────────────────────

test("each field reads its own part of what the log said", () => {
  assert.equal(conditionMatches(cond({ field: "subject", text: "mesmer" }), CAST), true);
  assert.equal(conditionMatches(cond({ field: "caster", text: "dark elf" }), CAST), true);
  assert.equal(conditionMatches(cond({ field: "line", text: "begins casting" }), CAST), true);
  assert.equal(conditionMatches(cond({ field: "zone", text: "guk" }), CAST), true);
  // The subject is the spell here, so the sentence around it is *not* in it.
  assert.equal(conditionMatches(cond({ field: "subject", text: "begins casting" }), CAST), false);
});

test("a field the event hasn't got matches nothing rather than everything", () => {
  const line: WatchSubject = { subject: "Bunnyslayer invites you", line: "Bunnyslayer invites you" };
  assert.equal(conditionMatches(cond({ field: "caster", text: "bunny" }), line), false);
  assert.equal(conditionMatches(cond({ field: "zone", text: "guk" }), line), false);
  assert.equal(conditionMatches(cond({ field: "target", text: "pet" }), line), false);
  // …and an *excluded* condition on an absent field is satisfied, which is the honest reading:
  // "not from BunnySlayer" is true of a line that names no caster.
  assert.equal(conditionHolds(cond({ field: "caster", text: "bunny", exclude: true }), line), true);
});

// ── the operators ──────────────────────────────────────────────────────────────

test("the four operators do what they say, case-insensitively", () => {
  const c = (op: WatchCondition["op"], text: string) => conditionMatches(cond({ field: "caster", op, text }), CAST);
  assert.equal(c("contains", "ELF"), true);
  assert.equal(c("exact", "a dark elf priest"), true);
  assert.equal(c("exact", "dark elf"), false);
  assert.equal(c("starts", "a dark"), true);
  assert.equal(c("starts", "dark"), false);
  assert.equal(c("ends", "priest"), true);
  assert.equal(c("ends", "dark"), false);
});

test("`exact` is what tells one player from another whose name starts the same", () => {
  const subject: WatchSubject = { subject: "Charm", caster: "Bunnyslayerson", line: "…" };
  assert.equal(conditionMatches(cond({ field: "caster", op: "contains", text: "Bunnyslayer" }), subject), true);
  assert.equal(conditionMatches(cond({ field: "caster", op: "exact", text: "Bunnyslayer" }), subject), false);
});

// ── all / any / not ────────────────────────────────────────────────────────────

test("with no conditions a watch is exactly its trigger, as it always was", () => {
  assert.equal(conditionsHold(watch(), CAST, true), true);
  assert.equal(conditionsHold(watch(), CAST, false), false);
  assert.equal(conditionsHold(watch({ conditions: [] }), CAST, true), true);
  // …and `any` changes nothing when there is nothing to be "any" of.
  assert.equal(conditionsHold(watch({ match: "any" }), CAST, false), false);
});

test("all: every included condition has to hold as well as the trigger", () => {
  const w = watch({ conditions: [cond({ field: "zone", text: "Lower Guk" })] });
  assert.equal(conditionsHold(w, CAST, true), true);
  assert.equal(conditionsHold(w, { ...CAST, zone: "Befallen" }, true), false);
  assert.equal(conditionsHold(w, CAST, false), false); // the trigger still has to hit
});

test("any: one watch covers two spellings the trigger can't", () => {
  const w = watch({ spell: "Mesmeri", match: "any", conditions: [cond({ text: "Dazzle" })] });
  assert.equal(conditionsHold(w, CAST, true), true); // the trigger
  assert.equal(conditionsHold(w, { ...CAST, subject: "Dazzle" }, false), true); // the condition
  assert.equal(conditionsHold(w, { ...CAST, subject: "Root" }, false), false); // neither
});

test("an exclusion is a veto, even under `any`", () => {
  // Otherwise "any" would read as "or not from a warder", which is nobody's meaning.
  const w = watch({
    match: "any",
    conditions: [cond({ text: "Dazzle" }), cond({ field: "caster", text: "warder", exclude: true })],
  });
  assert.equal(conditionsHold(w, CAST, true), true);
  assert.equal(conditionsHold(w, { ...CAST, caster: "Kainos`s warder" }, true), false);
  assert.equal(conditionsHold(w, { ...CAST, subject: "Dazzle", caster: "Kainos`s warder" }, false), false);
});

test("exclusions alone can carry a watch that has only a trigger", () => {
  const w = watch({ conditions: [cond({ field: "caster", text: "BunnySlayer", op: "exact", exclude: true })] });
  assert.equal(conditionsHold(w, { ...CAST, caster: "BunnySlayer" }, true), false);
  assert.equal(conditionsHold(w, CAST, true), true);
});

// ── half-typed rows, and the watch that says nothing ───────────────────────────

test("a blank condition never changes what fires", () => {
  const w = watch({ conditions: [cond({ text: "  " })] });
  assert.equal(conditionsHold(w, CAST, true), true);
  assert.equal(conditionsHold(w, CAST, false), false);
  // Nor can a blank one carry an `any` match on its own.
  assert.equal(conditionsHold(watch({ match: "any", conditions: [cond({ text: " " })] }), CAST, false), false);
  // Nor veto as an exclusion.
  assert.equal(conditionsHold(watch({ conditions: [cond({ text: "", exclude: true })] }), CAST, true), true);
});

test("a blank trigger steps aside for conditions instead of failing them", () => {
  // "anything that dark elf casts" — a watch that is nothing but a condition.
  const w = watch({ spell: "", conditions: [cond({ field: "caster", text: "dark elf" })] });
  assert.equal(conditionsHold(w, CAST, null), true);
  assert.equal(conditionsHold(w, { ...CAST, caster: "a gnoll" }, null), false);
});

test("a watch that says nothing at all matches nothing at all", () => {
  assert.equal(watchSpeaks(watch({ spell: "  " })), false);
  assert.equal(watchSpeaks(watch({ spell: "", conditions: [cond({ text: " " })] })), false);
  assert.equal(watchSpeaks(watch({ spell: "", conditions: [cond({ text: "dark elf" })] })), true);
  assert.equal(watchSpeaks(watch()), true);
  // Belt and braces: even asked directly, it holds nothing.
  assert.equal(conditionsHold(watch({ spell: "" }), CAST, null), false);
});

// ── saying it back to the user ─────────────────────────────────────────────────

test("a condition describes itself in words, including when inverted", () => {
  assert.equal(describeCondition(cond({ field: "caster", op: "exact", text: "BunnySlayer" })), "caster is BunnySlayer");
  assert.equal(
    describeCondition(cond({ field: "caster", op: "exact", text: "BunnySlayer", exclude: true })),
    "caster isn't BunnySlayer",
  );
  assert.equal(describeCondition(cond({ field: "zone", text: "Guk" })), "zone has Guk");
  assert.equal(describeCondition(cond({ field: "line", op: "starts", text: "You" })), "line starts You");
  // A row still being typed says so rather than reading as a rule about nothing.
  assert.equal(describeCondition(cond({ field: "subject", text: "  " })), "text has …");
});

test("activeConditions counts only the rows that do something", () => {
  assert.equal(activeConditions(undefined).length, 0);
  assert.equal(activeConditions([cond({ text: "a" }), cond({ text: " " })]).length, 1);
});
