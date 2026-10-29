"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useInventory } from "@/lib/exports/useGameExports";
import { rowsOf, usePeerShare } from "@/lib/peers/usePeerShare";
import { holdingsOf, type Holdings } from "@/shared/tradeskills/held-materials";
import { normalizeItemName } from "@/shared/items/grouping";
import { ownershipNotes } from "@/shared/items/ownership-notes";
import type { InventoryShareRow } from "@/shared/peers/peer-share";
import { heldGrades, inventoryTotals, ownedItems, type InventoryTotal, type OwnedPlace } from "@/shared/game-export-dumps";

interface Ownership {
  owned: Map<string, OwnedPlace[]> | null;
  grades: Map<string, number>;
  /** Each item's count per area (bags, bank, depot…), keyed like `owned` — null with no dump. */
  totals: Map<string, InventoryTotal> | null;
  /** When the game wrote the dump these came from. */
  at?: number;
  peers: Holdings;
}

const OwnershipContext = createContext<Ownership | null>(null);

/**
 * What you and your sharing peers hold, read **once** for the whole control window, so every item's
 * hover card can say who has it without a read of its own (ADR 0320).
 *
 * Peers' rows are only those already received — this never asks for an inventory. Asking stays with
 * the views where reading one is the point (`useHoldings`, ADR 0309); a hover isn't a request.
 */
export function OwnershipProvider({ children }: { children: ReactNode }) {
  // One read of the dump for all three views of it.
  const { items, at } = useInventory();
  const owned = useMemo(() => (items ? ownedItems(items, normalizeItemName) : null), [items]);
  const grades = useMemo(() => (items ? heldGrades(items, normalizeItemName) : new Map<string, number>()), [items]);
  const totals = useMemo(() => (items ? new Map(inventoryTotals(items).map((t) => [normalizeItemName(t.baseName), t])) : null), [items]);
  const { received } = usePeerShare();
  const peers = useMemo(
    () => holdingsOf([], rowsOf<InventoryShareRow>(received, "inventory").map((r) => ({ by: r.by, item: r.row.item, count: r.row.count }))),
    [received],
  );
  const value = useMemo(() => ({ owned, grades, totals, at, peers }), [owned, grades, totals, at, peers]);
  return <OwnershipContext.Provider value={value}>{children}</OwnershipContext.Provider>;
}

/** The "who has this" lines for an item name — none outside the provider (the map window) or when nobody does. */
export function useOwnershipNotes(name: string): string[] {
  const ownership = useContext(OwnershipContext);
  return useMemo(() => {
    if (!ownership) return [];
    const key = normalizeItemName(name);
    return ownershipNotes(ownership.owned?.get(key), ownership.grades.get(key), ownership.peers.get(key)?.peers);
  }, [ownership, name]);
}

/**
 * How many of an item your inventory export holds, per area, for its page: `total` absent when you
 * hold none, and `at` absent when there is no dump to have looked in (or outside the provider).
 */
export function useHeldOnPage(name: string): { total?: InventoryTotal; at?: number } {
  const ownership = useContext(OwnershipContext);
  return useMemo(() => {
    if (!ownership?.totals) return {};
    return { total: ownership.totals.get(normalizeItemName(name)), at: ownership.at };
  }, [ownership, name]);
}

