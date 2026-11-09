/**
 * Black-box tests for which release notes a player is owed (`src/shared/releases/release-notes.ts`): the ones
 * between the build they last looked at and the one running, however many they skipped. Synthetic notes only —
 * the real changelog is held to its own rules in `changelog.test.ts`. Only need re-running if the module changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { changelogProblems, countFrom, historyProblems, nextSeen, notesSince, periodText, readSeen, releaseLine, updateHeadline, type HistoryNote, type ReleaseNote } from "../../src/shared/releases/release-notes";

const note = (line: string, over: Partial<ReleaseNote> = {}): ReleaseNote => ({
  line,
  date: "2026-01-01",
  title: `Title ${line}`,
  changes: [{ kind: "new", text: `Something in ${line}` }],
  ...over,
});
// Newest first, the way the data file keeps them.
const FIVE = ["0.5", "0.4", "0.3", "0.2", "0.1"].map((l) => note(l));
const lines = (ns: ReleaseNote[]) => ns.map((n) => n.line);

test("a release line is the two numbers a person sets — the build counter is not part of it", () => {
  assert.deepEqual(releaseLine("0.3.42"), [0, 3]);
  assert.deepEqual(releaseLine("v1.12.0-beta"), [1, 12]);
  assert.deepEqual(releaseLine("2"), [2, 0]);
  assert.equal(releaseLine(""), null);
  assert.equal(releaseLine("latest"), null);
});

test("going from v1 to v5 shows v2, v3, v4 and v5 — newest first, v1 not at all", () => {
  assert.deepEqual(lines(notesSince(FIVE, "0.1.40", "0.5.62")), ["0.5", "0.4", "0.3", "0.2"]);
});

test("one step shows one release; a later build of the same line shows nothing", () => {
  assert.deepEqual(lines(notesSince(FIVE, "0.4.9", "0.5.1")), ["0.5"]);
  assert.deepEqual(lines(notesSince(FIVE, "0.5.1", "0.5.62")), []);
  assert.deepEqual(lines(notesSince(FIVE, "0.5.62", "0.5.62")), []);
});

test("the build counter never outranks the line: 0.2.1 is newer than 0.1.999", () => {
  assert.deepEqual(lines(notesSince(FIVE, "0.1.999", "0.2.1")), ["0.2"]);
});

test("the order the notes are kept in doesn't matter", () => {
  const shuffled = [FIVE[3], FIVE[0], FIVE[4], FIVE[2], FIVE[1]];
  assert.deepEqual(lines(notesSince(shuffled, "0.1.0", "0.5.0")), ["0.5", "0.4", "0.3", "0.2"]);
});

test("with nothing remembered it is the newest note alone, not the whole history", () => {
  assert.deepEqual(lines(notesSince(FIVE, null, "0.5.62")), ["0.5"]);
  assert.deepEqual(lines(notesSince(FIVE, null, "0.3.1")), ["0.3"], "the newest this build has");
});

test("a version we can't read counts as nothing remembered, not as a crash", () => {
  assert.deepEqual(lines(notesSince(FIVE, "garbage" as string, "0.5.1")), ["0.5"]);
});

test("a note written ahead of its build is never announced by an older one", () => {
  assert.deepEqual(lines(notesSince(FIVE, "0.1.0", "0.3.8")), ["0.3", "0.2"]);
});

test("a rolled-back build announces nothing — it is behind what was seen", () => {
  assert.deepEqual(lines(notesSince(FIVE, "0.5.62", "0.3.2")), []);
});

test("a host with no version (the web build) has nothing to announce", () => {
  assert.deepEqual(notesSince(FIVE, null, ""), []);
  assert.deepEqual(notesSince(FIVE, "0.1.0", ""), []);
});

test("an empty changelog announces nothing", () => {
  assert.deepEqual(notesSince([], "0.1.0", "0.5.0"), []);
  assert.deepEqual(notesSince([], null, "0.5.0"), []);
});

// ── what to remember ──

test("once shown, the running version is what's remembered", () => {
  assert.equal(nextSeen("0.1.40", "0.5.62"), "0.5.62");
  assert.equal(nextSeen(null, "0.5.62"), "0.5.62");
  assert.equal(nextSeen("garbage", "0.5.62"), "0.5.62");
});

test("the marker never goes backwards — a dev build or a rollback can't make the next launch re-announce everything", () => {
  assert.equal(nextSeen("0.5.62", "0.5.0"), "0.5.62", "an unstamped dev build over an installed one");
  assert.equal(nextSeen("0.5.62", "0.3.2"), "0.5.62");
});

test("a host with no version remembers whatever it already had", () => {
  assert.equal(nextSeen("0.1.40", ""), "0.1.40");
  assert.equal(nextSeen(null, ""), null);
});

test("a stored value is read back only if it is a version", () => {
  assert.equal(readSeen("0.4.17"), "0.4.17");
  assert.equal(readSeen(undefined), null);
  assert.equal(readSeen(42), null);
  assert.equal(readSeen("yesterday"), null);
  assert.equal(readSeen({ version: "0.4.1" }), null);
});

// ── the banner's words ──

test("the headline names the build and the newest thing in it, and counts the rest", () => {
  const fresh = notesSince(FIVE, "0.1.40", "0.5.62");
  assert.equal(updateHeadline(fresh, "0.1.40", "0.5.62"), "Updated 0.1.40 → 0.5.62: Title 0.5, and 3 more updates.");
  assert.equal(updateHeadline(fresh.slice(0, 2), "0.1.40", "0.5.62"), "Updated 0.1.40 → 0.5.62: Title 0.5, and 1 more update.");
  assert.equal(updateHeadline(fresh.slice(0, 1), "0.4.2", "0.5.62"), "Updated 0.4.2 → 0.5.62: Title 0.5.");
});

test("with nothing remembered the headline doesn't pretend to know where you came from", () => {
  assert.equal(updateHeadline(notesSince(FIVE, null, "0.5.62"), null, "0.5.62"), "EQ List 0.5.62 — Title 0.5.");
});

test("nothing new, nothing to say", () => {
  assert.equal(updateHeadline([], "0.5.1", "0.5.62"), "");
});

// ── a changelog that can be trusted ──

test("a well-formed changelog has no problems", () => {
  assert.deepEqual(changelogProblems(FIVE), []);
  assert.deepEqual(changelogProblems([]), []);
});

test("it says what is wrong, in words", () => {
  assert.match(changelogProblems([note("v3")]).join(), /"major.minor"/);
  assert.match(changelogProblems([note("0.3", { date: "yesterday" })]).join(), /not YYYY-MM-DD/);
  assert.match(changelogProblems([note("0.3", { date: "2026-02-30" })]).join(), /not YYYY-MM-DD/);
  assert.match(changelogProblems([note("0.3", { title: "  " })]).join(), /no title/);
  assert.match(changelogProblems([note("0.3", { changes: [] })]).join(), /nothing changed/);
  assert.match(changelogProblems([note("0.3", { changes: [{ kind: "new", text: " " }] })]).join(), /empty change/);
  assert.match(changelogProblems([note("0.3", { changes: [{ kind: "huge" as never, text: "x" }] })]).join(), /unknown kind/);
});

test("the order is newest first, one note per line — a duplicate or a misordering fails", () => {
  assert.match(changelogProblems([note("0.2"), note("0.3")]).join(), /must come before/);
  assert.match(changelogProblems([note("0.3"), note("0.3")]).join(), /must come before/);
  assert.deepEqual(changelogProblems([note("0.10"), note("0.9")]), [], "0.10 is after 0.9, numerically");
});

test("a newer release can't be dated before an older one", () => {
  assert.match(changelogProblems([note("0.3", { date: "2026-01-01" }), note("0.2", { date: "2026-02-01" })]).join(), /dated 2026-01-01, before/);
});

test("with nothing remembered but several owed (an install from before this was tracked) it still counts them and doesn't invent where it came from", () => {
  const owed = notesSince(FIVE, "0.1.0", "0.3.5");
  assert.equal(updateHeadline(owed, null, "0.3.5"), "EQ List 0.3.5 — Title 0.3, and 1 more update.");
});

// ── history from before release notes ──

const period = (from: string, to: string, over: Partial<HistoryNote> = {}): HistoryNote => ({
  from,
  to,
  title: `Period ${from}`,
  changes: [{ kind: "new", text: "Something" }],
  ...over,
});

test("a period is written the way a person says it", () => {
  assert.equal(periodText("2026-09-01", "2026-09-30"), "Sep 2026", "a whole month");
  assert.equal(periodText("2026-02-01", "2026-02-28"), "Feb 2026", "February's own last day");
  assert.equal(periodText("2026-10-26", "2026-10-31"), "26–31 Oct 2026", "part of a month");
  assert.equal(periodText("2026-07-22", "2026-08-03"), "22 Jul – 3 Aug 2026", "across a month");
  assert.equal(periodText("2025-08-10", "2026-01-12"), "10 Aug 2025 – 12 Jan 2026", "across a year");
  assert.equal(periodText("2026-11-08", "2026-11-08"), "8 Nov 2026", "a single day");
});

test("well-formed history has no problems", () => {
  const history = [period("2026-10-01", "2026-10-31"), period("2026-09-01", "2026-09-30"), period("2025-08-10", "2026-01-12")];
  assert.deepEqual(historyProblems(history), []);
  assert.deepEqual(historyProblems(history, "2026-11-08"), []);
  assert.deepEqual(historyProblems([]), []);
});

test("history is held to real dates, a title and something that changed", () => {
  assert.match(historyProblems([period("soon", "2026-10-31")]).join(), /YYYY-MM-DD/);
  assert.match(historyProblems([period("2026-02-30", "2026-03-05")]).join(), /YYYY-MM-DD/);
  assert.match(historyProblems([period("2026-10-31", "2026-10-01")]).join(), /starts after it ends/);
  assert.match(historyProblems([period("2026-10-01", "2026-10-31", { title: "" })]).join(), /no title/);
  assert.match(historyProblems([period("2026-10-01", "2026-10-31", { changes: [] })]).join(), /nothing changed/);
});

test("periods run newest first and can't overlap", () => {
  assert.match(historyProblems([period("2026-09-01", "2026-09-30"), period("2026-10-01", "2026-10-31")]).join(), /overlaps or comes before/);
  assert.match(historyProblems([period("2026-10-01", "2026-10-31"), period("2026-09-15", "2026-10-02")]).join(), /overlaps/);
  assert.deepEqual(historyProblems([period("2026-10-01", "2026-10-31"), period("2026-09-01", "2026-09-30")]), [], "touching months are fine");
});

test("history stops where the numbered releases start, so nothing is told twice", () => {
  assert.match(historyProblems([period("2026-11-01", "2026-11-08")], "2026-11-08").join(), /into the first numbered release/);
  assert.deepEqual(historyProblems([period("2026-11-01", "2026-11-07")], "2026-11-08"), []);
});

test("where the owed notes are counted from: what was remembered, else the baseline for a used install, else nowhere", () => {
  assert.equal(countFrom("0.4.17", true, "0.1.0"), "0.4.17", "a marker always wins");
  assert.equal(countFrom("0.4.17", false, "0.1.0"), "0.4.17");
  assert.equal(countFrom(null, true, "0.1.0"), "0.1.0", "an update from before this was tracked is owed everything since");
  assert.equal(countFrom(null, false, "0.1.0"), null, "a first install has no since — the newest note alone");
});

test("an update from before tracking is owed every note since, while a first install gets the newest", () => {
  const since = countFrom(null, true, "0.1.0");
  assert.deepEqual(lines(notesSince(FIVE, since, "0.3.5")), ["0.3", "0.2"]);
  assert.deepEqual(lines(notesSince(FIVE, countFrom(null, false, "0.1.0"), "0.3.5")), ["0.3"]);
});
