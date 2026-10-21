"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useHeldGrades, useOwnedItems } from "@/lib/exports/useGameExports";
import { rowsOf, usePeerShare } from "@/lib/peers/usePeerShare";
import { holdingsOf, type Holdings } from "@/shared/tradeskills/held-materials";
import { normalizeItemName } from "@/shared/items/grouping";
import { ownershipNotes } from "@/shared/items/ownership-notes";
import type { InventoryShareRow } from "@/shared/peers/peer-share";
import type { OwnedPlace } from "@/shared/game-export-dumps";

interface Ownership {
  owned: Map<string, OwnedPlace[]> | null;
  grades: Map<string, number>;
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
  const { owned } = useOwnedItems();
  const grades = useHeldGrades();
  const { received } = usePeerShare();
  const peers = useMemo(
    () => holdingsOf([], rowsOf<InventoryShareRow>(received, "inventory").map((r) => ({ by: r.by, item: r.row.item, count: r.row.count }))),
    [received],
  );
  const value = useMemo(() => ({ owned, grades, peers }), [owned, grades, peers]);
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
