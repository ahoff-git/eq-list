"use client";
import { useSyncExternalStore } from "react";
import type { StatsRead } from "@/shared/items/stats-page";

/**
 * stats-read.ts — a stats grab's result, waiting for the loadout planner to take it.
 *
 * The grab happens anywhere (a hotkey, in the game, whatever tab is open), but what a read *means* —
 * how far each figure is from what the plan counts — is only known inside the planner, which may not be
 * on screen. So the window holds the latest read here, outside any component, and the planner takes it
 * when it is mounted and able to measure it against what you wear. One read waits at a time: a newer grab
 * replaces an older one nobody had picked up, because it is the one the game is showing now.
 *
 * Like `toast.ts`, a bus rather than a context: the page that receives the grab and the panel that uses
 * it have no parent in common worth threading a callback through.
 */
let pending: StatsRead | null = null;
const listeners = new Set<() => void>();

const announce = () => listeners.forEach((l) => l());

/** A grab came in; it waits here until something takes it. */
export function offerStatsRead(read: StatsRead): void {
  pending = read;
  announce();
}

/** The planner has used it (or decided it never will): nothing is waiting any more. */
export function clearStatsRead(): void {
  if (!pending) return;
  pending = null;
  announce();
}

/** The read waiting for the planner, or null. Re-renders when one arrives or is taken. */
export function usePendingStatsRead(): StatsRead | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
    () => null,
  );
}
