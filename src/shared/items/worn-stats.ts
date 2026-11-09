/**
 * worn-stats.ts — what a dump's worn gear adds up to, by the catalogue.
 *
 * Yours (the Items tab folds it into the rates and the loadout builder measures a stats read against it) and, now,
 * a peer's: planning as someone who shared their stats needs *their* worn gear, by the same rule, or their figures
 * would be measured against yours. One reader so the two can't count a piece differently.
 *
 * Pure → a tested black box.
 */
import type { InventoryItem } from "../game-export-dumps";
import { normalizeItemName } from "./grouping";
import { gradedItemStats } from "./item-upgrade";
import { loadoutStats, type LoadoutStats } from "./loadout-stats";
import type { ItemRow } from "./item-search";

/**
 * The worn pieces' stats summed, each at the grade the dump holds it. A piece the catalogue has no page for
 * counts for nothing — the same as it always did — and anything not worn is not in it.
 */
export function wornStats(dump: readonly InventoryItem[], rows: readonly Pick<ItemRow, "item" | "stats">[]): LoadoutStats {
  const byTitle = new Map(rows.map((r) => [normalizeItemName(r.item.title), r]));
  return loadoutStats(
    dump
      .filter((it) => it.area === "worn")
      .flatMap((it) => {
        const row = byTitle.get(normalizeItemName(it.baseName));
        return row ? [gradedItemStats(row.stats, it.grade)] : [];
      }),
  );
}
