/**
 * Integration test for how `main.ts` actually wires the four SQLite-backed ledgers together
 * (ADR 0232): one shared `eqlist.db`, opened once with every store's migrations combined into a
 * single list, then all four stores constructed against that one connection and one `userData`
 * directory. Every other test file exercises one store at a time, against either an isolated
 * `:memory:` database or a real file opened with *only that store's own* migration array — a setup
 * that has never actually run the combined migration list, or put all four legacy JSON files (and
 * their provenance stubs) in the same folder at once, the way a real install does. This file is
 * that missing exercise.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFactionLog, FACTION_LOG_MIGRATIONS, type FactionLog } from "../faction-log";
import { createLootLog, LOOT_LOG_MIGRATIONS, type LootLog } from "../loot-log";
import { createKillLog, KILL_LOG_MIGRATIONS, type KillLog } from "../kill-log";
import { createCombatHistory, COMBAT_HISTORY_MIGRATIONS, type CombatHistory } from "../combat-history";
import { openAppDatabase } from "../sqlite-store";
import type { FightStats } from "../../src/shared/types";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-ledgers-"));
}

/** A minimal but complete fight, in the same shape `combat-history.test.ts`'s own `fight()` builds. */
function fightStats(at: string, dealt = 10): FightStats {
  return {
    startedAt: at,
    endedAt: at,
    durationSec: 4,
    totalDealt: dealt,
    yourDealt: dealt,
    yourTaken: 0,
    spanSec: 4,
    byCombatant: [],
    spells: [],
    byMob: [],
    kills: 1,
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
}

/** Every ledger, sharing one `eqlist.db` under one combined migration list — exactly how
 *  `main.ts` (`electron/main.ts`) wires the four of them together. Tracked so a test's `finally`
 *  can close every handle before the directory is cleaned up — Windows refuses to delete a folder
 *  holding an open database file. */
const openDbs: ReturnType<typeof openAppDatabase>[] = [];
function openAllLedgers(dir: string): {
  factionLog: FactionLog;
  lootLog: LootLog;
  killLog: KillLog;
  history: CombatHistory;
  userVersion: number;
} {
  const db = openAppDatabase(dir, [
    ...FACTION_LOG_MIGRATIONS,
    ...LOOT_LOG_MIGRATIONS,
    ...KILL_LOG_MIGRATIONS,
    ...COMBAT_HISTORY_MIGRATIONS,
  ]);
  openDbs.push(db);
  // Construction order mirrors `main.ts`: combat history, then kills, then loot, then faction.
  return {
    history: createCombatHistory(db, dir),
    killLog: createKillLog(db, dir),
    lootLog: createLootLog(db, dir),
    factionLog: createFactionLog(db, dir),
    userVersion: db.pragma("user_version", { simple: true }) as number,
  };
}
function closeAllLedgers(): void {
  while (openDbs.length) openDbs.pop()!.close();
}

test("all four ledgers share one eqlist.db, migrated together in the same combined order main.ts uses", () => {
  const dir = tempDir();
  try {
    const { factionLog, lootLog, killLog, history, userVersion } = openAllLedgers(dir);
    // Every migration from every store claims the next sequential version, in the order each was
    // written (1: faction, 2: loot, 3: kills, 4: combat history, 5: loot's later index-only
    // migration [ADR 0240], 6: kills' zone index, 7: combat history's sessionId index [both ADR
    // 0243], 8: loot's fate index [ADR 0247]) — sharing one `user_version` sequence is the whole
    // point (ADR 0232's header), so the combined open should land on the highest version across
    // every store, not just one store's own.
    assert.equal(userVersion, 8, "every store's migration landed, on one shared version counter");
    assert.deepEqual(
      fs.readdirSync(dir).filter((f) => f.endsWith(".db")),
      ["eqlist.db"],
      "one shared database file, not one per store",
    );

    factionLog.add({
      kind: "faction",
      faction: "Agents of Mistmoore",
      delta: -3,
      direction: "lowered",
      logId: 1,
      raw: "x",
      at: "2026-07-29T00:00:01",
    });
    lootLog.add({
      kind: "loot",
      item: "Bone Chips",
      qty: 1,
      source: "a kobold",
      fate: "kept",
      logId: 1,
      raw: "y",
      at: "2026-07-29T00:00:01",
    });
    killLog.record("a kobold", "You", "Steamfont Mountains", "2026-07-29T00:00:01", 1);
    history.add(fightStats("2026-07-29T00:00:01.000Z"), "Steamfont Mountains", "log.txt");

    // None of the four stores stepped on another's table, or another's row.
    assert.equal(factionLog.recent().length, 1);
    assert.equal(lootLog.recent().length, 1);
    assert.equal(killLog.kills().length, 1);
    assert.equal(history.sessions().length, 1);
  } finally {
    closeAllLedgers();
  }
});

test("a real upgrade migrates all four legacy JSON files sitting in the same userData folder at once", () => {
  // The realistic case: a player who has been running the app long enough for kills to have aged
  // past the cap and retired — the exact scenario that exposed the bug where only `kill-log.json`'s
  // `kills`/`retired` arrays were migrated and its separate `seenKillKeys`/`seenLootKeys`/
  // `seenCoinKeys` (ADR 0207's permanent identity) were silently dropped. Run here through the same
  // combined `openAppDatabase` path `main.ts` actually uses, with all four legacy files present at
  // once, rather than each store's own isolated migration test.
  const dir = tempDir();
  const retiredAt = "2026-07-29T00:00:10";
  const retiredMob = "a gnoll";

  fs.writeFileSync(
    path.join(dir, "faction-log.json"),
    JSON.stringify({
      hits: [{ kind: "faction", faction: "Agents of Mistmoore", delta: -3, direction: "lowered", logId: 1, raw: "x", at: "2026-07-29T00:00:01" }],
      retired: [],
      provenance: { revision: 1, appVersion: "0.0.0", at: "2026-01-01T00:00:00.000Z" },
    }),
  );
  fs.writeFileSync(
    path.join(dir, "loot-log.json"),
    JSON.stringify({
      loot: [{ kind: "loot", item: "Bone Chips", qty: 1, source: "a kobold", fate: "kept", logId: 1, raw: "y", at: "2026-07-29T00:00:01" }],
      retired: [],
    }),
  );
  fs.writeFileSync(
    path.join(dir, "kill-log.json"),
    JSON.stringify({
      // Nothing held — it all retired past the cap long before this file was ever migrated.
      kills: [],
      retired: [{ mob: retiredMob, zone: "Steamfont Mountains", kills: 1, drops: {}, areas: [], lastAt: retiredAt }],
      seenKillKeys: [`${retiredAt}\0${retiredMob}\0you#0`],
      seenLootKeys: [],
      seenCoinKeys: [],
    }),
  );
  fs.writeFileSync(
    path.join(dir, "combat-history.json"),
    JSON.stringify({ fights: [{ id: "f1", sessionId: "run:old", label: "a coyote", stats: fightStats("2026-07-29T00:00:01.000Z") }] }),
  );

  try {
    const { factionLog, lootLog, killLog, history } = openAllLedgers(dir);

    assert.equal(factionLog.recent().length, 1, "faction-log.json's hit migrated");
    assert.equal(lootLog.recent().length, 1, "loot-log.json's drop migrated");
    assert.equal(killLog.observations().find((o) => o.mob === retiredMob)?.kills, 1, "kill-log.json's retired observation migrated");
    assert.equal(history.sessions().length, 1, "combat-history.json's fight migrated");

    // Every legacy file survives as a provenance stub, side by side in the same folder — none of
    // the four migrations stepped on another's file.
    for (const name of ["faction-log.json", "loot-log.json", "kill-log.json", "combat-history.json"]) {
      assert.equal(fs.existsSync(path.join(dir, name)), true, `${name} still exists`);
      const stub = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      assert.equal(Array.isArray(stub.kills ?? stub.hits ?? stub.loot ?? stub.fights), false, `${name} no longer carries its data array`);
    }

    // The permanent identity ADR 0207 promises survived the trip through the combined migration
    // path, not just the isolated one `kill-log.test.ts` exercises — replaying the exact line that
    // built the retired observation above must still be refused as a duplicate.
    killLog.startReplay();
    assert.equal(
      killLog.record(retiredMob, "You", "Steamfont Mountains", retiredAt, 1),
      false,
      "already recorded, before this file was ever migrated",
    );
    assert.equal(killLog.observations().find((o) => o.mob === retiredMob)?.kills, 1, "replaying it must not double the count");
  } finally {
    closeAllLedgers();
  }
});

test("the whole shared database survives a restart, across all four stores at once", () => {
  const dir = tempDir();
  try {
    {
      const { factionLog, lootLog, killLog, history } = openAllLedgers(dir);
      factionLog.add({ kind: "faction", faction: "Agents of Mistmoore", delta: 2, direction: "raised", logId: 1, raw: "x", at: "2026-07-29T00:00:01" });
      lootLog.add({ kind: "loot", item: "Bone Chips", qty: 1, source: "a kobold", fate: "kept", logId: 1, raw: "y", at: "2026-07-29T00:00:01" });
      killLog.record("a kobold", "You", "Steamfont Mountains", "2026-07-29T00:00:01", 1);
      history.add(fightStats("2026-07-29T00:00:01.000Z"), "Steamfont Mountains", "log.txt");
      closeAllLedgers();
    }

    const { factionLog, lootLog, killLog, history, userVersion } = openAllLedgers(dir);
    assert.equal(userVersion, 8, "re-migrating an already-current database is a no-op, not a re-run");
    assert.equal(factionLog.recent().length, 1);
    assert.equal(lootLog.recent().length, 1);
    assert.equal(killLog.kills().length, 1);
    assert.equal(history.sessions().length, 1);
  } finally {
    closeAllLedgers();
  }
});
