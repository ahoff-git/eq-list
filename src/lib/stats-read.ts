"use client";
import { useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import { combatFigures } from "@/shared/items/stats-for-combat";
import type { StatsRead, StatsValues } from "@/shared/items/stats-page";

/**
 * stats-read.ts — a stats grab's result, waiting for the loadout planner to take it.
 *
 * The grab happens anywhere (a hotkey, in the game, whatever tab is open), but what a read *means* —
 * how far each figure is from what the plan counts — is only known inside the planner, which may not be
 * on screen. So the window holds the latest read here, outside any component, and the planner takes it
 * when it is mounted and able to measure it against what you wear. One read waits at a time: a newer grab
 * replaces an older one nobody had picked up, because it is the one the game is showing now.
 *
 * It remembers **when the screen was read**, because the planner may apply it minutes later (it waits for
 * an inventory dump) and everything that happens in between — a level, a fading buff — is already
 * missing from it. The stale-stats reminder dates the read from here, not from when it was applied
 * ([ADR 0369](../../specs/decisions/0369-a-stale-stats-read-says-so.md)).
 *
 * Like `toast.ts`, a bus rather than a context: the page that receives the grab and the panel that uses
 * it have no parent in common worth threading a callback through.
 */
export interface PendingStatsRead {
  read: StatsRead;
  /** When the grab came in, epoch ms — within a couple of seconds of when the screen was read. */
  at: number;
}

let pending: PendingStatsRead | null = null;
/** Figures a read was unsure of, kept after the rest was applied — until the player says yes or no. */
let unconfirmed: StatsValues | null = null;
const listeners = new Set<() => void>();

const announce = () => listeners.forEach((l) => l());

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** A grab came in; it waits here until something takes it. */
export function offerStatsRead(read: StatsRead, at: number = Date.now()): void {
  pending = { read, at };
  announce();
}

/** The planner has used it (or decided it never will): nothing is waiting any more. */
export function clearStatsRead(): void {
  if (!pending) return;
  pending = null;
  announce();
}

/** The read waiting for the planner, and when it was taken, or null. Re-renders when one arrives or is taken. */
export function usePendingStatsRead(): PendingStatsRead | null {
  return useSyncExternalStore(subscribe, () => pending, () => null);
}

/**
 * The figures a read was unsure of, kept for the player to confirm (they are never applied unasked). A newer
 * read replaces them — it is the game as it is now — and none left clears them.
 */
export function holdUnconfirmed(values: StatsValues): void {
  unconfirmed = Object.keys(values).length ? values : null;
  announce();
}

/** The player answered, one way or the other: nothing is held any more. */
export function clearUnconfirmed(): void {
  if (!unconfirmed) return;
  unconfirmed = null;
  announce();
}

/** The figures awaiting a yes or no, or null. */
export function useUnconfirmedStats(): StatsValues | null {
  return useSyncExternalStore(subscribe, () => unconfirmed, () => null);
}

/**
 * What a read answers on the Deaths page: the maximum HP and in-combat regen it asks the player to type
 * (`combatFigures` says which the read was sure of). Straight away rather than through the planner — these
 * need no inventory dump to mean something, and they are the player's own figure either way.
 */
export function answerDeathsPage(read: StatsRead): void {
  const { maxHp, hpRegen } = combatFigures(read);
  if (maxHp !== undefined) void api()?.hp.set(maxHp);
  if (hpRegen !== undefined) void api()?.hp.setRegen(hpRegen);
}
