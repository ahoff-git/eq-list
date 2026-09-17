/**
 * loot-log.ts — a running record of what you've looted, kept in the main process so it's
 * complete whether or not the Loot tab is open.
 *
 * The renderer used to accumulate the loot feed itself, which meant it only saw drops that
 * landed while the tab was mounted — open it and the list was empty until the next kill. This
 * owns the feed instead: the watcher hands every `LootEvent` here, the tab reads the history on
 * open and then follows live ones. Persisted to disk, so the ledger survives a restart.
 *
 * Eating a past log feeds this too: it's a catch-up, and the feed is a *history* of what dropped,
 * so a log the app wasn't running for belongs in it as much as tonight's does (ADR 0055). Every
 * drop is keyed by its log line, which is what makes that safe to do twice.
 *
 * **Backed by SQLite, not a capped JSON array** ([ADR 0232](../specs/decisions/0232-a-ledger-that-outlives-its-cap-is-a-database.md),
 * following `faction-log.ts`'s pilot). The ledger keeps every drop forever — there is no
 * `MAX_LOOT` to evict past — and `items()` (the vocabulary search falls back to, ADR 0103) is
 * complete for the same reason: nothing it counted can silently age out from under it anymore.
 * The one place the old `retired` idea survives is `clear("records")`: asked to forget the drops
 * but keep what they taught, it freezes the current merged prices into `loot_prices_frozen` (a
 * snapshot, not an eviction side effect) and only then deletes the drops.
 *
 * **`loot-log.json` still exists, but only as a provenance stamp.** `data-health.ts` and
 * `log-reread.ts`'s unattended-re-read mechanism (ADR 0129) read this file's `provenance` field
 * directly off disk, independent of this store. The file goes on existing as a tiny stub carrying
 * nothing but the stamp, rewritten (still debounced, still through `json-store.ts`) on every
 * mutation — a migrated-away file would read as `state: "absent"` forever, quietly disabling the
 * self-healing re-read for this concern.
 */
import fs from "node:fs";
import path from "node:path";
import type { Database } from "better-sqlite3";
import { createLogger } from "../src/shared/logging";
import { placeKey } from "../src/shared/zones/place";
import type { AdminAudit, AdminScalar } from "../src/shared/admin";
import type { DataStamp } from "../src/shared/data-provenance";
import type {
  ForgetScope,
  ItemPrice,
  LootDropSortField,
  LootDropsPage,
  LootDropsQuery,
  LootedItem,
  LootEvent,
  LootFate,
  LootRecord,
  LootSearchFilter,
  LootVocabulary,
} from "../src/shared/types";
import { createSaver, readJson, writeJson } from "./json-store";
import { DEFAULT_LIMIT, likeEscape, type Migration } from "./sqlite-store";
import { createSqlAdminStore, type AdminStore } from "./admin";
import { createBackgroundCache } from "./background-cache";
import { computeLootPrices } from "./loot-prices";

const log = createLogger("loot-log");

/** Drops arrive in bursts; coalesce the provenance-stamp writes the same way the old full-file
 *  saver did. */
const WRITE_DEBOUNCE_MS = 3000;

/**
 * What `add` did with a drop.
 *
 * Three answers rather than a boolean, because a re-read has three possible outcomes and the caller
 * counts them differently: `added` is a drop the ledger had never seen, `placed` is one it held but
 * could not say where, and `known` is nothing to do
 * ([ADR 0137](../specs/decisions/0137-a-filed-drop-can-still-learn-where-it-was.md)).
 *
 * **Not a boolean with a side effect.** Every one of these is truthy, so a caller that tested the old
 * `add(...)` for truth now counts a re-read's whole file as new drops — which is exactly the kind of
 * silent miscount ADR 0033 exists to prevent, and a union makes it a compile error instead.
 */
export type LootAdded = "added" | "placed" | "known";

export const LOOT_LOG_MIGRATIONS: readonly Migration[] = [
  {
    version: 2,
    label: "loot_records",
    up(db) {
      db.exec(`
        CREATE TABLE loot_records (
          key TEXT PRIMARY KEY,
          at TEXT NOT NULL,
          fate TEXT NOT NULL,
          detail TEXT,
          soldFor INTEGER,
          item TEXT NOT NULL,
          qty INTEGER NOT NULL,
          source TEXT NOT NULL,
          zone TEXT,
          raw TEXT NOT NULL,
          logId INTEGER NOT NULL,
          adminAudit TEXT
        );
        CREATE INDEX loot_records_at_idx ON loot_records(at);
        CREATE INDEX loot_records_item_idx ON loot_records(item);

        CREATE TABLE loot_prices_frozen (
          item TEXT PRIMARY KEY,
          unitCopper INTEGER NOT NULL,
          qty INTEGER NOT NULL,
          copper INTEGER NOT NULL,
          sales INTEGER NOT NULL,
          lastAt TEXT NOT NULL
        );
      `);
    },
  },
  {
    version: 5,
    label: "loot_records_source_zone_idx",
    up(db) {
      // `search()`/`vocabulary()` (ADR 0240) filter and `SELECT DISTINCT` on exactly these two
      // columns, now that they reach the whole ledger rather than a small fetched window — `source`
      // and `zone` are both high-cardinality (one row per corpse/camp, not per fate), so a table scan
      // that cost nothing over a few hundred fetched rows costs real time over the tens of thousands
      // a long-lived character's ledger has no cap left to stop growing into (ADR 0232).
      db.exec(`
        CREATE INDEX loot_records_source_idx ON loot_records(source);
        CREATE INDEX loot_records_zone_idx ON loot_records(zone);
      `);
    },
  },
  {
    version: 8,
    label: "loot_records_fate_idx",
    up(db) {
      // `prices()` (ADR 0247) filters `WHERE fate = 'sold'` on every recompute — missed when
      // `source`/`zone` were indexed alongside it (ADR 0241). Low-cardinality (four fates), but a
      // real win here: a sale is typically a small slice of everything looted, so an index lets
      // SQLite go straight to that slice instead of scanning every kept/stored/combined row too.
      db.exec(`CREATE INDEX loot_records_fate_idx ON loot_records(fate);`);
    },
  },
];

export interface LootLog {
  /**
   * Record a looted drop, live or eaten from a past log. Keyed by its log line, so a replayed gap
   * — or a log eaten after it was watched — can't file the same drop twice (ADR 0033's rule; it
   * matters more now that a sale's price outlives the drop that proved it). Returns whether it
   * was new, so an importer can count what it actually added.
   *
   * Takes a `LootRecord` — the line plus the zone the caller was standing in, since no loot line
   * names one ([ADR 0136](../specs/decisions/0136-logged-data-says-where-it-happened.md)). Built by
   * `lootRecord`, because the caller is the one holding the log's current zone. Kept **verbatim** per
   * ADR 0083: the difficulty is part of what was recorded, and the reader folds it.
   *
   * **A drop already filed may still be placed.** ADR 0033 keys a drop by its line and skips it on
   * sight, because a drop is a *count* and counting one twice corrupts a rate. Filling in a field it
   * was missing is not counting it again — nothing is added, one row learns where it was — so a
   * re-read can place the drops it already holds
   * ([ADR 0137](../specs/decisions/0137-a-filed-drop-can-still-learn-where-it-was.md)). Only ever
   * a **gap**: a row that already names a zone is never overwritten.
   */
  add(event: LootRecord): LootAdded;
  /** The most recent drops, newest first (at most `limit`). */
  recent(limit?: number): LootRecord[];
  /**
   * What each item has vendored for: every auto-sell on record, live or long since cleared. A price
   * is knowledge about the item, so it can't be allowed to expire with the line that taught it
   * (ADR 0056). Answered from a `createBackgroundCache` (ADR 0247) rather than folding every sold
   * row fresh on each call — still synchronous and always correct, see `background-cache.ts`'s own
   * contract.
   */
  prices(): ItemPrice[];
  /**
   * Fires once a *background* refresh of `prices()`'s cache actually lands a fresher answer (ADR
   * 0247) — never on every call, and never for a merely-synchronous one.
   */
  onPricesChanged(cb: () => void): void;
  /**
   * Every distinct item the ledger holds, most-looted first — the names you have actually held.
   *
   * Its caller is **search**: the wiki has never heard of a good deal of what this build drops, so
   * a query its index can't match is answered from here instead (ADR 0103).
   */
  items(): LootedItem[];
  /**
   * Every drop matching every given filter, reached across the **whole** ledger — not just
   * whatever's already been fetched. `LootPanel.tsx`'s filter bar calls this the moment any filter
   * engages, the same "the common case costs nothing, a filter reaches everything" split
   * [ADR 0211](../specs/decisions/0211-a-loot-filter-searches-the-ledger-not-the-window.md)
   * established — except that ADR's `SEARCH_FETCH = 20_000` was calibrated to the ledger's *old*
   * cap (`MAX_LOOT`), which no longer exists (ADR 0232): a character with more drops than that
   * fetch limit could once again silently fail to find an old item, the exact bug ADR 0211 fixed,
   * just past a higher threshold. This answers with a real query instead, unlimited. `wantedOnly`
   * stays the caller's own job — it depends on the shopping list, which this store has never known
   * about and has no reason to start.
   */
  search(filter: LootSearchFilter): LootRecord[];
  /**
   * One page of the whole ledger, filtered and sorted server-side — what `DropTable` asks for as
   * the player pages, sorts (by anything but `zone`) or filters it, instead of paging client-side
   * over an already-fetched `search()` array
   * ([ADR 0254](../specs/decisions/0254-loot-drops-pages-server-side-for-the-common-case.md),
   * superseding [ADR 0250](../specs/decisions/0250-loot-drops-reaches-the-whole-ledger-unconditionally.md)
   * for this case). Mirrors `faction-log.ts`'s `hitsPage` exactly.
   */
  dropsPage(query: LootDropsQuery): LootDropsPage;
  /**
   * Every corpse and zone the ledger has ever recorded a drop from — see `LootVocabulary`'s own
   * doc on why this reaches the whole ledger rather than whatever's currently fetched.
   */
  vocabulary(): LootVocabulary;
  /**
   * Forget the feed. **Prices survive by default** — they're what the ledger *taught*, they hold
   * wherever the item drops, and no amount of tidying up the feed is a request to unlearn them
   * (ADR 0056). `"everything"` is the deliberate, asked-for wipe.
   */
  clear(scope?: ForgetScope): void;
  /** No pending write ever outlives this call — every write here is already synchronous, so this
   *  is kept only so a caller that flushed the old debounced JSON writer still has something to call. */
  flush(): void;
  /** The hidden admin panel's view of these records — see `electron/admin.ts`. */
  admin: AdminStore;
}

/**
 * A drop's identity: the log line behind it, the same shape the kill log keys its drops by
 * (ADR 0033). Two identical items off the same corpse in the same logged second collapse into
 * one — the trade that ADR made, and under-counting is the safer way to be wrong.
 */
const lootKey = (e: LootEvent): string => `${e.at} ${e.item.toLowerCase()} ${e.source.toLowerCase()}`;

interface LootRow {
  key: string;
  at: string;
  fate: LootFate;
  detail: string | null;
  soldFor: number | null;
  item: string;
  qty: number;
  source: string;
  zone: string | null;
  raw: string;
  logId: number;
  adminAudit: string | null;
}

function rowToRecord(r: LootRow): LootRecord {
  return {
    kind: "loot",
    logId: r.logId,
    raw: r.raw,
    at: r.at,
    fate: r.fate,
    item: r.item,
    qty: r.qty,
    source: r.source,
    ...(r.detail !== null ? { detail: r.detail } : {}),
    ...(r.soldFor !== null ? { soldFor: r.soldFor } : {}),
    ...(r.zone !== null ? { zone: r.zone } : {}),
  };
}

/** Columns `dropsPage` may sort by — an allow-list, so a caller's sort field is never interpolated
 *  into SQL as anything but one of these fixed expressions. No `zone` entry: see `LootDropSortField`'s
 *  own doc for why. */
const DROP_SORT_COLUMNS: Record<LootDropSortField, string> = {
  at: "at",
  item: "LOWER(item)",
  source: "LOWER(source)",
  qty: "qty",
  fate: "fate",
};

/** Every fate present at zero, the same shape `loot-filters.ts`'s `tallyFates` starts from — so a
 *  fate with nothing matching still has a key `LootPanel`'s header can read rather than `undefined`. */
const EMPTY_TALLIES: Record<LootFate, number> = { kept: 0, sold: 0, stored: 0, combined: 0 };

export function createLootLog(db: Database, userDataDir: string): LootLog {
  const file = path.join(userDataDir, "loot-log.json");
  migrateFromLegacyJson(db, userDataDir, file);
  // Carries **only** the provenance stamp now — see the module doc.
  const saver = createSaver(file, "loot log", () => ({}), WRITE_DEBOUNCE_MS, { concern: "loot-log" });

  const selectByKey = db.prepare(`SELECT * FROM loot_records WHERE key = ?`);
  const insertRecord = db.prepare(`
    INSERT INTO loot_records (key, at, fate, detail, soldFor, item, qty, source, zone, raw, logId)
    VALUES (@key, @at, @fate, @detail, @soldFor, @item, @qty, @source, @zone, @raw, @logId)
  `);
  const updateZone = db.prepare(`UPDATE loot_records SET zone = ? WHERE key = ?`);
  const selectRecent = db.prepare(`SELECT * FROM loot_records ORDER BY at DESC, rowid DESC LIMIT ?`);
  const selectAll = db.prepare(`SELECT * FROM loot_records ORDER BY at DESC, rowid DESC`);
  const countAll = db.prepare(`SELECT COUNT(*) as n FROM loot_records`);
  const countEdited = db.prepare(`SELECT COUNT(*) as n FROM loot_records WHERE adminAudit IS NOT NULL`);
  const upsertFrozenPrice = db.prepare(`
    INSERT INTO loot_prices_frozen (item, unitCopper, qty, copper, sales, lastAt)
    VALUES (@item, @unitCopper, @qty, @copper, @sales, @lastAt)
    ON CONFLICT(item) DO UPDATE SET
      unitCopper = excluded.unitCopper, qty = excluded.qty, copper = excluded.copper,
      sales = excluded.sales, lastAt = excluded.lastAt
  `);
  // No `ORDER BY item` here — SQLite's default `BINARY` collation sorts byte-for-byte (every
  // upper-case letter before every lower-case one), not the locale-aware order `items()`'s own
  // comparator below needs: EQ's own item names mix "a Bone Chip"-style articles with proper nouns
  // like "Zebra Fang", and under `BINARY` every proper noun would sort before every article, not
  // alphabetically among them. The tie-break is done in JS instead, below.
  const selectItems = db.prepare(`
    SELECT item, COUNT(*) as count, SUM(qty) as qty, MAX(at) as lastAt
    FROM loot_records GROUP BY item
  `);
  const selectDistinctSources = db.prepare(`SELECT DISTINCT source FROM loot_records ORDER BY source`);
  const selectDistinctZones = db.prepare(`SELECT DISTINCT zone FROM loot_records WHERE zone IS NOT NULL`);
  const deleteRecords = db.prepare(`DELETE FROM loot_records`);
  const deleteFrozenPrices = db.prepare(`DELETE FROM loot_prices_frozen`);
  const deleteRecord = db.prepare(`DELETE FROM loot_records WHERE key = ?`);
  const updateAudit = db.prepare(`UPDATE loot_records SET adminAudit = ? WHERE key = ?`);

  /**
   * `search()`/`dropsPage()`'s shared `WHERE`/params builder. `null` means the filter resolves to
   * no rows at all (a `zone` that folds to nothing on record) — both callers treat that as an empty
   * answer without running a query, the same short-circuit `search()` always took.
   */
  function buildDropWhere(filter: LootSearchFilter): { where: string; params: unknown[] } | null {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.fate) {
      clauses.push("fate = ?");
      params.push(filter.fate);
    }
    const item = filter.item?.trim();
    if (item) {
      clauses.push("LOWER(item) LIKE LOWER(?) ESCAPE '\\'");
      params.push(`%${likeEscape(item)}%`);
    }
    if (filter.source) {
      clauses.push("source = ?");
      params.push(filter.source);
    }
    if (filter.zone) {
      // `zone` is a *place* — resolved here to every raw spelling on record that folds to it
      // (difficulty variants, a map pack's own letter-out wording — ADR 0083/0075), the same fold
      // `filterLoot`'s own zone matching already did against whatever had been fetched.
      const place = placeKey(filter.zone);
      const rawZones = (selectDistinctZones.all() as { zone: string }[])
        .map((r) => r.zone)
        .filter((z) => placeKey(z) === place);
      if (!rawZones.length) return null; // nothing recorded ever folds to this place
      clauses.push(`zone IN (${rawZones.map(() => "?").join(", ")})`);
      params.push(...rawZones);
    }
    return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
  }

  function paramsOf(event: LootRecord) {
    return {
      key: lootKey(event),
      at: event.at,
      fate: event.fate,
      detail: event.detail ?? null,
      soldFor: event.soldFor ?? null,
      item: event.item,
      qty: event.qty,
      source: event.source,
      zone: event.zone ?? null,
      raw: event.raw,
      logId: event.logId,
    };
  }

  // `prices()` used to fold every sold row fresh on each call — no index on `fate` meant a full
  // sequential scan of a table with no cap on its size (ADR 0232/0243), and it was triggered by
  // every loot line, sale or not, since `LootPanel.tsx` keys its price read on the newest drop.
  // `createBackgroundCache` (ADR 0247) keeps that off the main thread instead; still synchronous
  // and always correct to call — see `background-cache.ts`'s own contract.
  const pricesCache = createBackgroundCache<ItemPrice[]>({
    label: "loot prices",
    computeSync: () => computeLootPrices(db),
    dbFile: db.memory ? null : db.name,
    modulePath: path.join(__dirname, "loot-prices.js"),
    exportName: "computeLootPrices",
  });

  return {
    add(event) {
      const key = lootKey(event);
      // The same line again — a replayed gap, a re-read, or a log eaten twice. Not a second drop,
      // but possibly the first time we can say where it happened (ADR 0137). Gaps only: an existing
      // zone is left alone, since a disagreement means the *rules* moved, not the facts.
      const held = selectByKey.get(key) as LootRow | undefined;
      if (held) {
        if (!event.zone || held.zone) return "known";
        updateZone.run(event.zone, key);
        saver.save();
        return "placed";
      }
      insertRecord.run(paramsOf(event));
      saver.save();
      pricesCache.markChanged(); // may be a sold row — a placed-zone update above never affects a price
      return "added";
    },

    recent: (limit = DEFAULT_LIMIT) => (selectRecent.all(limit) as LootRow[]).map(rowToRecord),

    prices: () => pricesCache.get(),

    onPricesChanged(cb) {
      pricesCache.onRefreshed(cb);
    },

    // Sorted here, not by the query: see `selectItems`'s own comment on why `ORDER BY item` would
    // give the wrong tie-break for a count SQLite ties on constantly (most items are looted once).
    items: () =>
      (selectItems.all() as LootedItem[])
        .map((r) => ({ item: r.item, count: r.count, qty: r.qty, lastAt: r.lastAt }))
        .sort((a, b) => b.count - a.count || a.item.localeCompare(b.item)),

    search(filter) {
      const built = buildDropWhere(filter);
      if (!built) return [];
      const { where, params } = built;
      return (
        db.prepare(`SELECT * FROM loot_records ${where} ORDER BY at DESC, rowid DESC`).all(...params) as LootRow[]
      ).map(rowToRecord);
    },

    dropsPage({ offset, limit, sortField, sortDesc, filter = {} }) {
      const built = buildDropWhere(filter);
      if (!built) return { rows: [], total: 0, tallies: { ...EMPTY_TALLIES } };
      const { where, params } = built;
      const col = DROP_SORT_COLUMNS[sortField] ?? DROP_SORT_COLUMNS.at;
      const dir = sortDesc ? "DESC" : "ASC";
      // Same clamp `faction-log.ts`'s `hitsPage` applies, and for the same reason: a negative
      // `LIMIT` means "no limit at all" to SQLite, which is exactly the whole-ledger cost this
      // query exists to avoid.
      const safeLimit = Math.max(0, limit);
      const safeOffset = Math.max(0, offset);
      const rows = db
        .prepare(
          `SELECT * FROM loot_records ${where} ORDER BY ${col} ${dir}, rowid DESC LIMIT ? OFFSET ?`,
        )
        .all(...params, safeLimit, safeOffset) as LootRow[];
      const total = where
        ? (db.prepare(`SELECT COUNT(*) as n FROM loot_records ${where}`).get(...params) as { n: number }).n
        : (countAll.get() as { n: number }).n;
      // Qty by fate, across every matching row, not just this page — `LootPanel`'s header tally
      // always meant the whole match set. `fate` is indexed (ADR 0247), so this is a cheap grouped
      // scan of just the matching rows, not the whole table.
      const tallies = { ...EMPTY_TALLIES };
      for (const r of db
        .prepare(`SELECT fate, SUM(qty) as qty FROM loot_records ${where} GROUP BY fate`)
        .all(...params) as { fate: LootFate; qty: number }[]) {
        tallies[r.fate] = r.qty;
      }
      return { rows: rows.map(rowToRecord), total, tallies };
    },

    vocabulary: () => ({
      sources: (selectDistinctSources.all() as { source: string }[]).map((r) => r.source),
      zones: (selectDistinctZones.all() as { zone: string }[]).map((r) => r.zone),
    }),

    clear(scope = "records") {
      if (scope === "records") {
        // `pricesCache.get()`, not a fresh `computeLootPrices(db)` call directly: it's the same
        // answer either way (see `background-cache.ts`'s own contract — always correct, cache or
        // not), and this way there's exactly one place that knows how to compute a price.
        const freeze = db.transaction(() => {
          for (const p of pricesCache.get()) upsertFrozenPrice.run(p);
          deleteRecords.run();
        });
        freeze();
      } else {
        db.transaction(() => {
          deleteRecords.run();
          deleteFrozenPrices.run();
        })();
      }
      saver.flush();
      pricesCache.markChanged();
      log.debug("cleared", { scope });
    },

    flush() {
      saver.flush();
    },

    // `at`, `item` and `source` are absent on purpose: `lootKey` — this row's own identity and this
    // store's dedup key (ADR 0033) — is built from exactly those three, so editing one would change
    // which row "this id" means mid-session. Everything else is fair game, `zone` above all.
    admin: createSqlAdminStore<LootRow>("Loot", {
      list: () => selectAll.all() as LootRow[],
      idOf: (r) => r.key,
      summaryOf: (r) => `${r.item} x${r.qty} — ${r.zone ?? "no zone"} (${r.at})`,
      editable: ["zone", "qty", "fate", "detail", "soldFor"],
      auditOf: (r) => (r.adminAudit ? (JSON.parse(r.adminAudit) as AdminAudit) : undefined),
      applyPatch: (id, field, value, audit) => {
        // `field` is always a member of `editable` by the time `createSqlAdminStore.patch` calls
        // this — safe to interpolate since it can only ever be one of this store's own fixed column
        // names, never arbitrary input.
        db.prepare(`UPDATE loot_records SET ${field} = ? WHERE key = ?`).run(value as AdminScalar, id);
        updateAudit.run(JSON.stringify(audit), id);
      },
      // `byKey` no longer exists to leave alone — `INSERT OR IGNORE` (via the PRIMARY KEY) is what
      // stops a deleted row from quietly coming back, the same as it does for a live add.
      removeRow: (id) => deleteRecord.run(id),
      onChanged: () => {
        saver.save();
        pricesCache.markChanged(); // `qty`/`fate`/`detail`/`soldFor` are all editable and all price inputs
      },
      // `stores()` (`electron/admin.ts`) calls this on every admin-panel open *and* every
      // `app.onDataChanged` broadcast the admin window is listening for while it's open — a `list()`
      // fallback would mean a full `loot_records` scan-and-map on every drop logged while the panel
      // sits open in the background, exactly the cost ADR 0232 removed the row cap to avoid paying
      // anywhere else.
      counts: () => ({
        total: (countAll.get() as { n: number }).n,
        edited: (countEdited.get() as { n: number }).n,
      }),
    }),
  };
}

/**
 * Fold a pre-ADR-0232 `loot-log.json` into the new tables, once — the same shape `faction-log.ts`'s
 * own migration uses, including that the file isn't renamed away afterward: it goes on existing as a
 * provenance-only stub (see the module doc). Guarded by whether the file still carries a `loot`
 * array at all, not by whether the new tables are empty: a stub has no such array, so this can't
 * re-run on it, and a player who has since cleared the ledger for real doesn't get it silently
 * repopulated.
 */
function migrateFromLegacyJson(db: Database, userDataDir: string, file: string): void {
  if (!fs.existsSync(file)) return;
  const legacy = readJson<{ loot?: LootRecord[]; retired?: ItemPrice[]; provenance?: DataStamp }>(file, {});
  if (!Array.isArray(legacy.loot)) return; // already a stub, or nothing was ever stored
  const loot = legacy.loot;
  const retired = Array.isArray(legacy.retired) ? legacy.retired : [];

  const insertRecord = db.prepare(`
    INSERT OR IGNORE INTO loot_records (key, at, fate, detail, soldFor, item, qty, source, zone, raw, logId)
    VALUES (@key, @at, @fate, @detail, @soldFor, @item, @qty, @source, @zone, @raw, @logId)
  `);
  const upsertFrozenPrice = db.prepare(`
    INSERT INTO loot_prices_frozen (item, unitCopper, qty, copper, sales, lastAt)
    VALUES (@item, @unitCopper, @qty, @copper, @sales, @lastAt)
    ON CONFLICT(item) DO UPDATE SET
      unitCopper = excluded.unitCopper, qty = excluded.qty, copper = excluded.copper,
      sales = excluded.sales, lastAt = excluded.lastAt
  `);

  const run = db.transaction(() => {
    for (const e of loot) {
      insertRecord.run({
        key: lootKey(e),
        at: e.at,
        fate: e.fate,
        detail: e.detail ?? null,
        soldFor: e.soldFor ?? null,
        item: e.item,
        qty: e.qty,
        source: e.source,
        zone: e.zone ?? null,
        raw: e.raw,
        logId: e.logId,
      });
    }
    for (const p of retired) upsertFrozenPrice.run(p);
  });
  run();

  if (legacy.provenance) fs.writeFileSync(file, JSON.stringify({ provenance: legacy.provenance }));
  else writeJson(file, {}, { concern: "loot-log" });
  log.info("migrated loot-log.json into eqlist.db", { loot: loot.length, retired: retired.length });
}
