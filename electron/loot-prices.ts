/**
 * loot-prices.ts — the from-scratch computation `loot-log.ts`'s `prices()` answers with.
 *
 * Split out of `loot-log.ts` for the same reason `kill-observations.ts`/`combat-history-reports.ts`
 * were: `computeLootPrices` needs to run against a `Database` handle from anywhere — the main
 * process (the one-time seed, and the synchronous fallback) or `background-cache-worker.ts`'s own
 * read-only connection to the same file (`loot-log.ts` points a `createBackgroundCache` at this
 * module's compiled output by name — ADR 0247). This file has no side effects and opens no
 * connection of its own.
 */
import type { Database } from "better-sqlite3";
import { parseCoins } from "../src/shared/money";
import { ratio } from "../src/shared/numbers";
import type { ItemPrice } from "../src/shared/types";

interface SoldRow {
  item: string;
  qty: number;
  soldFor: number | null;
  detail: string | null;
  at: string;
}

/**
 * One sold row's price, in copper — from the stored figure, falling back to re-reading the
 * detail text for a row written before `soldFor` existed. The fallback is the only reason this
 * isn't a plain column read: the ledger outlives the parser (mirrors the pre-SQLite `saleCopper`).
 */
function priceOfRow(r: SoldRow): ItemPrice | null {
  const copper = r.soldFor ?? parseCoins(r.detail ?? undefined);
  if (copper === null) return null;
  return { item: r.item, unitCopper: 0, qty: r.qty, copper, sales: 1, lastAt: r.at };
}

/** Add up per-item sale totals — the shape a sale keeps once its drop has left the feed. */
export function sumPrices(...groups: ItemPrice[][]): ItemPrice[] {
  const byItem = new Map<string, ItemPrice>();
  for (const group of groups) {
    for (const p of group) {
      const cur = byItem.get(p.item) ?? { item: p.item, unitCopper: 0, qty: 0, copper: 0, sales: 0, lastAt: p.lastAt };
      cur.qty += p.qty;
      cur.copper += p.copper;
      cur.sales += p.sales;
      if (p.lastAt > cur.lastAt) cur.lastAt = p.lastAt;
      byItem.set(p.item, cur);
    }
  }
  for (const p of byItem.values()) p.unitCopper = ratio(p.copper, p.qty, 1);
  return [...byItem.values()].sort((a, b) => b.copper - a.copper || a.item.localeCompare(b.item));
}

/**
 * Every price on record: derived from the live sold rows, folded together with whatever a past
 * `clear("records")` already froze.
 */
export function computeLootPrices(db: Database): ItemPrice[] {
  const live = (
    db.prepare(`SELECT item, qty, soldFor, detail, at FROM loot_records WHERE fate = 'sold'`).all() as SoldRow[]
  )
    .map(priceOfRow)
    .filter((p): p is ItemPrice => p !== null);
  const frozen = db.prepare(`SELECT * FROM loot_prices_frozen`).all() as ItemPrice[];
  return sumPrices(frozen, live);
}
