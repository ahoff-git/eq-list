/**
 * peer-inventory.ts — a peer's shared inventory, read back into the shape their own dump would have
 * parsed into, so the loadout builder can plan for them (ADR 0342).
 *
 * Pure so it can be pinned by a test. What comes back is as exact as the loadout needs: every copy
 * told apart in the row's `gear` (worn and where, graded, socketed) is one item, and the rest of the
 * total is +0 stock in the places the row names. Bag-slot positions and item ids aren't shared, so
 * they're not invented beyond what saying where something is needs.
 */
import { inventoryAreaOfLabel, type GearCopy, type InventoryItem } from "../game-export-dumps";
import { gradedTitle } from "../items/item-upgrade";
import type { InventoryShareRow } from "./peer-share";

const STORAGE_PREFIX = "Storage: ";

/** Every item a peer's rows describe, one per told-apart copy plus their +0 stock. */
export function peerInventoryItems(rows: readonly InventoryShareRow[]): InventoryItem[] {
  return rows.flatMap((row) => {
    const gear = row.gear ?? guessedGear(row);
    const items = gear.map((copy) => itemAt(row.item, copy.at, copy.slot, copy.grade, 1, copy.sockets));
    for (const place of row.places) {
      const told = gear.filter((c) => c.at === place.label).length;
      items.push(...stock(row.item, place, place.count - told));
    }
    return items;
  });
}

/**
 * For a row from a peer whose app predates `gear`: one copy in each worn slot it names (a second ring
 * or earring in the same-named slot), and the best grade on the first copy, worn if any is — the
 * likeliest place for someone's best copy, and the only grade the row states.
 */
function guessedGear(row: InventoryShareRow): GearCopy[] {
  const worn = row.places.find((p) => inventoryAreaOfLabel(p.label) === "worn");
  const copies: GearCopy[] = worn
    ? Array.from({ length: worn.count }, (_, n) => ({ at: worn.label, slot: worn.slots[Math.min(n, worn.slots.length - 1)], grade: 0 }))
    : [];
  if (row.grade) {
    if (copies[0]) copies[0].grade = row.grade;
    else if (row.places[0]) copies.push({ at: row.places[0].label, slot: row.places[0].slots[0], grade: row.grade });
  }
  return copies;
}

/** `left` +0 copies spread one to a slot the place names, the remainder on the last — a stack's slot. */
function stock(title: string, place: InventoryShareRow["places"][number], left: number): InventoryItem[] {
  if (left <= 0) return [];
  const slots = place.slots.length ? place.slots.slice(0, left) : [undefined];
  return slots.map((slot, n) => itemAt(title, place.label, slot, 0, n === slots.length - 1 ? left - n : 1));
}

function itemAt(title: string, at: string, slot: string | undefined, grade: number, count: number, sockets?: GearCopy["sockets"]): InventoryItem {
  const area = inventoryAreaOfLabel(at);
  // A Storage tab is the item's slot in a dump, and its place label is the only thing that names it.
  const where = area === "storage" ? at.slice(STORAGE_PREFIX.length) : (slot ?? "");
  return {
    location: slot ? `${at} ${slot}` : at,
    area,
    slot: where,
    name: gradedTitle(title, grade),
    baseName: title,
    grade,
    id: 0,
    count,
    sockets: sockets ? [...sockets] : [],
    container: false,
  };
}
