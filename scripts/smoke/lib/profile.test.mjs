import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import { buildProfile, findLiveDir, logFileName, seedSettings } from "./profile.mjs";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "eql-profile-test-"));
const write = (dir, rel, text) => {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};

/** Every file under a folder with its content hash and mtime, to prove a copy never touched its source. */
function fingerprint(dir) {
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(dir, p)] = [crypto.createHash("sha1").update(fs.readFileSync(p)).digest("hex"), fs.statSync(p).mtimeMs];
    }
  };
  walk(dir);
  return out;
}

test("settings pin the log folder to the scratch one and keep every outward door shut", () => {
  const s = seedSettings({ logDir: "C:\\scratch\\logs" });
  assert.equal(s.logDir, "C:\\scratch\\logs");
  assert.equal(s.connectPeers, false);
  assert.equal(s.shareLocation, false);
  assert.equal(s.askLucy, false);
});

test("the log is named the way the game names it", () => {
  assert.equal(logFileName("Smokey", "qeynos"), "eqlog_Smokey_qeynos.txt");
});

test("a live copy takes the database and its write-ahead log and leaves the source exactly as it was", () => {
  const live = tmp();
  const root = tmp();
  write(live, "eqlist.db", "database");
  write(live, "eqlist.db-wal", "recent writes");
  write(live, "eqlist.db-shm", "shared memory index (never copied)");
  write(live, "data-repairs.json", '{"zoneRepair":1}');
  write(live, "settings.json", '{"connectPeers":true,"logDir":"G:\\\\real"}');
  write(live, "wiki-cache/title-index.json", "[]");
  const before = fingerprint(live);

  const p = buildProfile({ root, name: "a", liveDir: live });

  assert.equal(p.mode, "live");
  assert.equal(fs.readFileSync(path.join(p.userData, "eqlist.db"), "utf8"), "database");
  assert.equal(fs.readFileSync(path.join(p.userData, "eqlist.db-wal"), "utf8"), "recent writes");
  assert.ok(fs.existsSync(path.join(p.userData, "data-repairs.json")));
  assert.ok(fs.existsSync(path.join(p.userData, "wiki-cache", "title-index.json")));
  assert.ok(!fs.existsSync(path.join(p.userData, "eqlist.db-shm")), "the index file is rebuilt, never copied");
  assert.deepEqual(fingerprint(live), before, "the live folder must be untouched");
});

test("the player's own settings never reach the scratch profile, so their peer room stays unjoined", () => {
  const live = tmp();
  write(live, "eqlist.db", "database");
  write(live, "settings.json", '{"connectPeers":true,"logDir":"G:\\\\real"}');
  const p = buildProfile({ root: tmp(), name: "a", liveDir: live });
  const settings = JSON.parse(fs.readFileSync(path.join(p.userData, "settings.json"), "utf8"));
  assert.equal(settings.connectPeers, false);
  assert.equal(settings.logDir, p.logDir);
});

test("a fixture profile has no player data and falls back to the committed snapshot's pages", () => {
  const snapshot = tmp();
  write(snapshot, "title-index.json", "[]");
  write(snapshot, "pages/a.json", "{}");
  write(snapshot, "eqlist.db", "the snapshot's own database, which must not shadow the app's");
  const p = buildProfile({ root: tmp(), name: "b", snapshotDir: snapshot });
  assert.equal(p.mode, "fixture");
  assert.ok(!fs.existsSync(path.join(p.userData, "eqlist.db")));
  assert.ok(fs.existsSync(path.join(p.userData, "wiki-cache", "pages", "a.json")));
  assert.ok(!fs.existsSync(path.join(p.userData, "wiki-cache", "eqlist.db")));
});

test("a profile with nothing to copy still has a log to follow and a log folder to follow it in", () => {
  const p = buildProfile({ root: tmp(), name: "c" });
  assert.ok(fs.existsSync(p.logFile));
  assert.equal(path.dirname(p.logFile), p.logDir);
  assert.match(fs.readFileSync(p.logFile, "utf8"), /^\[[A-Z][a-z]{2} [A-Z][a-z]{2} \d\d \d\d:\d\d:\d\d \d{4}\] You have entered Qeynos\.\n$/);
});

test("only the character's own zone drawings are carried over", () => {
  const maps = tmp();
  write(maps, "stock/qeynos.txt", "q");
  write(maps, "stock/qeynos2.txt", "q2");
  write(maps, "stock/akanon.txt", "a");
  const p = buildProfile({ root: tmp(), name: "d", mapsDir: maps });
  assert.deepEqual(fs.readdirSync(p.mapsDir).sort(), ["qeynos.txt", "qeynos2.txt"]);
});

test("the live folder is the first candidate that holds a database", () => {
  const empty = tmp();
  const full = tmp();
  write(full, "eqlist.db", "x");
  assert.equal(findLiveDir([path.join(empty, "nope"), empty, full]), full);
  assert.equal(findLiveDir([empty]), undefined);
});
