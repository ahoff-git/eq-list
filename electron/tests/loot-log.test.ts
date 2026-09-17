/**
 * Black-box test for the always-on loot feed: it records drops, hands them back newest-first
 * (bounded by the caller's limit), survives a restart, and treats a corrupt legacy file as empty
 * rather than fatal. This is what lets the Loot tab show drops that landed before it was opened.
 *
 * SQLite-backed (ADR 0232): most tests use an in-memory database (fast, and there is no cap left to
 * fill up to force an eviction) — only "survives a restart" needs a real file, since that is the one
 * property an in-memory database cannot demonstrate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { createLootLog, LOOT_LOG_MIGRATIONS, type LootLog } from "../loot-log";
import { openAppDatabase } from "../sqlite-store";
import type { LootEvent } from "../../src/shared/types";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-loot-"));
}

/** A ledger over a fresh in-memory database — fast, and isolated from every other test. */
function freshLog(dir = tempDir()): LootLog {
  const db = new Database(":memory:");
  for (const m of LOOT_LOG_MIGRATIONS) m.up(db);
  return createLootLog(db, dir);
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
  const l = freshLog();
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
  const l = freshLog();
  l.add(drop("Bone Chips", 1)); // recorded before the ledger held a zone at all
  assert.equal(l.recent()[0].zone, undefined);

  assert.equal(l.add({ ...drop("Bone Chips", 1), zone: "Blackburrow 3 (Fused)" }), "placed");
  assert.equal(l.recent()[0].zone, "Blackburrow 3 (Fused)", "kept verbatim — the reader folds it");
  assert.equal(l.recent().length, 1, "placing must never add a row");

  // Nothing left to learn: a second re-read is a no-op rather than a repeated report.
  assert.equal(l.add({ ...drop("Bone Chips", 1), zone: "Blackburrow 3 (Fused)" }), "known");
});

test("a zone already recorded is never overwritten", () => {
  const l = freshLog();
  l.add({ ...drop("Bone Chips", 1), zone: "Blackburrow" });
  // A disagreement between two passes over one line means the *rules* moved, not the facts. Preferring
  // the newer read would make the ledger depend on how many times it had been re-read.
  assert.equal(l.add({ ...drop("Bone Chips", 1), zone: "The Feerrott" }), "known");
  assert.equal(l.recent()[0].zone, "Blackburrow");
});

test("a re-read with nothing to say about the zone changes nothing", () => {
  const l = freshLog();
  l.add({ ...drop("Bone Chips", 1), zone: "Blackburrow" });
  // The log hadn't reported a zone yet at that point in the file — which must not blank the one we have.
  assert.equal(l.add(drop("Bone Chips", 1)), "known");
  assert.equal(l.recent()[0].zone, "Blackburrow");
});

test("a placed zone survives a restart", () => {
  const dir = tempDir();
  const db1 = openAppDatabase(dir, LOOT_LOG_MIGRATIONS);
  const first = createLootLog(db1, dir);
  first.add(drop("Bone Chips", 1));
  first.add({ ...drop("Bone Chips", 1), zone: "Blackburrow" });
  first.flush();
  db1.close();

  const db2 = openAppDatabase(dir, LOOT_LOG_MIGRATIONS);
  assert.equal(createLootLog(db2, dir).recent()[0].zone, "Blackburrow", "a repair that isn't written down didn't happen");
});

test("a price outlives the drop that proved it, once cleared, and folds onto what was already frozen", () => {
  const l = freshLog();
  l.add(sold("Snake Egg", 1, 4));
  l.add(sold("Snake Egg", 2, 4));
  const [before] = l.prices();
  assert.deepEqual([before.item, before.unitCopper, before.qty, before.sales], ["Snake Egg", 4, 2, 2]);

  // Clearing the feed keeps the prices — the sale is retired on the way out rather than thrown away.
  l.clear();
  assert.deepEqual(l.recent(), [], "the drops are gone");
  assert.equal(l.prices()[0].sales, 2, "what the cleared sales taught survives");

  // A later sale folds onto the frozen total rather than replacing it.
  l.add(sold("Snake Egg", 3, 4));
  assert.deepEqual(l.prices().map((p) => [p.item, p.unitCopper, p.sales]), [["Snake Egg", 4, 3]]);

  // Only the second, explicit answer unlearns it.
  l.clear("everything");
  assert.deepEqual(l.prices(), []);
});

test("recent returns drops newest first, capped at the limit", () => {
  const l = freshLog();
  l.add(drop("Bone Chips", 1));
  l.add(drop("Rusty Dagger", 2));
  l.add(drop("Gnoll Fang", 3));
  assert.deepEqual(l.recent().map((e) => e.item), ["Gnoll Fang", "Rusty Dagger", "Bone Chips"]);
  assert.deepEqual(l.recent(2).map((e) => e.item), ["Gnoll Fang", "Rusty Dagger"]);
});

test("the loot ledger survives a restart", () => {
  const dir = tempDir();
  const db1 = openAppDatabase(dir, LOOT_LOG_MIGRATIONS);
  const first = createLootLog(db1, dir);
  first.add(drop("Bone Chips", 1));
  first.flush();
  db1.close();

  const db2 = openAppDatabase(dir, LOOT_LOG_MIGRATIONS);
  assert.deepEqual(createLootLog(db2, dir).recent().map((e) => e.item), ["Bone Chips"]);
});

test("a pre-ADR-0232 loot-log.json is folded in once; the file survives as a provenance stub", () => {
  const dir = tempDir();
  const legacyFile = path.join(dir, "loot-log.json");
  fs.writeFileSync(
    legacyFile,
    JSON.stringify({
      loot: [drop("Bone Chips", 1)],
      retired: [{ item: "Snake Egg", unitCopper: 4, qty: 2, copper: 8, sales: 2, lastAt: "2026-01-01T00:00:01" }],
      provenance: { revision: 1, appVersion: "0.0.0", at: "2026-01-01T00:00:00.000Z" },
    }),
  );

  const l = freshLog(dir);
  assert.deepEqual(l.recent().map((e) => e.item), ["Bone Chips"]);
  assert.deepEqual(l.prices().map((p) => [p.item, p.unitCopper]), [["Snake Egg", 4]]);
  // The file isn't renamed away: `data-health.ts` still reads its `provenance` field directly off
  // disk (see the module doc), carrying the *legacy* stamp forward exactly as it was.
  assert.equal(fs.existsSync(legacyFile), true);
  const stub = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
  assert.deepEqual(stub, { provenance: { revision: 1, appVersion: "0.0.0", at: "2026-01-01T00:00:00.000Z" } });

  // Re-running against the same directory must not double the migrated drop.
  const again = freshLog(dir);
  assert.equal(again.recent().length, 0, "a fresh database, and the stub has nothing left to feed it");
});

test("a corrupt legacy file migrates nothing, rather than crashing the ledger", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "loot-log.json"), "{nope");
  assert.deepEqual(freshLog(dir).recent(), []);
});

test("clearing empties the ledger", () => {
  const l = freshLog();
  l.add(drop("Bone Chips", 1));
  l.clear();
  assert.deepEqual(l.recent(), []);
});

// The ledger is the only complete record of what you have *held*, which is what search falls back
// on when the wiki's index has never heard of the item (ADR 0103).
test("the ledger can name every item it has ever held, most-looted first", () => {
  const l = freshLog();
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

test("items tied on count sort alphabetically, not by SQLite's default byte-order collation", () => {
  // SQLite's default `BINARY` collation sorts every upper-case letter before every lower-case one,
  // so an unadorned `ORDER BY item` would put "Zebra Fang" before "a Bone Chip" — EQ names mix
  // articled drops ("a Bone Chip") with proper nouns ("Zebra Fang") constantly, and most items are
  // looted exactly once, so this tie-break is exercised on nearly every real ledger.
  const l = freshLog();
  l.add(drop("Zebra Fang", 1));
  l.add(drop("a Bone Chip", 2));
  l.add(drop("an Iron Sword", 3));
  l.add(drop("Bat Wing", 4));

  assert.deepEqual(
    l.items().map((i) => i.item),
    ["a Bone Chip", "an Iron Sword", "Bat Wing", "Zebra Fang"],
  );
});

// Folding a grade here would offer a name the game never printed; the caller that wants grades
// pooled owns that fold (`known-items.ts`), and this one only has to be complete.
test("a graded item keeps the spelling the log used", () => {
  const l = freshLog();
  l.add(drop("Dragoon Dirk +2", 1));
  assert.deepEqual(l.items().map((i) => i.item), ["Dragoon Dirk +2"]);
});

test("a sold row written before soldFor existed still prices from its detail text", () => {
  const l = freshLog();
  l.add({ ...drop("Snake Egg", 1), fate: "sold", detail: "4 copper", soldFor: undefined });
  assert.deepEqual(l.prices().map((p) => [p.item, p.unitCopper]), [["Snake Egg", 4]]);
});

test("search narrows by fate across the whole ledger, not just a fetched window", () => {
  const l = freshLog();
  l.add(drop("Bone Chips", 1));
  l.add(sold("Snake Egg", 2, 4));
  assert.deepEqual(l.search({ fate: "sold" }).map((d) => d.item), ["Snake Egg"]);
  assert.deepEqual(l.search({ fate: "kept" }).map((d) => d.item), ["Bone Chips"]);
});

test("search narrows by a substring of the item, case-insensitively", () => {
  const l = freshLog();
  l.add(drop("Bone Chips", 1));
  l.add(drop("Rusty Dagger", 2));
  assert.deepEqual(l.search({ item: "bone" }).map((d) => d.item), ["Bone Chips"]);
  assert.deepEqual(l.search({ item: "DAGGER" }).map((d) => d.item), ["Rusty Dagger"]);
});

test("search treats a literal % or _ in the item text as text, not a LIKE wildcard", () => {
  const l = freshLog();
  l.add(drop("100% Silk", 1));
  l.add(drop("100X Silk", 2));
  assert.deepEqual(l.search({ item: "100%" }).map((d) => d.item), ["100% Silk"]);
});

test("search narrows by the exact corpse", () => {
  const l = freshLog();
  l.add({ ...drop("Bone Chips", 1), source: "a kobold" });
  l.add({ ...drop("Rusty Dagger", 2), source: "a gnoll" });
  assert.deepEqual(l.search({ source: "a gnoll" }).map((d) => d.item), ["Rusty Dagger"]);
});

// Same three spellings `loot-filters.test.ts` uses for `lootZones`/`filterLoot` — one camp, three
// wordings the log actually wrote (ADR 0136).
test("search's zone is a place — every difficulty on record folds into it", () => {
  const l = freshLog();
  l.add({ ...drop("Bone Chips", 1), zone: "Blackburrow" });
  l.add({ ...drop("Rusty Dagger", 2), zone: "Blackburrow 3 (Fused)" });
  l.add({ ...drop("Rat Ear", 3), zone: "the blackburrow 1 (Awakened)" });
  l.add({ ...drop("Spider Silk", 4), zone: "The Feerrott 2" });

  assert.deepEqual(
    l.search({ zone: "Blackburrow" }).map((d) => d.item).sort(),
    ["Bone Chips", "Rat Ear", "Rusty Dagger"],
  );
  assert.deepEqual(l.search({ zone: "The Feerrott" }).map((d) => d.item), ["Spider Silk"]);
});

test("search's zone matches nothing when no recorded spelling folds to that place", () => {
  const l = freshLog();
  l.add({ ...drop("Bone Chips", 1), zone: "Blackburrow" });
  assert.deepEqual(l.search({ zone: "The Feerrott" }), []);
});

test("search combines every given filter", () => {
  const l = freshLog();
  l.add(drop("Bone Chips", 1));
  l.add(sold("Bone Chips", 2, 2));
  const found = l.search({ item: "bone", fate: "sold" });
  assert.deepEqual(found.map((d) => d.item), ["Bone Chips"]);
  assert.equal(found[0].fate, "sold");
});

test("search with no filter at all still reaches the whole ledger", () => {
  const l = freshLog();
  for (let i = 1; i <= 5; i++) l.add(drop(`Item ${i}`, i));
  assert.equal(l.search({}).length, 5);
});

// `dropsPage` (ADR 0254) is `search`'s server-paged sibling — same filter, plus offset/limit/sort
// and a `total`/`tallies` pair so the caller never has to fetch the whole matching set to page or
// tally it.
test("dropsPage pages through the whole ledger, newest first by default", () => {
  const l = freshLog();
  for (let i = 1; i <= 5; i++) l.add(drop(`Item ${i}`, i));
  const first = l.dropsPage({ offset: 0, limit: 2, sortField: "at", sortDesc: true, filter: {} });
  assert.deepEqual(first.rows.map((r) => r.item), ["Item 5", "Item 4"]);
  assert.equal(first.total, 5);
  const second = l.dropsPage({ offset: 2, limit: 2, sortField: "at", sortDesc: true, filter: {} });
  assert.deepEqual(second.rows.map((r) => r.item), ["Item 3", "Item 2"]);
});

test("dropsPage sorts by any allow-listed column, ascending or descending", () => {
  const l = freshLog();
  l.add(drop("Zebra Fang", 1));
  l.add(drop("Bone Chips", 2));
  const asc = l.dropsPage({ offset: 0, limit: 10, sortField: "item", sortDesc: false, filter: {} });
  assert.deepEqual(asc.rows.map((r) => r.item), ["Bone Chips", "Zebra Fang"]);
  const desc = l.dropsPage({ offset: 0, limit: 10, sortField: "item", sortDesc: true, filter: {} });
  assert.deepEqual(desc.rows.map((r) => r.item), ["Zebra Fang", "Bone Chips"]);
});

test("dropsPage applies the same filter search does, and total/tallies cover every match, not just the page", () => {
  const l = freshLog();
  l.add(drop("Bone Chips", 1));
  l.add(sold("Bone Chips", 2, 4));
  l.add(sold("Snake Egg", 3, 6, 2));
  const page = l.dropsPage({ offset: 0, limit: 1, sortField: "at", sortDesc: true, filter: { fate: "sold" } });
  assert.equal(page.rows.length, 1, "the page itself is bounded by limit");
  assert.equal(page.total, 2, "but total counts every sold row, not just this page");
  assert.deepEqual(page.tallies, { kept: 0, sold: 3, stored: 0, combined: 0 }, "qty summed across every sold row");
});

test("dropsPage's zone filter folds every difficulty into one place, same as search's", () => {
  const l = freshLog();
  l.add({ ...drop("Bone Chips", 1), zone: "Blackburrow" });
  l.add({ ...drop("Rusty Dagger", 2), zone: "Blackburrow 3 (Fused)" });
  l.add({ ...drop("Spider Silk", 3), zone: "The Feerrott 2" });
  const page = l.dropsPage({ offset: 0, limit: 10, sortField: "at", sortDesc: true, filter: { zone: "Blackburrow" } });
  assert.deepEqual(page.rows.map((r) => r.item).sort(), ["Bone Chips", "Rusty Dagger"]);
  assert.equal(page.total, 2);
});

test("dropsPage answers empty, not an error, when the filter matches nothing", () => {
  const l = freshLog();
  l.add(drop("Bone Chips", 1));
  const page = l.dropsPage({ offset: 0, limit: 10, sortField: "at", sortDesc: true, filter: { zone: "The Feerrott" } });
  assert.deepEqual(page, { rows: [], total: 0, tallies: { kept: 0, sold: 0, stored: 0, combined: 0 } });
});

test("vocabulary lists every corpse and raw zone spelling the ledger has ever recorded", () => {
  const l = freshLog();
  l.add({ ...drop("Bone Chips", 1), source: "a kobold", zone: "Blackburrow" });
  l.add({ ...drop("Rusty Dagger", 2), source: "a gnoll", zone: "Blackburrow 3 (Fused)" });
  l.add({ ...drop("Gnoll Fang", 3), source: "a gnoll" }); // no zone recorded for this one

  const vocab = l.vocabulary();
  assert.deepEqual(vocab.sources.slice().sort(), ["a gnoll", "a kobold"]);
  // Raw, as the log wrote them — folding into places is the caller's job, same as `LootVocabulary` says.
  assert.deepEqual(vocab.zones.slice().sort(), ["Blackburrow", "Blackburrow 3 (Fused)"]);
});

test("the admin panel can browse, edit and remove a drop", () => {
  const l = freshLog();
  l.add(drop("Bone Chips", 1));
  const [record] = l.admin.list();
  assert.equal(record.summary, "Bone Chips x1 — no zone (2026-07-29T00:00:01)");

  assert.deepEqual(l.admin.patch(record.id, "zone", "Blackburrow"), { ok: true });
  assert.equal(l.recent()[0].zone, "Blackburrow");
  assert.equal(l.admin.get(record.id)?.edited, true);

  assert.deepEqual(l.admin.remove(record.id), { ok: true });
  assert.deepEqual(l.recent(), []);
  assert.deepEqual(l.admin.remove(record.id), { ok: false, error: "no such record" });
});

/**
 * `prices()` moved its actual computation to a background worker thread (ADR 0247) — but that
 * needs a real, file-backed database (a second `:memory:` connection is a distinct, empty
 * database, not a view onto the first), unlike every other test in this file, which uses
 * `freshLog()`'s in-memory one for speed. This one specifically exercises the real worker.
 */
test("a background refresh eventually confirms the same prices the synchronous path already gave", async () => {
  const dir = tempDir();
  const db = openAppDatabase(dir, LOOT_LOG_MIGRATIONS);
  const l = createLootLog(db, dir);
  let changed = 0;
  l.onPricesChanged(() => changed++);

  l.add(sold("Snake Egg", 1, 4));
  l.add(sold("Snake Egg", 2, 4));

  const immediate = l.prices();
  assert.deepEqual(
    [immediate[0]?.item, immediate[0]?.qty, immediate[0]?.copper],
    ["Snake Egg", 2, 8],
    "correct immediately, before any background refresh could possibly have run",
  );

  const deadline = Date.now() + 5000;
  while (changed === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(changed > 0, "the background worker never confirmed a refresh within 5s");
  const settled = l.prices();
  assert.deepEqual(
    [settled[0]?.item, settled[0]?.qty, settled[0]?.copper],
    ["Snake Egg", 2, 8],
    "the background-confirmed answer agrees with the synchronous one",
  );
});
