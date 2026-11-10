/**
 * profile.mjs — a scratch userData the suite can launch the app on, built fresh for every run.
 *
 * Two kinds, because the suite has to work for someone with no EverQuest install and no history:
 *
 *   live      a **read-only copy** of the player's own `eqlist.db` (and its write-ahead log, the file's
 *             recent half) plus the wiki-cache indexes beside it. Real data surfaces real bugs — it is
 *             what found the sweep's first crop — but it is only ever *read*: every copy is a plain
 *             `copyFile` from the live folder, and nothing is written there.
 *   fixture   no player data at all. The committed web snapshot's wiki cache stands in for the page
 *             cache, so the Items and Spells tables have rows, and the faction/loot/session tables are
 *             filled by appending log lines once the app is running (log-lines.mjs).
 *
 * Both get the same `settings.json`, which pins everything that could reach outside the scratch
 * folder: the log folder is the scratch one, the peer room is off, and the Lucy lookup is off.
 */
import fs from "node:fs";
import path from "node:path";

import { eqStamp, zoneTexts } from "./log-lines.mjs";

export const CHARACTER = "Smokey";
export const ZONE = "qeynos";

/** `eqlog_<Name>_<server>.txt` — the game's own naming; the part after the name is read as a server. */
export const logFileName = (character = CHARACTER, zone = ZONE) => `eqlog_${character}_${zone}.txt`;

/**
 * The settings every scratch profile starts with. Stated explicitly even where the app's default
 * already matches: a default that later flips must not quietly connect a test instance to the real
 * peer room, where it would announce itself under the log's character name.
 */
export function seedSettings({ logDir }) {
  return {
    logDir,
    activeLogFile: "",
    connectPeers: false,
    shareLocation: false,
    askLucy: false,
  };
}

/** Files the live copy takes from the player's folder, in order of importance. Nothing else is read. */
const LIVE_FILES = ["eqlist.db", "eqlist.db-wal", "data-repairs.json"];

/** The wiki snapshot's own database is a different file from the app's; copying it would shadow the real one. */
const SNAPSHOT_SKIP = new Set(["eqlist.db", "eqlist.db-shm", "eqlist.db-wal"]);

/** Zone drawings the scratch profile carries — enough for the character's zone, not the player's 78 MB. */
const MAP_PATTERN = /^qeynos/i;

function copyDir(from, to, skip = () => false) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (skip(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(source, target, skip);
    else fs.copyFileSync(source, target);
  }
}

/** The player's own userData folder, when it holds a database to copy. */
export function findLiveDir(candidates) {
  return candidates.find((dir) => fs.existsSync(path.join(dir, "eqlist.db")));
}

/**
 * Build `<root>/<name>/{ud,logs,maps}` and return where everything is.
 *
 *   liveDir        the player's userData folder to copy from, or undefined for a fixture profile
 *   snapshotDir    the committed web snapshot's wiki-cache folder, used when there is no live copy
 *   mapsDir        a folder of stock zone drawings to take a few from
 */
export function buildProfile({ root, name, liveDir, snapshotDir, mapsDir, now = new Date() }) {
  const home = path.join(root, name);
  const userData = path.join(home, "ud");
  const logDir = path.join(home, "logs");
  const profileMaps = path.join(home, "maps");
  for (const dir of [userData, logDir, profileMaps]) fs.mkdirSync(dir, { recursive: true });

  const copied = [];
  if (liveDir) {
    for (const file of LIVE_FILES) {
      const source = path.join(liveDir, file);
      if (!fs.existsSync(source)) continue;
      fs.copyFileSync(source, path.join(userData, file));
      copied.push(file);
    }
    const liveWiki = path.join(liveDir, "wiki-cache");
    if (fs.existsSync(liveWiki)) {
      copyDir(liveWiki, path.join(userData, "wiki-cache"));
      copied.push("wiki-cache/");
    }
  } else if (snapshotDir && fs.existsSync(snapshotDir)) {
    copyDir(snapshotDir, path.join(userData, "wiki-cache"), (entry) => SNAPSHOT_SKIP.has(entry));
    copied.push("wiki-cache/ (committed snapshot)");
  }

  const stockMaps = mapsDir && path.join(mapsDir, "stock");
  if (stockMaps && fs.existsSync(stockMaps)) {
    for (const file of fs.readdirSync(stockMaps)) {
      if (MAP_PATTERN.test(file)) fs.copyFileSync(path.join(stockMaps, file), path.join(profileMaps, file));
    }
  }

  fs.writeFileSync(path.join(userData, "settings.json"), JSON.stringify(seedSettings({ logDir }), null, 2));

  // One line, so the watcher has a log to pin at its end and a zone to start from. Anything the suite
  // wants the app to *read* is appended after launch.
  const logFile = path.join(logDir, logFileName());
  fs.writeFileSync(logFile, `${eqStamp(now)} ${zoneTexts("Qeynos")[0]}\n`);

  return { name, home, userData, logDir, logFile, mapsDir: profileMaps, mode: liveDir ? "live" : "fixture", copied };
}
