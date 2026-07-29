/**
 * kill-filters.ts — which recorded kills the map and the list are showing.
 *
 * One filter object, applied by one function, used by both: a filtered heatmap and the list
 * beside it have to describe the same set of kills, and the surest way to guarantee that is
 * to have only one implementation. Pure and DOM-free, so it's testable on its own.
 */
import type { KillRecord } from "./types";

/** How far back to look. */
export type KillWindow = "10m" | "1h" | "session" | "all";

export interface KillFilters {
  window: KillWindow;
  /** Substring match on the mob's name. */
  mob: string;
  /** Substring match on what the corpse dropped. */
  drop: string;
  /** Only kills that dropped anything at all. */
  droppedOnly: boolean;
  /** Hide kills whose position is less trustworthy than this (0 keeps everything). */
  minConfidence: number;
}

export const DEFAULT_KILL_FILTERS: KillFilters = {
  window: "session",
  mob: "",
  drop: "",
  droppedOnly: false,
  minConfidence: 0,
};

/**
 * "session" is a generous span rather than a real session boundary: the kill log outlives
 * any one run of the app, and a play session is the thing a player means by "tonight".
 */
const WINDOW_MS: Record<KillWindow, number> = {
  "10m": 10 * 60_000,
  "1h": 60 * 60_000,
  session: 12 * 60 * 60_000,
  all: Number.POSITIVE_INFINITY,
};

/** Apply the filters. `now` is injectable so the time window is testable. */
export function filterKills(kills: KillRecord[], filters: KillFilters, now = Date.now()): KillRecord[] {
  const cutoff = now - WINDOW_MS[filters.window];
  const mob = filters.mob.trim().toLowerCase();
  const drop = filters.drop.trim().toLowerCase();

  return kills.filter((k) => {
    const at = Date.parse(k.at);
    // An unparseable timestamp is kept rather than silently dropped — losing a kill because
    // its clock looked odd would be worse than showing it.
    if (!Number.isNaN(at) && at < cutoff) return false;
    if (mob && !k.mob.toLowerCase().includes(mob)) return false;
    if (filters.droppedOnly && !k.drops?.length) return false;
    if (drop && !k.drops?.some((d) => d.toLowerCase().includes(drop))) return false;
    if (k.confidence < filters.minConfidence) return false;
    return true;
  });
}
