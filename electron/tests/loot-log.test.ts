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
