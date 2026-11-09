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
const listeners = new Set<() => void>();

const announce = () => listeners.forEach((l) => l());

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
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pending,
    () => null,
  );
}
