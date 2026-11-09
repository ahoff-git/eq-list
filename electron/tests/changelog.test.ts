/**
 * The real release notes, held to the rules (ADR 0373). Not a black box of its own — these are checks on the data
 * in `src/shared/releases/changelog.ts` against the things it must agree with: `package.json`'s release line, the
 * how-to guides it links to, and the logic that decides what a player is shown. Re-run when the changelog,
 * the guides or the version change; a failure here is almost always "you changed one and not the other".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { BEFORE_NOTES, CHANGELOG } from "../../src/shared/releases/changelog";
import { HISTORY } from "../../src/shared/releases/history";
import { changelogProblems, countFrom, historyProblems, notesSince, releaseLine } from "../../src/shared/releases/release-notes";
import { GUIDES } from "../../src/shared/help/guides";

const REPO_ROOT = path.join(__dirname, "../../..");
const packageVersion = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as { version: string }).version;

test("the changelog is well formed: real dates, titles and changes, newest first, one note per line", () => {
  assert.deepEqual(changelogProblems(CHANGELOG), []);
  assert.ok(CHANGELOG.length > 0);
});

test("the newest note is package.json's release line — a version bump without a note, or a note without a bump, fails here", () => {
  const line = releaseLine(packageVersion);
  assert.ok(line, `package.json version "${packageVersion}" is not a version`);
  assert.equal(CHANGELOG[0].line, line.join("."), "bump package.json to <line>.0 in the same change as the note (CLAUDE.md)");
});

test("every how-to link in a note points at a guide that exists", () => {
  const known = new Set(GUIDES.map((g) => g.id));
  const dangling = CHANGELOG.flatMap((n) => n.changes.flatMap((c) => (c.guide && !known.has(c.guide) ? [`${n.line}: ${c.guide}`] : [])));
  assert.deepEqual(dangling, []);
});

test("a note is plain words — markup written into one would be shown as typed", () => {
  const marked = [...CHANGELOG, ...HISTORY].flatMap((n) => n.changes.filter((c) => /\*\*|\{hotkey:/.test(c.text)).map((c) => `${"line" in n ? n.line : n.from}: ${c.text.slice(0, 40)}`));
  assert.deepEqual(marked, [], "guides take bold labels and hotkey tokens; release notes don't");
});

test("someone several releases behind is shown each one they missed, and nothing they've had", () => {
  const newest = CHANGELOG[0].line;
  const oldest = CHANGELOG[CHANGELOG.length - 1].line;
  const owed = notesSince(CHANGELOG, `${oldest}.17`, `${newest}.62`).map((n) => n.line);
  assert.deepEqual(owed, CHANGELOG.slice(0, -1).map((n) => n.line), "everything after the oldest line, newest first");
  assert.deepEqual(notesSince(CHANGELOG, `${newest}.1`, `${newest}.62`), [], "another build of the line they already saw");
});

test("the history is well formed and stops before the first numbered release begins — nothing is told twice", () => {
  assert.deepEqual(historyProblems(HISTORY, CHANGELOG[CHANGELOG.length - 1].date), []);
  assert.ok(HISTORY.length > 0);
});

test("an install updating from before tracking is owed every note, since the baseline is behind them all", () => {
  const lines = (from: string | null) => notesSince(CHANGELOG, from, `${CHANGELOG[0].line}.9`).map((n) => n.line);
  assert.deepEqual(lines(countFrom(null, true, BEFORE_NOTES)), CHANGELOG.map((n) => n.line));
  assert.deepEqual(lines(countFrom(null, false, BEFORE_NOTES)), [CHANGELOG[0].line], "a first install: the newest alone");
});
