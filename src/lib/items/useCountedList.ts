"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useShoppingList } from "@/lib/hooks";
import { useInventory } from "@/lib/exports/useGameExports";
import { countableNames, countedEntries, heldCounts, sinceStamp, type EntryCount, type HeldCount } from "@/shared/items/held-count";
import { createLogger } from "@/shared/logging";
import type { LootSinceRow, ShoppingList } from "@/shared/types";

const log = createLogger("held-count");

/**
 * A burst of loot lines (a corpse's worth) is one re-read, not one per line. Long enough to swallow the
 * burst, short enough that a row ticks while you are still looking at it.
 */
const REREAD_MS = 400;

/**
 * Say how many of a row you have. The figure is yours from then on: the inventory stops raising it
 * (`countedByHand`) until `countFromInventory` hands it back. One place, because the List tab's stepper, its
 * typed figure and the Hunt tab's stepper all mean exactly this.
 */
export function setHave(id: string, have: number): void {
  void api()?.list.update(id, { obtained: Math.max(0, have), countedByHand: true });
}

/**
 * Let the inventory count a row again. The row takes the inventory's figure when there is one — it was asked
 * to go back to it, and the larger-of rule would otherwise keep a typed figure that happens to be higher.
 */
export function countFromInventory(id: string, held?: number): void {
  void api()?.list.update(id, { countedByHand: false, ...(held !== undefined ? { obtained: held } : {}) });
}

export interface CountedList {
  /** The list with each item's `obtained` replaced by the figure it counts (`countedEntries`). */
  list: ShoppingList;
  /** How each row got its figure, by entry id — absent for a mob. */
  counts: Map<string, EntryCount>;
  /** The dump the counts read, and the clock it was read against; null when there is none, undefined until it has been looked for. */
  dump: { at: number; now: number } | null | undefined;
}

/** The ledger's rows since a dump, for the items asked about — kept with what they were asked for. */
interface Since {
  stamp: string;
  names: string;
  rows: LootSinceRow[];
}

/**
 * The shopping list as it counts: each item's figure is the larger of its own tally and what you hold
 * according to your last inventory dump plus the ledger since it (`held-count.ts`, ADR 0382).
 *
 * Read in the renderer, from the things it already reads — the dump (`useInventory`) and the loot ledger —
 * because the counting is a pure function of those and every window can have its own copy of the answer.
 * With no dump, or until the ledger has answered, nothing is derived and the list is exactly as stored:
 * a count that flickers in is no better than one that is not there.
 */
export function useCountedList(): CountedList {
  const stored = useShoppingList();
  const { items, at, carried, now, read } = useInventory();

  // One string rather than an array, so a list update that changes a count (every loot line does) doesn't
  // read as the list having changed what it asks about.
  const wanted = useMemo(() => countableNames(stored.entries).sort().join("\n"), [stored.entries]);
  const stamp = at === undefined ? null : sinceStamp({ writtenAt: at, carried });
  const [since, setSince] = useState<Since | null>(null);

  useEffect(() => {
    const a = api();
    if (!a || stamp === null || !wanted) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      const rows = await a.loot.since(stamp, wanted.split("\n"));
      if (live) setSince({ stamp, names: wanted, rows });
    };
    void read();
    const off = a.loot.onEvent(() => {
      clearTimeout(timer);
      timer = setTimeout(() => void read(), REREAD_MS);
    });
    return () => {
      live = false;
      clearTimeout(timer);
      off();
    };
  }, [stamp, wanted]);

  const held = useMemo(() => {
    const none = new Map<string, HeldCount>();
    // Rows read for an older dump or another set of names aren't this answer — wait for the right ones.
    if (!items || at === undefined || stamp === null || since?.stamp !== stamp || since.names !== wanted) return none;
    const counts = heldCounts(wanted.split("\n"), { writtenAt: at, items, carried }, since.rows);
    log.debug("held", { at, rows: since.rows.length, items: counts.size, unknown: [...counts.values()].filter((c) => c.kind === "unknown").length });
    return counts;
  }, [items, at, carried, stamp, since, wanted]);

  const counted = useMemo(() => countedEntries(stored.entries, held, stored.questRuns), [stored.entries, stored.questRuns, held]);
  return useMemo(
    () => ({
      list: { ...stored, entries: counted.entries },
      counts: counted.counts,
      dump: !read ? undefined : items && at !== undefined ? { at, now } : null,
    }),
    [stored, counted, items, at, now, read],
  );
}
