"use client";
import { useSyncExternalStore } from "react";
import { STORAGE_KEYS } from "@/lib/storageKeys";
import { noteMoves, type Basis, type BuffMove, type StatsStamp } from "@/shared/items/stats-drift";

/**
 * stats-stamp.ts — what the "re-read your stats" pill needs to remember between sessions and between
 * components ([ADR 0369](../../../specs/decisions/0369-a-stale-stats-read-says-so.md)):
 *
 * - **the stamp** — when the stats were last read or typed, and the race, classes and level the plan
 *   measured them against. Written by the loadout builder, which is the only thing that knows;
 * - **the stat-buff moves** seen on the buff board, so "then against now" has a "then" even across a
 *   restart (the board itself starts empty on every launch). Written by the buff watcher;
 * - **the plan's basis now, and whether anything is calibrated**, published by the builder, because the pill
 *   lives in the status bar and the race, classes, level and calibration live in the Items tab — the only
 *   place they can change, so the last published value is the current one. Publishing "not calibrated" is
 *   what quiets the pill when a calibration is cleared or replaced, rather than the builder deleting the
 *   stamp and racing the very write that made it.
 *
 * A module-level store in `localStorage`, like `headroom.ts`, and for the same reason: `usePersistentState`
 * gives each component its own copy, and here one writes while another reads.
 */
interface Held {
  stamp?: StatsStamp;
  basisNow?: Basis;
  /** Whether the builder has any calibration at all — absent until it has said. */
  calibrated?: boolean;
  moves: BuffMove[];
}

const EMPTY: Held = { moves: [] };

const isBasis = (b: Partial<Basis> | undefined): b is Basis =>
  !!b && Array.isArray(b.classes) && b.classes.every((c) => typeof c === "string") && typeof b.level === "number" && (b.race === undefined || typeof b.race === "string");

const isMove = (m: Partial<BuffMove> | undefined): m is BuffMove =>
  !!m && typeof m.at === "string" && typeof m.key === "string" && typeof m.spell === "string" && typeof m.up === "boolean";

function readStored(): Held {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.statsStamp);
    const v = raw ? (JSON.parse(raw) as Partial<Held> & { stamp?: Partial<StatsStamp> }) : undefined;
    if (!v) return EMPTY;
    const stamp = v.stamp && typeof v.stamp.at === "number" && isBasis(v.stamp.basis) ? { at: v.stamp.at, basis: v.stamp.basis } : undefined;
    return {
      stamp,
      basisNow: isBasis(v.basisNow) ? v.basisNow : undefined,
      calibrated: typeof v.calibrated === "boolean" ? v.calibrated : undefined,
      moves: Array.isArray(v.moves) ? v.moves.filter(isMove) : [],
    };
  } catch {
    return EMPTY; // no storage (prerender, a private window) or bad JSON: nothing known
  }
}

let held: Held = readStored();
const listeners = new Set<() => void>();

function set(next: Held): void {
  held = next;
  try {
    localStorage.setItem(STORAGE_KEYS.statsStamp, JSON.stringify(next));
  } catch {
    /* best effort — the in-memory copy still serves this run */
  }
  for (const l of listeners) l();
}

const sameBasis = (a: Basis | undefined, b: Basis): boolean => !!a && a.level === b.level && (a.race ?? "") === (b.race ?? "") && a.classes.join(",") === b.classes.join(",");

/** The stats were just read or typed against this basis. */
export function stampStats(basis: Basis, at: number = Date.now()): void {
  set({ ...held, stamp: { at, basis }, basisNow: basis });
}

/** Whether a stamp is held — for a restore that should only fill a gap. */
export const hasStamp = (): boolean => !!held.stamp;

/** There is no calibration any more, so there is nothing to go stale. */
export function clearStatsStamp(): void {
  if (!held.stamp) return;
  set({ ...held, stamp: undefined });
}

/** "Nothing has changed": the same stamp, as of now, against the basis the plan uses now. */
export function acknowledgeStats(): void {
  const basis = held.basisNow ?? held.stamp?.basis;
  if (basis) stampStats(basis);
}

/** What the plan measures against now, and whether it holds any calibration. A repeat changes nothing, so nobody re-renders. */
export function publishBasis(basis: Basis, calibrated: boolean): void {
  if (sameBasis(held.basisNow, basis) && held.calibrated === calibrated) return;
  set({ ...held, basisNow: basis, calibrated });
}

/** Stat-buff moves the board just showed. The ones already known are ignored. */
export function recordBuffMoves(moves: readonly BuffMove[]): void {
  const next = noteMoves(held.moves, moves);
  if (next.length === held.moves.length && next.every((m, i) => m === held.moves[i] || (m.at === held.moves[i].at && m.key === held.moves[i].key && m.up === held.moves[i].up))) return;
  set({ ...held, moves: next });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The stamp, the moves and the basis — everything `driftReasons` takes from this side. */
export function useStatsStore(): Held {
  // Nothing on the server: the prerendered page must match the first client render, which then catches up.
  return useSyncExternalStore(subscribe, () => held, () => EMPTY);
}
