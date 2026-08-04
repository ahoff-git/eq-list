/**
 * Black-box tests for the remembered read positions.
 *
 * The whole value of this file is that it survives a restart, so most of these assert across two
 * instances built over the same directory — the closest thing to quitting and reopening the app.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLogCursor } from "../log-cursor";

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "eql-cursor-"));

test("a position set in one run is read by the next", () => {
  const dir = tempDir();
  try {
    createLogCursor(dir).set("C:/logs/eqlog_Kainos_qeynos.txt", 4096);
    assert.equal(createLogCursor(dir).get("C:/logs/eqlog_Kainos_qeynos.txt"), 4096);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a log we have never read has no position", () => {
  // Load-bearing: `undefined` is what makes the watcher pin an unknown log at its end rather than
  // reading it from the top, so it must never be confused with 0 ("read it all").
  const dir = tempDir();
  try {
    const cursor = createLogCursor(dir);
    assert.equal(cursor.get("C:/logs/eqlog_Nobody_qeynos.txt"), undefined);
    cursor.set("C:/logs/eqlog_Nobody_qeynos.txt", 0);
    assert.equal(createLogCursor(dir).get("C:/logs/eqlog_Nobody_qeynos.txt"), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("one file is one position however its path is spelled", () => {
  // Two cursors for one file would mean reading the same gap twice.
  const dir = tempDir();
  try {
    createLogCursor(dir).set("C:/Logs/EQLOG_Kainos_qeynos.TXT", 99);
    assert.equal(createLogCursor(dir).get("c:/logs/eqlog_kainos_qeynos.txt"), 99);
    assert.equal(createLogCursor(dir).get("C:/logs/./eqlog_Kainos_qeynos.txt"), 99);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the newest position for a file wins", () => {
  const dir = tempDir();
  try {
    const cursor = createLogCursor(dir);
    cursor.set("C:/logs/a.txt", 10);
    cursor.set("C:/logs/a.txt", 250);
    assert.equal(createLogCursor(dir).get("C:/logs/a.txt"), 250);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("positions are kept per file", () => {
  const dir = tempDir();
  try {
    const cursor = createLogCursor(dir);
    cursor.set("C:/logs/eqlog_A_qeynos.txt", 1);
    cursor.set("C:/logs/eqlog_B_qeynos.txt", 2);
    const reopened = createLogCursor(dir);
    assert.equal(reopened.get("C:/logs/eqlog_A_qeynos.txt"), 1);
    assert.equal(reopened.get("C:/logs/eqlog_B_qeynos.txt"), 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an unreadable file leaves us knowing nothing, not crashing", () => {
  // Knowing nothing means the watcher anchors at EOF — we miss a gap rather than replay a history,
  // which is the safe direction to fail in.
  const dir = tempDir();
  try {
    fs.writeFileSync(path.join(dir, "log-cursors.json"), "{ this is not json");
    const cursor = createLogCursor(dir);
    assert.equal(cursor.get("C:/logs/a.txt"), undefined);
    cursor.set("C:/logs/a.txt", 5); // and it recovers, rather than staying broken
    assert.equal(createLogCursor(dir).get("C:/logs/a.txt"), 5);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("nonsense positions are ignored on load", () => {
  const dir = tempDir();
  try {
    // Keys on disk are resolved paths, so the fixture has to be written the way this platform
    // spells them — the point here is which *values* survive, not the key format.
    const key = (p: string) => path.resolve(p).toLowerCase();
    fs.writeFileSync(
      path.join(dir, "log-cursors.json"),
      JSON.stringify({
        version: 1,
        files: { [key("C:/logs/a.txt")]: -1, [key("C:/logs/b.txt")]: "lots", [key("C:/logs/c.txt")]: 7 },
      }),
    );
    const cursor = createLogCursor(dir);
    assert.equal(cursor.get("C:/logs/a.txt"), undefined);
    assert.equal(cursor.get("C:/logs/b.txt"), undefined);
    assert.equal(cursor.get("C:/logs/c.txt"), 7);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("clear forgets everything, so the next start behaves like a first run", () => {
  const dir = tempDir();
  try {
    const cursor = createLogCursor(dir);
    cursor.set("C:/logs/a.txt", 42);
    cursor.clear();
    assert.equal(cursor.get("C:/logs/a.txt"), undefined);
    assert.equal(createLogCursor(dir).get("C:/logs/a.txt"), undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("writing leaves no temp file behind", () => {
  // The write goes via a temp file and a rename so a crash mid-write can't lose every position.
  const dir = tempDir();
  try {
    createLogCursor(dir).set("C:/logs/a.txt", 1);
    assert.deepEqual(fs.readdirSync(dir), ["log-cursors.json"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
