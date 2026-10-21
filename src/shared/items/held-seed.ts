/**
 * held-seed.ts — start a freshly added list entry at what you already hold.
 *
 * A list entry's `obtained` counts loot since it was added. Added from a view that already knows
 * your inventory dump (a race-unlock step, ADR 0322), starting it at 0 would ask you to farm 800
 * Phosphorous Powder with 746 in the bank. So the add raises `obtained` to what's held — never lowers
 * it, since loot counted since the dump is newer than the dump.
 *
 * Pure: a list, an origin and holdings in, the patches to send out.
 */
import { isMobEntry, normalizeItemName, originKey } from "./grouping";
import type { ShoppingList, ShoppingListEntry } from "../types";

/** `obtained` patches for the entries under `origin` (no origin: standalone items) that `held` names. */
export function heldSeeds(
  list: ShoppingList,
  origin: ShoppingListEntry["origin"],
  held: ReadonlyMap<string, number>,
): { id: string; obtained: number }[] {
  const key = originKey(origin);
  const out: { id: string; obtained: number }[] = [];
  for (const e of list.entries) {
    if (isMobEntry(e) || originKey(e.origin) !== key) continue;
    const mine = held.get(normalizeItemName(e.name)) ?? 0;
    if (mine > e.obtained) out.push({ id: e.id, obtained: mine });
  }
  return out;
}
