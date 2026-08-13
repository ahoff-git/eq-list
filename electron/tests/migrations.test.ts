/**
 * One-time repairs to data already on disk
 * ([ADR 0083](../../specs/decisions/0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)).
 *
 * A migration edits the player's own recorded history, so what it must **not** do carries the tests: it
 * may fill in a zone the log states and the record lacks, and nothing else — never overwrite a zone the
 * record already has (the record's wording is the log's, and ours would be a reading of it), never guess
 * where two logs disagree, and never lose data when it can't run.
 *
 * Touches a temp dir on purpose: what lands in the file *is* the feature.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runMigrations } from "../migrations";
import { observeMobs } from "../../src/shared/mob-stats";
import type { KillRecord } from "../../src/shared/types";

function dirs(): { userData: string; logs: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eql-migrate-"));
  const logs = path.join(root, "Logs");
  fs.mkdirSync(logs);
  return { userData: root, logs };
}

/** A log line as the game writes it. */
const line = (day: number, hh: string, text: string) => `[Tue Jul ${day} ${hh} 2026] ${text}`;

/** An ISO stamp matching what `splitLine` derives from that wording — the local clock, as the log is. */
const at = (day: number, hh: string) => {
  const [h, m, s] = hh.split(":").map(Number);
  const d = new Date(2026, 6, day, h, m, s);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `2026-07-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

function kill(day: number, hh: string, mob: string, zone?: string): KillRecord {
  return {
    id: `${mob}-${hh}`,
    logId: 1,
    at: at(day, hh),
    mob,
    killer: "You",
    mine: true,
    zone,
    confidence: 0,
  };
}

const writeStore = (userData: string, kills: KillRecord[], extra: object = {}) =>
  fs.writeFileSync(path.join(userData, "kill-log.json"), JSON.stringify({ kills, retired: [], ...extra }));
const readStore = (userData: string) => JSON.parse(fs.readFileSync(path.join(userData, "kill-log.json"), "utf8"));

/** A log that enters two zones, so a timestamp genuinely picks one. */
function writeLog(logs: string, name = "eqlog_Kainos_qeynos.txt"): void {
  fs.writeFileSync(
    path.join(logs, name),
    [
      line(21, "20:00:00", "Welcome to EverQuest!"),
      line(21, "20:01:00", "You have entered Blackburrow."),
      line(21, "20:05:00", "a gnoll pup has been slain by You!"),
      line(21, "21:00:00", "You have entered the Steamfont Mountains 2 (Adaptive)."),
      line(21, "21:30:00", "a minotaur has been slain by You!"),
      line(21, "23:59:00", "You gain experience!!"),
      "",
    ].join("\n"),
  );
}

test("a kill the log can place gains the zone the log states", () => {
  const { userData, logs } = dirs();
  writeLog(logs);
  writeStore(userData, [kill(21, "20:05:00", "gnoll pup"), kill(21, "21:30:00", "minotaur")]);

  runMigrations(userData, logs);

  const stored = readStore(userData);
  assert.deepEqual(
    stored.kills.map((k: KillRecord) => k.zone),
    ["Blackburrow", "Steamfont Mountains 2 (Adaptive)"],
    "each placed by where the log says you were at that moment",
  );
  // The point of the repair: an unplaced kill counts towards nothing at all.
  assert.equal(observeMobs(stored.kills).length, 2);
  assert.equal(stored.schema, 2, "stamped, so the logs aren't re-read every launch");
});

test("a zone the record already has is never rewritten", () => {
  const { userData, logs } = dirs();
  writeLog(logs);
  // The log's own wording for this moment is "Blackburrow"; the record says something decorated. Both
  // came from the log, and the record's is the one that was actually recorded — so it stands.
  writeStore(userData, [kill(21, "20:05:00", "gnoll pup", "Blackburrow 3 (Fused)")]);

  runMigrations(userData, logs);
  assert.equal(readStore(userData).kills[0].zone, "Blackburrow 3 (Fused)");
});

test("a kill the log can't speak for is left unplaced", () => {
  const { userData, logs } = dirs();
  writeLog(logs);
  writeStore(userData, [
    kill(21, "19:00:00", "a rat"), // before the log begins
    kill(21, "20:00:30", "a bat"), // inside it, but before any zone line
    kill(22, "20:05:00", "a snake"), // after it ends
  ]);

  runMigrations(userData, logs);
  const zones = readStore(userData).kills.map((k: KillRecord) => k.zone);
  assert.deepEqual(zones, [undefined, undefined, undefined], "silence is the honest answer");
});

test("two characters in two zones at the same moment means no answer", () => {
  const { userData, logs } = dirs();
  writeLog(logs);
  fs.writeFileSync(
    path.join(logs, "eqlog_Other_qeynos.txt"),
    [
      line(21, "20:00:00", "Welcome to EverQuest!"),
      line(21, "20:01:00", "You have entered Kerra Isle."),
      line(21, "23:00:00", "You gain experience!!"),
      "",
    ].join("\n"),
  );
  writeStore(userData, [kill(21, "20:05:00", "gnoll pup")]);

  runMigrations(userData, logs);
  assert.equal(readStore(userData).kills[0].zone, undefined, "we can't tell which log the kill came from");
});

test("the file is backed up before it's repaired, and only then", () => {
  const { userData, logs } = dirs();
  writeLog(logs);
  const backup = path.join(userData, "kill-log.pre-schema-2.json");

  // Nothing to fix → nothing to back up, and the schema is still stamped.
  writeStore(userData, [kill(21, "20:05:00", "gnoll pup", "Blackburrow")]);
  runMigrations(userData, logs);
  assert.equal(fs.existsSync(backup), false);
  assert.equal(readStore(userData).schema, 2);

  // Something to fix → the old file is kept beside the new one.
  writeStore(userData, [kill(21, "20:05:00", "gnoll pup")]);
  runMigrations(userData, logs);
  assert.ok(fs.existsSync(backup), "a repair leaves a copy of what it repaired");
  assert.equal(JSON.parse(fs.readFileSync(backup, "utf8")).kills[0].zone, undefined);
});

test("it runs once, and running again changes nothing", () => {
  const { userData, logs } = dirs();
  writeLog(logs);
  writeStore(userData, [kill(21, "20:05:00", "gnoll pup")]);

  runMigrations(userData, logs);
  const first = readStore(userData);
  // A second launch with the same data: the schema stops it, and even without that it would be a no-op.
  runMigrations(userData, logs);
  assert.deepEqual(readStore(userData), first);
});

test("no logs, no log folder, no store — nothing is lost and nothing is stamped", () => {
  const { userData, logs } = dirs();
  writeStore(userData, [kill(21, "20:05:00", "gnoll pup")]);

  // The folder is empty: don't stamp, so the repair is still available once the logs are there.
  runMigrations(userData, logs);
  assert.equal(readStore(userData).schema, undefined);
  runMigrations(userData, undefined);
  assert.equal(readStore(userData).schema, undefined);
  assert.equal(readStore(userData).kills.length, 1, "the record is untouched");

  // An install with no kill log has nothing old to repair, so nothing is written — no stub file
  // appears in a fresh userData folder.
  const fresh = dirs();
  runMigrations(fresh.userData, fresh.logs);
  assert.equal(fs.existsSync(path.join(fresh.userData, "kill-log.json")), false);
});

test("a kill log that won't parse is left exactly as it is", () => {
  // `readJson` answers "empty" for a corrupt file, which is right for a store that can start fresh and
  // very wrong here: stamping a schema over it would replace an evening's kills that a person could
  // still have opened in an editor and rescued.
  const { userData, logs } = dirs();
  writeLog(logs);
  const file = path.join(userData, "kill-log.json");
  const corrupt = '{"kills":[{"id":"a","at":"2026-07-21T20:05:0';
  fs.writeFileSync(file, corrupt);

  runMigrations(userData, logs);

  assert.equal(fs.readFileSync(file, "utf8"), corrupt, "not one byte touched");
  assert.equal(fs.existsSync(path.join(userData, "kill-log.pre-schema-2.json")), false);
});
