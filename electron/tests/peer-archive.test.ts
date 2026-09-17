/**
 * What an authored share still says once the tray that held it has forgotten
 * (`peer-archive.ts`, [ADR 0242](../../specs/decisions/0242-a-pooled-row-keeps-its-own-origin.md)).
 *
 * The store's tests touch a real temp userData dir, like `contributions.test.ts`'s: surviving a
 * restart is the whole point of this file existing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPeerArchive } from "../peer-archive";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-peer-archive-"));
}

test("a recorded share comes back for its name, and its name only", () => {
  const dir = tempDir();
  const a = createPeerArchive(dir);
  a.record("watches", "Bran", [{ id: "w1" }]);
  assert.deepEqual(a.entries("watches"), [{ name: "Bran", rows: [{ id: "w1" }], seenAt: a.entries("watches")[0].seenAt }]);
  assert.deepEqual(a.entries("styles"), [], "nothing recorded under a different kind");
});

test("a live/kind not in the authored family is not archived at all", () => {
  const dir = tempDir();
  const a = createPeerArchive(dir);
  a.record("mobs", "Bran", [{ mob: "a gnoll" }]);
  a.record("timers", "Bran", [{ key: "k" }]);
  assert.deepEqual(a.entries("mobs"), []);
  assert.deepEqual(a.entries("timers"), []);
});

test("recording again replaces what that name last gave, for that kind", () => {
  const dir = tempDir();
  const a = createPeerArchive(dir);
  a.record("lists", "Bran", [{ id: "l1" }]);
  a.record("lists", "Bran", [{ id: "l2" }, { id: "l3" }]);
  assert.equal(a.entries("lists").length, 1);
  assert.equal(a.entries("lists")[0].rows.length, 2);
});

test("a name with nothing but whitespace teaches the archive nothing", () => {
  const dir = tempDir();
  const a = createPeerArchive(dir);
  a.record("pins", "   ", [{ id: "p1" }]);
  assert.deepEqual(a.entries("pins"), []);
});

test("two names that differ only in case or spacing are remembered as one", () => {
  const dir = tempDir();
  const a = createPeerArchive(dir);
  a.record("styles", "Bran", [{ id: "s1" }]);
  a.record("styles", "  bran ", [{ id: "s2" }]);
  assert.equal(a.entries("styles").length, 1);
  assert.equal(a.entries("styles")[0].rows.length, 1, "the second report replaced the first");
});

test("clearing one name leaves everyone else's memory untouched", () => {
  const dir = tempDir();
  const a = createPeerArchive(dir);
  a.record("watches", "Bran", [{ id: "w1" }]);
  a.record("watches", "Kainos", [{ id: "w2" }]);
  a.clear("Bran", "watches");
  const names = a.entries("watches").map((e) => e.name);
  assert.deepEqual(names, ["Kainos"]);
});

test("clearing a kind with no name clears every name's memory of it, and no other kind", () => {
  const dir = tempDir();
  const a = createPeerArchive(dir);
  a.record("watches", "Bran", [{ id: "w1" }]);
  a.record("styles", "Bran", [{ id: "s1" }]);
  a.clear(undefined, "watches");
  assert.deepEqual(a.entries("watches"), []);
  assert.equal(a.entries("styles").length, 1);
});

test("clearing with neither a name nor a kind forgets everything archived", () => {
  const dir = tempDir();
  const a = createPeerArchive(dir);
  a.record("watches", "Bran", [{ id: "w1" }]);
  a.record("pins", "Kainos", [{ id: "p1" }]);
  a.clear();
  assert.deepEqual(a.entries("watches"), []);
  assert.deepEqual(a.entries("pins"), []);
});

test("an archived share survives a restart", () => {
  const dir = tempDir();
  const first = createPeerArchive(dir);
  first.record("lists", "Bran", [{ id: "l1" }]);
  first.flush();

  const second = createPeerArchive(dir);
  assert.equal(second.entries("lists").length, 1);
  assert.equal(second.entries("lists")[0].name, "Bran");
});
