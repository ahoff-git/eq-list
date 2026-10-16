/**
 * Re-filing what was recorded under the zone before one the app couldn't name (`zone-line-repair.ts`),
 * and the one-time run of it against the real stores (`migrations.ts`). The log lines are real ones.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { misfiledZone, NEWLY_RESOLVED, type LineTimeline } from "../zone-line-repair";
import { runMigrations } from "../migrations";
import { openAppDatabase } from "../sqlite-store";
import { KILL_LOG_MIGRATIONS } from "../kill-log";
import { LOOT_LOG_MIGRATIONS } from "../loot-log";
import { COMBAT_HISTORY_MIGRATIONS } from "../combat-history";

const evening: LineTimeline = {
  firstAt: "2026-09-02T21:00:00",
  lastAt: "2026-09-02T23:59:59",
  entries: [
    { at: "2026-09-02T21:00:00", zone: "The Ruins of Old Guk" },
    { at: "2026-09-02T21:30:00", zone: "The Northern Plains of Karana" },
    { at: "2026-09-02T22:00:00", zone: "an area where levitation effects do not function" },
    { at: "2026-09-02T22:30:00", zone: "Qeynos Hills" },
  ],
};

test("the names 0.1.154 taught the resolver", () => {
  for (const z of ["The Northern Plains of Karana", "The Qeynos Aqueduct System", "The Southern Desert of Ro", "Neriak - Commons", "Neriak - Foreign Quarter"])
    assert.ok(NEWLY_RESOLVED.test(z), z);
  for (const z of ["North Karana", "Qeynos Hills", "Neriak Commons", "Lake Rathetear"]) assert.ok(!NEWLY_RESOLVED.test(z), z);
});

test("a record filed under the zone before an unnamed one moves to where you were", () => {
  // In North Karana, filed under the Guk zone the old rules kept.
  assert.equal(misfiledZone([evening], "2026-09-02T21:45:00", "The Ruins of Old Guk"), "The Northern Plains of Karana");
  // A restriction notice that isn't a zone doesn't end the stay: still North Karana at 22:15.
  assert.equal(misfiledZone([evening], "2026-09-02T22:15:00", "The Ruins of Old Guk"), "The Northern Plains of Karana");
});

test("anything else is left alone", () => {
  assert.equal(misfiledZone([evening], "2026-09-02T21:45:00", "The Northern Plains of Karana"), undefined, "already right");
  assert.equal(misfiledZone([evening], "2026-09-02T21:45:00", "Befallen"), undefined, "neither rule gives this");
  assert.equal(misfiledZone([evening], "2026-09-02T21:15:00", "The Ruins of Old Guk"), undefined, "before the unnamed line");
  assert.equal(misfiledZone([evening], "2026-09-02T22:45:00", "The Ruins of Old Guk"), undefined, "after the next named line");
  assert.equal(misfiledZone([evening], "2026-09-03T01:00:00", "The Ruins of Old Guk"), undefined, "outside the log");
  // Two logs covering the moment and disagreeing: neither is trusted.
  const other: LineTimeline = { ...evening, entries: [evening.entries[0], { at: "2026-09-02T21:30:00", zone: "Neriak - Commons" }] };
  assert.equal(misfiledZone([evening, other], "2026-09-02T21:45:00", "The Ruins of Old Guk"), undefined);
});

test("runs once against the stores: re-files, records what it changed, and doesn't run again", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-zone-lines-"));
  const logs = path.join(dir, "Logs");
  fs.mkdirSync(logs);
  fs.writeFileSync(
    path.join(logs, "eqlog_Kainos_qeynos.txt"),
    [
      "[Wed Sep 02 21:00:00 2026] You have entered The Ruins of Old Guk.",
      "[Wed Sep 02 21:30:00 2026] You have entered The Northern Plains of Karana.",
      "[Wed Sep 02 21:45:00 2026] You have slain a gnoll pup!",
      "[Wed Sep 02 22:30:00 2026] You have entered Qeynos Hills.",
    ].join("\n"),
  );
  const db = openAppDatabase(dir, [...LOOT_LOG_MIGRATIONS, ...KILL_LOG_MIGRATIONS, ...COMBAT_HISTORY_MIGRATIONS]);
  const kill = db.prepare(
    "INSERT INTO kill_records (id, key, logId, at, mob, zone, confidence, dropsKeyed) VALUES (?, ?, 0, ?, 'gnoll pup', ?, 1, 0)",
  );
  kill.run("k1", "key1", "2026-09-02T21:45:00", "The Ruins of Old Guk"); // misfiled
  kill.run("k2", "key2", "2026-09-02T21:10:00", "The Ruins of Old Guk"); // really in Guk
  // A fight stores UTC; this one started at 21:50 local.
  const local = new Date(2026, 8, 2, 21, 50, 0).toISOString();
  db.prepare(
    "INSERT INTO combat_fights (id, key, sessionId, label, zone, startedAt, endedAt, statsJson) VALUES ('f1', 'fk1', 's', 'l', ?, ?, ?, '{}')",
  ).run("The Ruins of Old Guk", local, local);

  runMigrations(dir, logs, db);
  const zone = (sql: string) => (db.prepare(sql).get() as { zone: string }).zone;
  assert.equal(zone("SELECT zone FROM kill_records WHERE id = 'k1'"), "The Northern Plains of Karana");
  assert.equal(zone("SELECT zone FROM kill_records WHERE id = 'k2'"), "The Ruins of Old Guk");
  assert.equal(zone("SELECT zone FROM combat_fights WHERE id = 'f1'"), "The Northern Plains of Karana");
  const record = JSON.parse(fs.readFileSync(path.join(dir, "zone-line-repair-1.json"), "utf8"));
  assert.deepEqual(record.changes.map((c: { id: string; from: string }) => [c.id, c.from]), [["k1", "The Ruins of Old Guk"], ["f1", "The Ruins of Old Guk"]]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, "data-repairs.json"), "utf8")).zoneLines, 1);

  // Once: put one back by hand, run again, and it stays as put.
  db.prepare("UPDATE kill_records SET zone = 'The Ruins of Old Guk' WHERE id = 'k1'").run();
  runMigrations(dir, logs, db);
  assert.equal(zone("SELECT zone FROM kill_records WHERE id = 'k1'"), "The Ruins of Old Guk");
  db.close();
});
