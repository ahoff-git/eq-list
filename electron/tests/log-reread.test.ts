/**
 * Tests for the unattended re-reading (ADR 0129). These touch the filesystem, because "does a stale
 * stamp on disk cause the logs to be read again" is the whole feature.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pendingReReads, reReadLogs } from "../log-reread";
import { createCombatHistory } from "../combat-history";
import { concernById } from "../../src/shared/data-provenance";
import type { KillLog } from "../kill-log";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-reread-"));
}

/** A kill log that records nothing — this is about fights, and the real one is tested next door. */
function stubKillLog(): KillLog & { player: string } {
  const stub = {
    player: "",
    setPlayer(name: string) {
      stub.player = name;
    },
    noteLoc: () => {},
    record: () => true,
    noteLoot: () => true,
    noteCoin: () => true,
    kills: () => [],
    observations: () => [],
    clear() {},
    flush() {},
  };
  return stub as unknown as KillLog & { player: string };
}

const LOG_LINES = [
  "[Fri Jul 17 18:00:00 2026] Welcome to EverQuest Legends!",
  "[Fri Jul 17 18:00:01 2026] You have entered Blackburrow.",
  "[Fri Jul 17 18:00:10 2026] You slash a gnoll for 30 points of damage.",
  "[Fri Jul 17 18:00:11 2026] A gnoll bites YOU for 4 points of damage.",
  "[Fri Jul 17 18:00:12 2026] You have slain a gnoll!",
].join("\n");

/** A userData dir whose `combat-history.json` carries `revision`, plus the log its fights name. */
function stored(revision: number | undefined, logPath: string) {
  const dir = tempDir();
  // Written by hand rather than through the store, so the stamp is exactly what the test says.
  const history = createCombatHistory(dir, "run:old");
  const stats = {
    startedAt: "2026-07-18T01:00:10.000Z",
    endedAt: "2026-07-18T01:00:11.000Z",
    durationSec: 1,
    spanSec: 1,
    totalDealt: 34,
    yourDealt: 12, // deliberately low, as an older parser would have had it
    yourTaken: 4,
    byCombatant: [],
    spells: [],
    byMob: [],
    kills: 0,
    xpPct: 0,
    xpGains: 0,
    soloXp: 0,
    partyXp: 0,
    copper: 0,
    soldCopper: 0,
    yourPerSec: [],
    deaths: [],
    invocations: [],
  };
  history.add(stats, "Blackburrow", logPath, "login:2026-07-17T18:00:00");
  history.flush();
  // Re-stamp by hand: the store always writes the *current* revision, and a stale file is the case.
  const file = path.join(dir, "combat-history.json");
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  if (revision === undefined) delete onDisk.provenance;
  else onDisk.provenance = { revision, appVersion: "0.0.0", at: "2026-01-01T00:00:00.000Z" };
  fs.writeFileSync(file, JSON.stringify(onDisk));
  return dir;
}

test("the combat-history concern asks to be put right unattended", () => {
  // The flag is what a release sets; without it none of the rest of this file can fire.
  assert.equal(concernById("combat-history")?.unattended, true);
  assert.equal(concernById("combat-history")?.remedy, "re-eat");
});

test("a stale stamp is pending; the current one is not", () => {
  const logDir = tempDir();
  const logPath = path.join(logDir, "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(logPath, LOG_LINES);
  const current = concernById("combat-history")!.revision;

  assert.deepEqual(pendingReReads(stored(current - 1, logPath)), ["combat-history"]);
  assert.deepEqual(pendingReReads(stored(current, logPath)), []);
  // A file written by a *newer* build is not stale — putting it "right" would be a downgrade eating
  // the better answer, which `dataState` is careful about.
  assert.deepEqual(pendingReReads(stored(current + 1, logPath)), []);
});

test("a stale history is re-read and its figures put right, with nothing asked of anybody", async () => {
  const logDir = tempDir();
  const logPath = path.join(logDir, "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(logPath, LOG_LINES);
  const dir = stored(concernById("combat-history")!.revision - 1, logPath);

  const history = createCombatHistory(dir, "run:new");
  assert.equal(history.search("").fights[0].stats.yourDealt, 12); // as the old build left it

  const killLog = stubKillLog();
  killLog.setPlayer("Live");
  const report = await reReadLogs({ userDataDir: dir, history, killLog, logDir, live: "Live" });

  assert.ok(report);
  assert.deepEqual(report.files, [logPath]);
  assert.equal(report.refreshed, 1);
  assert.equal(history.search("").fights[0].stats.yourDealt, 30); // what today's parser reads
  assert.equal(history.search("").fights[0].sessionId, "login:2026-07-17T18:00:00"); // filed as before
  assert.equal(killLog.player, "Live"); // the live identity was put back
});

test("re-reading re-stamps the file, so the next start finds nothing to do", async () => {
  const logDir = tempDir();
  const logPath = path.join(logDir, "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(logPath, LOG_LINES);
  const dir = stored(concernById("combat-history")!.revision - 1, logPath);
  assert.deepEqual(pendingReReads(dir), ["combat-history"]);

  const history = createCombatHistory(dir, "run:new");
  await reReadLogs({ userDataDir: dir, history, killLog: stubKillLog(), logDir, live: "Live" });

  // Self-limiting: the data itself is the record that the work was done.
  assert.deepEqual(pendingReReads(dir), []);
  assert.equal(await reReadLogs({ userDataDir: dir, history, killLog: stubKillLog(), logDir, live: "L" }), null);
});

test("nothing stale means no work and no files read", async () => {
  const logDir = tempDir();
  const logPath = path.join(logDir, "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(logPath, LOG_LINES);
  const dir = stored(concernById("combat-history")!.revision, logPath);
  const history = createCombatHistory(dir, "run:new");
  assert.equal(await reReadLogs({ userDataDir: dir, history, killLog: stubKillLog(), logDir, live: "L" }), null);
});

test("a source whose folder has moved is found by name in the folder we watch now", async () => {
  // The recorded path is from a previous install; the log is where we look today.
  const logDir = tempDir();
  const logPath = path.join(logDir, "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(logPath, LOG_LINES);
  const dir = stored(concernById("combat-history")!.revision - 1, "D:/old-install/Logs/eqlog_Kainos_qeynos.txt");

  const history = createCombatHistory(dir, "run:new");
  const report = await reReadLogs({ userDataDir: dir, history, killLog: stubKillLog(), logDir, live: "Live" });
  assert.deepEqual(report?.files, [logPath]);
  assert.equal(report?.refreshed, 1);
});

test("a source that has gone leaves the data alone and stays stale, rather than failing", async () => {
  const logDir = tempDir(); // empty: no logs at all
  const dir = stored(concernById("combat-history")!.revision - 1, "D:/gone/eqlog_Kainos_qeynos.txt");

  const history = createCombatHistory(dir, "run:new");
  assert.equal(await reReadLogs({ userDataDir: dir, history, killLog: stubKillLog(), logDir, live: "L" }), null);
  assert.equal(history.search("").fights[0].stats.yourDealt, 12); // untouched
  // Still stale, so the Settings panel goes on naming the remedy for a person who can help.
  assert.deepEqual(pendingReReads(dir), ["combat-history"]);
});

test("an unreadable log is skipped rather than taking the repair down with it", async () => {
  const logDir = tempDir();
  const good = path.join(logDir, "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(good, LOG_LINES);
  // A directory where a log should be: reading it throws, which must not lose the good one.
  const bad = path.join(logDir, "eqlog_Other_qeynos.txt");
  fs.mkdirSync(bad);

  const dir = stored(concernById("combat-history")!.revision - 1, good);
  const history = createCombatHistory(dir, "run:new");
  history.add(
    { ...history.search("").fights[0].stats, startedAt: "2026-07-18T02:00:00.000Z", endedAt: "2026-07-18T02:00:01.000Z" },
    null,
    bad,
    "login:2026-07-17T18:00:00",
  );

  const report = await reReadLogs({ userDataDir: dir, history, killLog: stubKillLog(), logDir, live: "L" });
  assert.deepEqual(report?.files, [good]); // the good one still landed
  assert.equal(report?.refreshed, 1);
});
