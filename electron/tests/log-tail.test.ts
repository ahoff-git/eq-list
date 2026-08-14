/**
 * Black-box tests for reading a stretch of the log file — the lines a rule is checked against.
 *
 * Touches a temp file, because "what does this do to a real file on disk" is the whole question.
 * Three behaviours matter: it reads the **end** rather than the beginning, starting mid-file never
 * hands back half a line as if it were whole, and it says whether there is any *further back* left —
 * which is what the "search further back" button is asking.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readLogTail } from "../log-tail";
import { parseLogText } from "../../src/shared/log-parser";
import { TAIL_STEPS } from "../../src/shared/constants";

const line = (n: number) => `[Wed Jul 29 21:00:${String(n % 60).padStart(2, "0")} 2026] line number ${n}`;

/** A log file of `count` lines, in a fresh temp dir. */
function writeLog(count: number, name = "eqlog_Test_server.txt"): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eq-tail-"));
  const file = path.join(dir, name);
  fs.writeFileSync(file, Array.from({ length: count }, (_, i) => line(i + 1)).join("\r\n") + "\r\n");
  return file;
}

/** What a caller does with a tail: the text is parsed where it's used. */
const linesOf = (text: string) => parseLogText(text);

test("it reads the file's last lines, oldest first", () => {
  const tail = readLogTail(writeLog(500), 400);
  const lines = linesOf(tail.text);
  assert.ok(lines.length > 1);
  assert.equal(lines[lines.length - 1].message, "line number 500");
});

test("a whole small file comes back whole, and says so", () => {
  const tail = readLogTail(writeLog(3));
  const lines = linesOf(tail.text);
  assert.equal(lines.length, 3);
  assert.equal(lines[0].message, "line number 1");
  assert.equal(tail.whole, true); // nothing further back to search
});

test("reading from mid-file drops the half line it lands in, and isn't whole", () => {
  // The failure this prevents: half a sentence matched as if it were the whole one.
  const tail = readLogTail(writeLog(500), 900);
  assert.equal(tail.whole, false);
  const lines = linesOf(tail.text);
  assert.ok(lines.length > 5);
  for (const l of lines) assert.match(l.message, /^line number \d+$/);
  assert.equal(lines[lines.length - 1].message, "line number 500");
});

test("each step of the ladder reads further back than the last", () => {
  // ~920 KB of log: every step below is inside it, so each must see strictly more.
  const file = writeLog(20_000);
  const counts = [2_000, 20_000, 200_000].map((bytes) => linesOf(readLogTail(file, bytes).text).length);
  assert.ok(counts[0] < counts[1], `${counts[0]} !< ${counts[1]}`);
  assert.ok(counts[1] < counts[2], `${counts[1]} !< ${counts[2]}`);
  // Only a read past the file's own size is the whole of it — that's what ends the ladder.
  assert.equal(readLogTail(file, 200_000).whole, false);
  assert.equal(readLogTail(file, 2 * 1024 * 1024).whole, true);
});

test("the byte window bounds the work, whatever the file's size", () => {
  const tail = readLogTail(writeLog(20_000), 4096);
  assert.ok(tail.bytes <= 4096);
  assert.equal(linesOf(tail.text)[linesOf(tail.text).length - 1].message, "line number 20000");
});

test("the ladder's first step is the default", () => {
  const file = writeLog(50);
  assert.deepEqual(readLogTail(file), readLogTail(file, TAIL_STEPS[0]));
});

test("lines that aren't log lines are skipped rather than faked", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eq-tail-"));
  const file = path.join(dir, "eqlog_Test_server.txt");
  fs.writeFileSync(file, `${line(1)}\r\nnot a log line at all\r\n\r\n${line(2)}\r\n`);
  assert.deepEqual(linesOf(readLogTail(file).text).map((l) => l.message), ["line number 1", "line number 2"]);
});

test("every line carries a distinct id, since callers key off it", () => {
  const lines = linesOf(readLogTail(writeLog(10)).text);
  assert.equal(new Set(lines.map((l) => l.logId)).size, lines.length);
});

test("no file, a missing file, or a directory is an empty answer rather than a throw", () => {
  // All three are ordinary states — no game installed, a folder not set, a log deleted mid-session.
  for (const target of [undefined, "", path.join(os.tmpdir(), "eq-tail-nope", "eqlog_None.txt"), os.tmpdir()]) {
    const tail = readLogTail(target);
    assert.equal(tail.text, "");
    assert.equal(tail.bytes, 0);
    // "Whole" for an absent log: there is nothing further back, so don't offer to look.
    assert.equal(tail.whole, true);
  }
});

test("an empty log reads as no lines", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eq-tail-"));
  const file = path.join(dir, "eqlog_Empty_server.txt");
  fs.writeFileSync(file, "");
  assert.equal(readLogTail(file).text, "");
});
