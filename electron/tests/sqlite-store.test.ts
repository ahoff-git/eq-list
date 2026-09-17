/**
 * Black-box test for `sqlite-store.ts`: the one open/migrate helper every SQLite-backed ledger shares
 * (ADR 0232). What matters here is the migration contract itself, not any one store's schema —
 * `faction-log.test.ts` covers a real store built on top of this.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openAppDatabase, type Migration } from "../sqlite-store";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-sqlite-store-"));
}

test("a fresh database applies every migration, in version order regardless of array order", () => {
  const applied: number[] = [];
  const migrations: Migration[] = [
    { version: 2, label: "second", up: (db) => (applied.push(2), db.exec("CREATE TABLE second(x)")) },
    { version: 1, label: "first", up: (db) => (applied.push(1), db.exec("CREATE TABLE first(x)")) },
  ];
  const db = openAppDatabase(tempDir(), migrations);
  assert.deepEqual(applied, [1, 2]);
  assert.equal(db.pragma("user_version", { simple: true }), 2);
  assert.doesNotThrow(() => db.exec("SELECT * FROM first; SELECT * FROM second;"));
});

test("a migration already applied on a previous open never runs again", () => {
  const dir = tempDir();
  let firstRuns = 0;
  const migrationsV1: Migration[] = [{ version: 1, label: "first", up: (db) => (firstRuns++, db.exec("CREATE TABLE t(x)")) }];
  openAppDatabase(dir, migrationsV1).close();
  assert.equal(firstRuns, 1);

  // A second launch, with a second store's migration added onto the same shared sequence — only the
  // new one runs; the first store's is already reflected in `user_version` and is skipped.
  let secondRuns = 0;
  const migrationsV2: Migration[] = [
    ...migrationsV1,
    { version: 2, label: "second", up: (db) => (secondRuns++, db.exec("CREATE TABLE u(x)")) },
  ];
  const db2 = openAppDatabase(dir, migrationsV2);
  assert.equal(firstRuns, 1, "not re-run");
  assert.equal(secondRuns, 1);
  assert.equal(db2.pragma("user_version", { simple: true }), 2);
});

test("the userData directory is created if it doesn't exist yet", () => {
  const dir = path.join(tempDir(), "nested", "deeper");
  assert.equal(fs.existsSync(dir), false);
  openAppDatabase(dir, []);
  assert.equal(fs.existsSync(path.join(dir, "eqlist.db")), true);
});

test("a failing migration leaves user_version unmoved, so a later retry runs it in full", () => {
  const dir = tempDir();
  let attempts = 0;
  const flaky: Migration[] = [
    {
      version: 1,
      label: "flaky",
      up: (db) => {
        attempts++;
        db.exec("CREATE TABLE t(x)");
        if (attempts === 1) throw new Error("simulated failure partway through");
      },
    },
  ];

  assert.throws(() => openAppDatabase(dir, flaky));
  const db = openAppDatabase(dir, flaky);
  assert.equal(attempts, 2, "the failed attempt's work was rolled back, so the retry ran the migration in full");
  assert.equal(db.pragma("user_version", { simple: true }), 1);
});
