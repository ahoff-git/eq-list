/**
 * Tests for the player's own stated faction totals — the figure the ledger can't give us for a
 * faction touched before this app ever watched it. Touches a temp dir, because surviving a restart
 * is half the point, the same as `xp-progress.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFactionCorrections } from "../faction-corrections";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-faction-corrections-"));
}

const store = (dir = tempDir()) => createFactionCorrections(dir, () => "2026-07-29T01:00:00.000Z");

test("nothing is stated until the player says so", () => {
  assert.deepEqual(store().all(), {});
});

test("stating a total is kept as an offset against the ledger's own net at the time", () => {
  const c = store();
  // The ledger has observed -20 net so far; the player says the real total is 500.
  const correction = c.set("Agents of Mistmoore", 500, -20);
  assert.deepEqual(correction, { offset: 520, statedAt: "2026-07-29T01:00:00.000Z" });
  assert.deepEqual(c.all(), { "Agents of Mistmoore": correction });
});

test("restating a faction replaces its correction rather than stacking a second one", () => {
  const c = store();
  c.set("Agents of Mistmoore", 500, -20);
  c.set("Agents of Mistmoore", 480, -20); // the player noticed they were off by 20
  assert.equal(c.all()["Agents of Mistmoore"].offset, 500);
});

test("two factions are kept independently", () => {
  const c = store();
  c.set("Agents of Mistmoore", 500, -20);
  c.set("Priests of Marr", -1000, 0);
  assert.deepEqual(Object.keys(c.all()).sort(), ["Agents of Mistmoore", "Priests of Marr"]);
  assert.equal(c.all()["Priests of Marr"].offset, -1000);
});

test("a plain clear leaves every correction alone — it's the player's own statement, nothing the ledger folded", () => {
  const c = store();
  c.set("Agents of Mistmoore", 500, -20);
  c.clear();
  assert.equal(Object.keys(c.all()).length, 1);
  c.clear("records");
  assert.equal(Object.keys(c.all()).length, 1);
});

test("only 'everything' wipes stated corrections", () => {
  const c = store();
  c.set("Agents of Mistmoore", 500, -20);
  c.clear("everything");
  assert.deepEqual(c.all(), {});
});

test("corrections survive a restart", () => {
  const dir = tempDir();
  const first = store(dir);
  first.set("Agents of Mistmoore", 500, -20);
  first.flush();

  const reopened = store(dir);
  assert.equal(reopened.all()["Agents of Mistmoore"].offset, 520);
});

test("a corrupt or non-object file falls back to nothing stated, rather than failing", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "faction-corrections.json"), "{oops");
  assert.deepEqual(store(dir).all(), {});

  const arrayFile = tempDir();
  fs.writeFileSync(path.join(arrayFile, "faction-corrections.json"), "[1,2,3]");
  assert.deepEqual(store(arrayFile).all(), {});
});
