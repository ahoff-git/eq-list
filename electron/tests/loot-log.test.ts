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
  assert.equal(l.add(drop("Bone Chips", 1)), "added");
  assert.equal(l.add(drop("Bone Chips", 1)), "known", "the same line says so rather than landing twice");
  assert.deepEqual(l.recent().map((e) => e.item), ["Bone Chips"]);
  // A genuinely later drop of the same item is a different line, and counts.
  assert.equal(l.add(drop("Bone Chips", 2)), "added");
  assert.equal(l.recent().length, 2);
});

/**
 * The re-read case (ADR 0137): the ledger holds a drop it could not place, and a second pass over the
 * same log arrives with the zone. Filling that in is not counting the drop twice — which is the rule
 * ADR 0033 protects — so it is allowed, and reported apart from an addition.
 */
test("a drop already filed can still learn where it was", () => {
  const l = createLootLog(tempDir());
  l.add(drop("Bone Chips", 1)); // recorded before the ledger held a zone at all
  assert.equal(l.recent()[0].zone, undefined);

  assert.equal(l.add({ ...drop("Bone Chips", 1), zone: "Blackburrow 3 (Fused)" }), "placed");
  assert.equal(l.recent()[0].zone, "Blackburrow 3 (Fused)", "kept verbatim — the reader folds it");
  assert.equal(l.recent().length, 1, "placing must never add a row");

  // Nothing left to learn: a second re-read is a no-op rather than a repeated report.
  assert.equal(l.add({ ...drop("Bone Chips", 1), zone: "Blackburrow 3 (Fused)" }), "known");
});

test("a zone already recorded is never overwritten", () => {
  const l = createLootLog(tempDir());
  l.add({ ...drop("Bone Chips", 1), zone: "Blackburrow" });
  // A disagreement between two passes over one line means the *rules* moved, not the facts. Preferring
  // the newer read would make the ledger depend on how many times it had been re-read.
  assert.equal(l.add({ ...drop("Bone Chips", 1), zone: "The Feerrott" }), "known");
  assert.equal(l.recent()[0].zone, "Blackburrow");
});

test("a re-read with nothing to say about the zone changes nothing", () => {
  const l = createLootLog(tempDir());
  l.add({ ...drop("Bone Chips", 1), zone: "Blackburrow" });
  // The log hadn't reported a zone yet at that point in the file — which must not blank the one we have.
  assert.equal(l.add(drop("Bone Chips", 1)), "known");
  assert.equal(l.recent()[0].zone, "Blackburrow");
});

test("a placed zone survives a restart", () => {
  const dir = tempDir();
  const first = createLootLog(dir);
  first.add(drop("Bone Chips", 1));
  first.add({ ...drop("Bone Chips", 1), zone: "Blackburrow" });
  first.flush();
  assert.equal(createLootLog(dir).recent()[0].zone, "Blackburrow", "a repair that isn't written down didn't happen");
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

// The ledger is the only complete record of what you have *held*, which is what search falls back
// on when the wiki's index has never heard of the item (ADR 0103).
test("the ledger can name every item it has ever held, most-looted first", () => {
  const l = createLootLog(tempDir());
  l.add(drop("Bone Chips", 1));
  l.add({ ...drop("Bone Chips", 2), qty: 4 });
  l.add(drop("Desecrated Kejaar Totem", 3));

  assert.deepEqual(
    l.items().map((i) => [i.item, i.count, i.qty]),
    [
      ["Bone Chips", 2, 5],
      ["Desecrated Kejaar Totem", 1, 1],
    ],
  );
  assert.equal(l.items()[0].lastAt, "2026-07-29T00:00:02", "the latest sighting, not the first");
});

// Folding a grade here would offer a name the game never printed; the caller that wants grades
// pooled owns that fold (`known-items.ts`), and this one only has to be complete.
test("a graded item keeps the spelling the log used", () => {
  const l = createLootLog(tempDir());
  l.add(drop("Dragoon Dirk +2", 1));
  assert.deepEqual(l.items().map((i) => i.item), ["Dragoon Dirk +2"]);
});
