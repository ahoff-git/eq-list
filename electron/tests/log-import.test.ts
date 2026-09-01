/**
 * Black-box test for "eating" a log: importLog replays a file through the parser and drives
 * the kill log with the same kill / loot / loc / zone sequence live watching would.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { importLog } from "../log-import";
import { createCombatHistory } from "../combat-history";
import { createLootLog } from "../loot-log";
import type { KillLog } from "../kill-log";
import type { CoinEvent, LocEvent, LootEvent } from "../../src/shared/types";

test("importLog digests kills, drops, positions and zones from a file", () => {
  const text = [
    "[Fri Jul 17 18:00:00 2026] You have entered Blackburrow.",
    "[Fri Jul 17 18:00:05 2026] Your Location is 100, 200, 30",
    "[Fri Jul 17 18:00:10 2026] You have slain a gnoll!",
    "[Fri Jul 17 18:00:11 2026] --You have looted a Gnoll Fang from a gnoll's corpse.--",
    "[Fri Jul 17 18:00:12 2026] You receive 1 silver and 4 copper from the corpse.",
    "[Fri Jul 17 18:00:20 2026] Loading, please wait...", // not an event — ignored
  ].join("\n");
  const file = path.join(os.tmpdir(), `eql-import-${process.pid}.txt`);
  fs.writeFileSync(file, text);

  const recorded: { mob: string; killer: string; zone: string | null }[] = [];
  const loot: string[] = [];
  const locs: number[] = [];
  const coins: number[] = [];
  const killLog: KillLog = {
    setPlayer() {},
    noteLoc: (loc: LocEvent) => locs.push(loc.y),
    record: (mob, killer, zone) => {
      recorded.push({ mob, killer, zone });
      return true; // this mock has no dedup; every kill line is "newly recorded"
    },
    noteLoot: (e: LootEvent) => {
      loot.push(e.item);
      return true;
    },
    noteCoin: (e: CoinEvent) => {
      coins.push(e.copper);
      return true;
    },
    kills: () => [],
    observations: () => [],
    version: () => 0,
    clear() {},
    flush() {},
  };

  try {
    const res = importLog(file, killLog);
    assert.equal(res.kills, 1);
    assert.equal(res.drops, 1);
    assert.equal(res.coin, 14); // "1 silver and 4 copper" — copper is the canonical unit
    assert.deepEqual(coins, [14]);
    // parseKill strips the article, so the kill files as "gnoll" in the zone it happened in.
    assert.deepEqual(recorded, [{ mob: "gnoll", killer: "You", zone: "Blackburrow" }]);
    assert.deepEqual(loot, ["Gnoll Fang"]);
    assert.deepEqual(locs, [100]); // EQ reports the triple y-first
  } finally {
    fs.rmSync(file, { force: true });
  }
});

/** A kill log that records everything and dedupes nothing — this file is about the import. */
function stubKillLog(): KillLog {
  return {
    setPlayer() {},
    noteLoc: () => {},
    record: () => true,
    noteLoot: () => true,
    noteCoin: () => true,
    kills: () => [],
    observations: () => [],
    version: () => 0,
    clear() {},
    flush() {},
  };
}

/** Two sittings on one log: a pull each side of a login, in two zones. */
const TWO_SITTINGS = [
  "[Fri Jul 17 18:00:00 2026] Welcome to EverQuest Legends!",
  "[Fri Jul 17 18:00:01 2026] You have entered Blackburrow.",
  "[Fri Jul 17 18:00:10 2026] You slash a gnoll for 30 points of damage.",
  "[Fri Jul 17 18:00:11 2026] A gnoll bites YOU for 4 points of damage.",
  "[Fri Jul 17 18:00:12 2026] You have slain a gnoll!",
  // Long enough after the kill that the fight is closed and the next pull is its own.
  "[Fri Jul 17 20:30:00 2026] Welcome to EverQuest Legends!",
  "[Fri Jul 17 20:30:01 2026] You have entered Qeynos Hills.",
  "[Fri Jul 17 20:30:10 2026] You hit a skeleton for 50 points of fire damage by Firestorm.",
  "[Fri Jul 17 20:30:12 2026] You have slain a skeleton!",
].join("\n");

test("eating a log fills the history tab: a session per login, and the fights in them", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-import-hist-"));
  // Named as EQ names a log, since that's where the importer reads the character from.
  const file = path.join(dir, "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(file, TWO_SITTINGS);
  const history = createCombatHistory(dir, "run:live");

  try {
    const res = importLog(file, stubKillLog(), history);
    assert.equal(res.sessions, 2);
    assert.equal(res.fights, 2);

    // One session per login — and the live session the app is sitting in is untouched.
    const sessions = history.sessions();
    assert.deepEqual(
      sessions.map((s) => s.sessionId),
      ["login:2026-07-17T20:30:00", "login:2026-07-17T18:00:00"],
    );

    // The fights are whole: named after what we killed, with the zone and the damage.
    const [second] = history.fights("login:2026-07-17T20:30:00");
    assert.equal(second.label, "a skeleton");
    assert.equal(second.zone, "Qeynos Hills");
    assert.equal(second.stats.yourDealt, 50);
    const [first] = history.fights("login:2026-07-17T18:00:00");
    assert.equal(first.label, "a gnoll");
    assert.equal(first.stats.yourDealt, 30);
    assert.equal(first.stats.yourTaken, 4);
    assert.equal(first.stats.kills, 1);
    // And the drill-down data came with them, so a stored fight opens like a live one.
    assert.deepEqual(
      (first.stats.damageCells ?? []).map((c) => [c.attacker, c.target, c.source, c.damage]),
      [
        ["You", "a gnoll", "Slash", 30],
        ["a gnoll", "You", "Bite", 4],
      ],
    );

    // Eating it again files nothing *new* — every fight is keyed by the log line behind it — but it
    // does **re-derive** the two it already holds, which is the point of eating a log twice
    // (ADR 0128). Kills and drops still dedupe and report zero; a fight is a summary, not a count.
    const again = importLog(file, stubKillLog(), history);
    assert.equal(again.fights, 0);
    assert.equal(again.refreshed, 2);
    assert.equal(again.superseded, 0);
    assert.equal(again.unsourced, 0);
    assert.equal(history.sessions().length, 2);
    // Re-derived in place: same sittings, same fights, same figures.
    assert.equal(history.fights("login:2026-07-17T18:00:00")[0].stats.yourDealt, 30);
    assert.equal(history.search("").total, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("digesting a log again puts a stale stored fight right — the remedy the app advertises", () => {
  // `data-provenance.ts` marks `combat-history` stale when a parse rule changes and tells you to
  // digest your log again. This is that loop closing: a fight banked by yesterday's rules, and the
  // same fight read by today's. ADR 0095 is the real case — a figure that was simply too low.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-import-stale-"));
  const file = path.join(dir, "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(file, TWO_SITTINGS);

  try {
    // What today's parser makes of the first pull, so the stale copy can be keyed identically.
    const reference = createCombatHistory(dir, "run:a");
    importLog(file, stubKillLog(), reference);
    const real = reference.search("a gnoll").fights[0].stats;
    assert.equal(real.yourDealt, 30);

    // A history holding that fight as an older build read it: same fight, low figures.
    const stale = createCombatHistory(fs.mkdtempSync(path.join(os.tmpdir(), "eql-import-stale2-")), "run:b");
    stale.add({ ...real, yourDealt: 12, totalDealt: 16 }, "Blackburrow", file, "login:2026-07-17T18:00:00");
    assert.equal(stale.search("a gnoll").fights[0].stats.yourDealt, 12);

    const res = importLog(file, stubKillLog(), stale);
    assert.equal(res.refreshed, 1); // the stale one…
    assert.equal(res.fights, 1); // …and the second sitting's, which it never held
    const fixed = stale.search("a gnoll").fights[0];
    assert.equal(fixed.stats.yourDealt, 30); // put right
    assert.equal(fixed.sessionId, "login:2026-07-17T18:00:00"); // and still where it was
    assert.equal(fixed.zone, "Blackburrow");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("eating a log fills the loot feed and the prices it teaches, once", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-import-loot-"));
  const file = path.join(dir, "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(
    file,
    [
      "[Fri Jul 17 18:00:10 2026] You have slain a gnoll!",
      "[Fri Jul 17 18:00:11 2026] --You have looted a Gnoll Fang from a gnoll's corpse.--",
      "[Fri Jul 17 18:00:20 2026] You looted a Snake Egg from an asp's corpse and sold it for 4 copper.",
    ].join("\n"),
  );
  const lootLog = createLootLog(dir);

  try {
    const res = importLog(file, stubKillLog(), undefined, lootLog);
    assert.equal(res.loot, 2);
    assert.deepEqual(lootLog.recent().map((e) => e.item), ["Snake Egg", "Gnoll Fang"]);
    // The auto-sell taught a price, which is the point of eating the loot lines at all.
    assert.deepEqual(lootLog.prices().map((p) => [p.item, p.unitCopper]), [["Snake Egg", 4]]);

    // A second helping adds nothing: the feed is keyed by the log line (ADR 0033).
    assert.equal(importLog(file, stubKillLog(), undefined, lootLog).loot, 0);
    assert.equal(lootLog.recent().length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * The re-eat that gives an old ledger its zones (ADR 0137). The first pass here stands in for a build
 * that recorded no zone at all; the second is the re-read, and it must place the drops it already
 * holds without adding a thing.
 */
test("a second helping places the drops it already holds", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-import-place-"));
  const file = path.join(dir, "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(
    file,
    [
      // A drop *before* any zone line: the log hasn't said where you are, so this one can't be placed
      // by any number of re-reads. That is the honest half of "at least some of them".
      "[Fri Jul 17 17:59:00 2026] --You have looted a Rusty Dagger from a rat's corpse.--",
      "[Fri Jul 17 18:00:00 2026] You have entered Blackburrow 3 (Fused).",
      "[Fri Jul 17 18:00:11 2026] --You have looted a Gnoll Fang from a gnoll's corpse.--",
      "[Fri Jul 17 18:30:00 2026] You have entered The Feerrott.",
      "[Fri Jul 17 18:30:11 2026] --You have looted a Spider Silk from a spiderling's corpse.--",
    ].join("\n"),
  );

  try {
    // Pass one, into a ledger that keeps the drops and throws the zones away — the state on disk for
    // anybody who played before the column existed.
    const old = createLootLog(dir);
    const seeded = importLog(file, stubKillLog(), undefined, {
      ...old,
      add: (event) => old.add({ ...event, zone: undefined }),
    });
    assert.equal(seeded.loot, 3);
    assert.equal(seeded.placed, 0, "nothing to place on a first reading");
    assert.equal(
      old.recent().filter((e) => e.zone).length,
      0,
      "the ledger this stands in for held no zones",
    );
    old.flush();

    // Pass two: the re-read. Two of the three can be placed, and the ledger does not grow.
    const reread = createLootLog(dir);
    const res = importLog(file, stubKillLog(), undefined, reread);
    assert.equal(res.loot, 0, "a placed drop is not an added one");
    assert.equal(res.placed, 2);
    // Flushed the way `reReadLogs` flushes it: the write is debounced, and a repair that is still
    // sitting in memory when the next start reads the file didn't happen.
    reread.flush();

    const ledger = createLootLog(dir);
    assert.equal(ledger.recent().length, 3);
    const zones = new Map(ledger.recent().map((e) => [e.item, e.zone]));
    // Verbatim, difficulty and ruleset included — the reader folds it (ADR 0083).
    assert.equal(zones.get("Gnoll Fang"), "Blackburrow 3 (Fused)");
    assert.equal(zones.get("Spider Silk"), "The Feerrott");
    assert.equal(zones.get("Rusty Dagger"), undefined, "looted before the log said where you were");

    // A third helping has nothing left to do, which is what makes the remedy self-limiting.
    assert.equal(importLog(file, stubKillLog(), undefined, createLootLog(dir)).placed, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("without a history to fill, eating a log still digests kills — and files no fights", () => {
  const file = path.join(os.tmpdir(), `eql-import-nohist-${process.pid}.txt`);
  fs.writeFileSync(file, TWO_SITTINGS);
  try {
    const res = importLog(file, stubKillLog());
    assert.equal(res.kills, 2);
    assert.equal(res.fights, 0);
  } finally {
    fs.rmSync(file, { force: true });
  }
});
