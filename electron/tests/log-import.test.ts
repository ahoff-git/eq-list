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
