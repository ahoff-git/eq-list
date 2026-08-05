/**
 * Black-box test for the always-on loot feed: it records drops, hands them back newest-first
 * (bounded by the caller's limit), survives a restart, and treats a corrupt file as empty rather
 * than fatal. This is what lets the Loot tab show drops that landed before it was opened.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLootLog } from "../loot-log";
import type { LootEvent } from "../../src/shared/types";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-loot-"));
}

function drop(item: string, sec: number): LootEvent {
  return {
    kind: "loot",
    item,
    qty: 1,
    source: "a kobold",
    fate: "kept",
    logId: sec,
    raw: `looted ${item}`,
    at: `2026-07-29T00:00:${String(sec).padStart(2, "0")}`,
  };
}

/** An auto-sold drop, which is the only kind that states a price. */
function sold(item: string, sec: number, copper: number, qty = 1): LootEvent {
  return { ...drop(item, sec), qty, fate: "sold", soldFor: copper, detail: `${copper} copper` };
}

test("the same loot line twice is one drop — a replayed gap isn't a second Bone Chips", () => {
  const l = createLootLog(tempDir());
  l.add(drop("Bone Chips", 1));
  l.add(drop("Bone Chips", 1));
  assert.deepEqual(l.recent().map((e) => e.item), ["Bone Chips"]);
  // A genuinely later drop of the same item is a different line, and counts.
  l.add(drop("Bone Chips", 2));
  assert.equal(l.recent().length, 2);
});

test("a price outlives the drop that proved it", () => {
  const l = createLootLog(tempDir());
  l.add(sold("Snake Egg", 1, 4));
  l.add(sold("Snake Egg", 2, 4));
  const [before] = l.prices();
  assert.deepEqual([before.item, before.unitCopper, before.qty, before.sales], ["Snake Egg", 4, 2, 2]);

  // Push both sales out of the feed. The ledger forgets the lines; the price it learned stays.
  for (let i = 0; i < 20_050; i++) l.add(drop("Bone Chips", 1000 + i));
  assert.equal(l.recent(50_000).some((e) => e.item === "Snake Egg"), false, "the drops aged out");
  const [after] = l.prices();
  assert.deepEqual([after.item, after.unitCopper, after.qty, after.sales], ["Snake Egg", 4, 2, 2]);

  // Clearing the feed keeps the prices — including any sale still in it, which is retired on the
  // way out rather than thrown away.
  l.add(sold("Snake Egg", 90_000, 4));
  l.clear();
  assert.equal(l.prices()[0].sales, 3, "the sale still in the feed was kept too");
  assert.deepEqual(l.recent(), []);
  assert.deepEqual(l.prices().map((p) => [p.item, p.unitCopper]), [["Snake Egg", 4]]);

  // Only the second, explicit answer unlearns them.
  l.clear("everything");
  assert.deepEqual(l.prices(), []);
});

test("recent returns drops newest first, capped at the limit", () => {
  const l = createLootLog(tempDir());
  l.add(drop("Bone Chips", 1));
  l.add(drop("Rusty Dagger", 2));
  l.add(drop("Gnoll Fang", 3));
  assert.deepEqual(l.recent().map((e) => e.item), ["Gnoll Fang", "Rusty Dagger", "Bone Chips"]);
  assert.deepEqual(l.recent(2).map((e) => e.item), ["Gnoll Fang", "Rusty Dagger"]);
});

test("the loot ledger survives a restart", () => {
  const dir = tempDir();
  const first = createLootLog(dir);
  first.add(drop("Bone Chips", 1));
  first.flush();
  assert.deepEqual(createLootLog(dir).recent().map((e) => e.item), ["Bone Chips"]);
});

test("clearing empties the ledger, and a corrupt file is not fatal", () => {
  const dir = tempDir();
  const l = createLootLog(dir);
  l.add(drop("Bone Chips", 1));
  l.clear();
  assert.deepEqual(l.recent(), []);

  const broken = tempDir();
  fs.writeFileSync(path.join(broken, "loot-log.json"), "{nope");
  assert.deepEqual(createLootLog(broken).recent(), []);
});
