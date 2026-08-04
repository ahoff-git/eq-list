/**
 * loot-log.ts — a running record of what you've looted, kept in the main process so it's
 * complete whether or not the Loot tab is open.
 *
 * The renderer used to accumulate the loot feed itself, which meant it only saw drops that
 * landed while the tab was mounted — open it and the list was empty until the next kill. This
 * owns the feed instead: the watcher hands every `LootEvent` here, the tab reads the history on
 * open and then follows live ones. Persisted to disk (capped), so the ledger survives a restart.
 *
 * Only *live* drops are recorded — digesting an old log ("eat a log") feeds mob knowledge, not
 * this feed, which is about what's dropping now, not a history re-run.
 */
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { parseCoins } from "../src/shared/money";
import type { ItemPrice, LootEvent } from "../src/shared/types";

const log = createLogger("loot-log");

/** Drops arrive in bursts; coalesce the writes. */
const WRITE_DEBOUNCE_MS = 3000;

/** A generous but bounded ledger — enough for many evenings, not unbounded growth. */
const MAX_LOOT = 2000;

/** How many drops the feed returns when the caller doesn't say. */
const DEFAULT_LIMIT = 200;

export interface LootLog {
  /** Record a looted drop (a live one — imports don't feed this). */
  add(event: LootEvent): void;
  /** The most recent drops, newest first (at most `limit`). */
  recent(limit?: number): LootEvent[];
  /** What each item has vendored for, derived from the auto-sells in the ledger. */
  prices(): ItemPrice[];
  clear(): void;
  flush(): void;
}

/**
 * What the vendor paid for one auto-sold line, in copper — from the parsed figure, falling
 * back to re-reading the log's prose for lines stored before `soldFor` existed. The fallback
 * is the only reason this isn't a plain field read: the ledger on disk outlives the parser.
 */
function saleCopper(event: LootEvent): number | null {
  if (event.fate !== "sold") return null;
  return event.soldFor ?? parseCoins(event.detail);
}

export function createLootLog(userDataDir: string): LootLog {
  const file = path.join(userDataDir, "loot-log.json");
  let events: LootEvent[] = read();
  let timer: NodeJS.Timeout | null = null;

  function read(): LootEvent[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { loot?: LootEvent[] };
      return Array.isArray(parsed.loot) ? parsed.loot : [];
    } catch {
      return []; // absent or unreadable — the feed is a nicety, never a hard failure
    }
  }

  function write(): void {
    timer = null;
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ loot: events }), "utf8");
    } catch (e) {
      log.warn("could not save loot log:", (e as Error).message);
    }
  }

  function save(): void {
    if (!timer) timer = setTimeout(write, WRITE_DEBOUNCE_MS);
  }

  return {
    add(event) {
      events.push(event);
      if (events.length > MAX_LOOT) events = events.slice(-MAX_LOOT);
      save();
    },
    recent: (limit = DEFAULT_LIMIT) => events.slice(-limit).reverse(),

    /**
     * Per-item vendor prices, **derived** from the ledger rather than kept as a second store —
     * the auto-sell lines already on disk are the evidence, so there's one record of what you
     * sold and nothing to drift out of step with it (the same argument as ADR 0016).
     *
     * A stack's price is for the whole stack, so the unit price divides by `qty`. `sales` is
     * the sample count: EQ prices an item the same every time, so more than one is only ever
     * confirmation — but a single sale of a stack is where a rounding error would hide.
     */
    prices() {
      const byItem = new Map<string, ItemPrice>();
      for (const e of events) {
        const copper = saleCopper(e);
        if (copper === null) continue;
        const cur = byItem.get(e.item) ?? { item: e.item, unitCopper: 0, qty: 0, copper: 0, sales: 0, lastAt: e.at };
        cur.qty += e.qty;
        cur.copper += copper;
        cur.sales += 1;
        if (e.at > cur.lastAt) cur.lastAt = e.at;
        byItem.set(e.item, cur);
      }
      for (const p of byItem.values()) {
        p.unitCopper = p.qty ? Math.round((p.copper / p.qty) * 10) / 10 : 0;
      }
      return [...byItem.values()].sort((a, b) => b.copper - a.copper || a.item.localeCompare(b.item));
    },

    clear() {
      events = [];
      write();
    },
    flush() {
      if (timer) clearTimeout(timer);
      write();
    },
  };
}
