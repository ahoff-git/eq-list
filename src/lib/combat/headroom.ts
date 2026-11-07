"use client";
import { useSyncExternalStore } from "react";
import { useInventory } from "@/lib/exports/useGameExports";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import type { Headroom, Reach } from "@/shared/combat/headroom";

/**
 * What the status bar's pill borrows from the loadout builder: for AC, health and mana, what you wear
 * against what its loadout reaches ([ADR 0362](../../../specs/decisions/0362-melee-damage-suggests-the-ac-the-loadout-already-reaches.md),
 * [0363](../../../specs/decisions/0363-running-dry-and-dying-suggest-mana-and-health.md)).
 *
 * The pill can't plan a loadout itself — that takes the whole catalogue, your goals and a solver — so the
 * builder **publishes** its answer whenever it has one, and the pill reads the latest. It is kept in
 * `localStorage` so it survives a restart (a pill that only appears once you've reopened the builder
 * would be a poor reminder), and it names the inventory dump it was figured from, so a newer dump retires
 * it until the builder has planned again (`useDamageTaken` checks).
 *
 * A module-level store rather than `usePersistentState`: that hook gives each component its own copy, and
 * the builder writing while the status bar reads is the whole point.
 */
let held: Headroom | undefined = readStored();
const listeners = new Set<() => void>();

const isReach = (r: Partial<Reach> | undefined): boolean => !!r && Number.isFinite(r.wearing) && Number.isFinite(r.loadout);

function readStored(): Headroom | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.itemHeadroom);
    const value = raw ? (JSON.parse(raw) as Partial<Headroom>) : undefined;
    return value && isReach(value.ac) && isReach(value.hp) && isReach(value.mana) ? (value as Headroom) : undefined;
  } catch {
    return undefined; // no storage (prerender, a private window) or bad JSON: nothing known
  }
}

const sameReach = (a: Reach, b: Reach): boolean => a.wearing === b.wearing && a.loadout === b.loadout;

/** Record what the builder just planned. A repeat of what's held changes nothing, so nobody re-renders. */
export function publishHeadroom(next: Headroom): void {
  if (held && held.at === next.at && sameReach(held.ac, next.ac) && sameReach(held.hp, next.hp) && sameReach(held.mana, next.mana)) return;
  held = next;
  try {
    localStorage.setItem(STORAGE_KEYS.itemHeadroom, JSON.stringify(next));
  } catch {
    /* best effort — the in-memory copy still serves this run */
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The last figures the builder published, or undefined before it has planned any. */
function usePublishedHeadroom(): Headroom | undefined {
  // Nothing on the server: the prerendered page must match the first client render, which then catches up.
  return useSyncExternalStore(subscribe, () => held, () => undefined);
}

/**
 * The builder's figures **for the inventory dump you have now**, or undefined: they are about the dump it
 * planned from, so a newer one retires them until the builder has planned again. Everything that borrows
 * the builder's answer — the pill, its section, the fight analytics — reads it here, so none of them can
 * promise gear a newer dump has since changed.
 */
export function useHeadroom(): Headroom | undefined {
  const { at } = useInventory();
  const published = usePublishedHeadroom();
  return published && at !== undefined && published.at === at ? published : undefined;
}
