/**
 * Black-box tests for the two ways a rule is checked: the static "this cannot do what it looks
 * like" pass, and the replay that says what it *would* have done to lines the log really produced.
 *
 * The replay's fixture lines are verbatim shapes from a real log, because the whole point of it is
 * to answer "does my wording match the game's" — a fixture written to suit the matcher would prove
 * nothing at all.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canDryRun, checkWatch, dryRun } from "../../src/shared/watch-check";
import { splitLine } from "../../src/shared/log-parser";
import type { CastAlertSettings, CastWatch, LogLine } from "../../src/shared/types";

const watch = (over: Partial<CastWatch> = {}): CastWatch => ({ id: "w", spell: "Mesmeri", enabled: true, ...over });
const messages = (issues: { message: string }[]) => issues.map((i) => i.message).join(" | ");

// ── it cannot fire ─────────────────────────────────────────────────────────────

test("a watch with nothing to match on is an error, not a warning", () => {
  const [issue] = checkWatch(watch({ spell: "  " }));
  assert.equal(issue.level, "error");
  assert.match(issue.message, /never fire/);
  // A watch carried entirely by a condition is sound.
  assert.deepEqual(checkWatch(watch({ spell: "", conditions: [{ field: "caster", op: "exact", text: "Bunny" }] })), []);
});

test("a watch ticked for no prompts can't be reached", () => {
  assert.match(messages(checkWatch(watch({ onCast: false }))), /Nothing is ticked/);
});

test("excluding the very words you match on can never fire", () => {
  const impossible = watch({ conditions: [{ field: "subject", op: "contains", text: "Mesmeri", exclude: true }] });
  assert.equal(checkWatch(impossible)[0].level, "error");
  assert.match(messages(checkWatch(impossible)), /excludes the very words/);
  // Under `any` it's merely narrowing, since the trigger isn't the only way in.
  assert.deepEqual(checkWatch({ ...impossible, match: "any" }), []);
});

test("errors sort above warnings, since one of them means it can't work at all", () => {
  const both = watch({ spell: "", delay: "soon" });
  assert.equal(checkWatch(both)[0].level, "error");
});

// ── a condition that can never hold ────────────────────────────────────────────

test("a caster condition on a watch that doesn't watch casts is called out", () => {
  const fadeOnly = watch({ onCast: false, onFade: true, conditions: [{ field: "caster", op: "contains", text: "elf" }] });
  assert.match(messages(checkWatch(fadeOnly)), /only a cast names a caster/);
  // On a cast watch it's ordinary.
  assert.deepEqual(checkWatch(watch({ conditions: [{ field: "caster", op: "contains", text: "elf" }] })), []);
});

test("a target condition needs a fade, and an exclusion is exempt", () => {
  assert.match(
    messages(checkWatch(watch({ conditions: [{ field: "target", op: "exact", text: "your pet" }] }))),
    /only a fade names who it wore off/,
  );
  // "not on my pet" is *satisfied* by an event with no target, which is the honest reading.
  assert.deepEqual(
    checkWatch(watch({ conditions: [{ field: "target", op: "exact", text: "your pet", exclude: true }] })),
    [],
  );
});

// ── aim ────────────────────────────────────────────────────────────────────────

test("a very short raw-text trigger is flagged as too wide", () => {
  assert.match(messages(checkWatch(watch({ spell: "hit", onLine: true }))), /short for raw text/);
  // The same words as a spell watch are fine: a spell name is a much smaller haystack.
  assert.deepEqual(checkWatch(watch({ spell: "hit" })), []);
});

test("two watches aimed at exactly the same thing: only the first can fire", () => {
  const a = watch({ id: "a" });
  const b = watch({ id: "b" });
  assert.match(messages(checkWatch(a, [b])), /Another enabled watch/);
  // Different prompts, different conditions, or disabled — all different enough.
  assert.deepEqual(checkWatch(a, [{ ...b, onFade: true, onCast: false }]), []);
  assert.deepEqual(checkWatch(a, [{ ...b, conditions: [{ field: "zone", op: "contains", text: "Guk" }] }]), []);
  assert.deepEqual(checkWatch(a, [{ ...b, enabled: false }]), []);
  assert.deepEqual(checkWatch(a, [a]), []); // itself doesn't count
});

// ── timing ─────────────────────────────────────────────────────────────────────

test("the timing complaints are the ones the queue would silently apply", () => {
  assert.match(messages(checkWatch(watch({ delay: "soon" }))), /isn't a delay we can read/);
  assert.match(messages(checkWatch(watch({ delay: "8m", repeat: 3, cancelOnDeath: "never" }))), /able to stop it/);
  assert.match(messages(checkWatch(watch({ repeat: 3 }))), /only means something with a delay/);
  assert.match(
    messages(checkWatch(watch({ delay: "25", cancelWhen: [{ field: "line", op: "contains", text: "x", exclude: true }] }))),
    /can't be inverted/,
  );
  assert.match(
    messages(checkWatch(watch({ cancelWhen: [{ field: "line", op: "contains", text: "slain" }] }))),
    /nothing to cancel/,
  );
});

// ── the replay ─────────────────────────────────────────────────────────────────
// Real shapes: a cast the log names, a fade worded per spell, a group invite, a kill, a zone line.

const LOG = [
  "[Wed Jul 29 20:58:01 2026] You have entered Lower Guk.",
  "[Wed Jul 29 20:59:10 2026] a dark elf priest begins casting Mesmerization.",
  "[Wed Jul 29 20:59:14 2026] Bunnyslayer hits a wild tiger for 21 points of damage.",
  "[Wed Jul 29 21:00:02 2026] Bunnyslayer invites you to join a group.",
  "[Wed Jul 29 21:00:40 2026] a wild tiger has been slain by Bunnyslayer!",
  "[Wed Jul 29 21:01:00 2026] Your Root spell has worn off of a wild tiger.",
  "[Wed Jul 29 21:02:00 2026] a gnoll pup begins casting Mesmerize.",
];
const lines: LogLine[] = LOG.map((raw, i) => splitLine(raw, i)!).filter(Boolean);

const settings = (over: Partial<CastAlertSettings> = {}): CastAlertSettings => ({
  enabled: true,
  sound: false,
  flash: false,
  includeSelf: false,
  watches: [],
  color: "#e5534b",
  soundName: "chirp",
  position: "top",
  durationMs: 6000,
  animation: "pulse",
  locations: [],
  ...over,
});

test("the replay says which real lines a rule would have fired on", () => {
  const result = dryRun(watch(), settings(), lines);
  assert.equal(result.total, 2); // both mez casts
  assert.equal(result.scanned, lines.length);
  assert.equal(result.hits[0].event, "cast");
  // Newest first, so the answer reads like the log does.
  assert.match(result.hits[0].line, /a gnoll pup begins casting Mesmerize/);
});

test("a rule that matches nothing says so against a real number of lines", () => {
  const result = dryRun(watch({ spell: "Complete Heal" }), settings(), lines);
  assert.equal(result.total, 0);
  assert.equal(result.scanned, lines.length);
});

test("staleness is not applied — every replayed line is old by definition", () => {
  // The live matchers refuse anything older than 30s; a replay of last night would otherwise be
  // uniformly empty, which is exactly the answer that would look like a broken rule.
  const result = dryRun(watch(), settings(), lines);
  assert.ok(result.total > 0);
});

test("the rule is replayed alone, so the list can't shadow it", () => {
  // A watch earlier in the real list matching the same line must not change what this one reports.
  const shadow = settings({ watches: [{ id: "first", spell: "Mesmeri", enabled: true }] });
  assert.equal(dryRun(watch({ id: "second" }), shadow, lines).total, 2);
});

test("the replay works while alerts are switched off, which is when you'd be configuring", () => {
  assert.equal(dryRun(watch(), settings({ enabled: false }), lines).total, 2);
});

test("conditions are honoured, including the zone recovered from the log itself", () => {
  const here = watch({ conditions: [{ field: "zone", op: "contains", text: "Lower Guk" }] });
  assert.equal(dryRun(here, settings(), lines).total, 2);
  const elsewhere = watch({ conditions: [{ field: "zone", op: "contains", text: "Befallen" }] });
  assert.equal(dryRun(elsewhere, settings(), lines).total, 0);
});

test("an exclusion shows up as fewer hits, which is the point of testing one", () => {
  const notGnoll = watch({ conditions: [{ field: "caster", op: "contains", text: "gnoll", exclude: true }] });
  const result = dryRun(notGnoll, settings(), lines);
  assert.equal(result.total, 1);
  assert.match(result.hits[0].line, /dark elf priest/);
});

test("a fade rule and a raw-text rule each find their own kind of line", () => {
  const fade = watch({ spell: "Root", onCast: false, onFade: true });
  assert.equal(dryRun(fade, settings(), lines).hits[0].event, "fade");
  const invite = watch({ spell: "invites you", onCast: false, onLine: true });
  assert.equal(dryRun(invite, settings(), lines).hits[0].event, "line");
});

test("cancelling words are counted too, so a cue's brake can be tested as well as its trigger", () => {
  const cued = watch({ delay: "25", cancelWhen: [{ field: "line", op: "contains", text: "has been slain" }] });
  const result = dryRun(cued, settings(), lines);
  assert.equal(result.cancels, 1);
  // A rule with no cancelling words never counts any.
  assert.equal(dryRun(watch(), settings(), lines).cancels, 0);
});

test("your own casts follow the watch's own answer during a replay", () => {
  const mine = [splitLine("[Wed Jul 29 21:03:00 2026] You begin casting Mesmerize.", 99)!];
  assert.equal(dryRun(watch(), settings(), mine).total, 0);
  assert.equal(dryRun(watch({ includeSelf: true }), settings(), mine).total, 1);
});

test("the hit list is capped while the total isn't — a rule can be too eager to list", () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    splitLine(`[Wed Jul 29 21:0${i % 10}:00 2026] a gnoll pup begins casting Mesmerize.`, i)!,
  );
  const result = dryRun(watch(), settings(), many, 5);
  assert.equal(result.total, 40);
  assert.equal(result.hits.length, 5);
});

test("canDryRun refuses only the rule that could never match anything", () => {
  assert.equal(canDryRun(watch()), true);
  assert.equal(canDryRun(watch({ spell: " " })), false);
});
