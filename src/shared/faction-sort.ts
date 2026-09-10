/**
 * faction-sort.ts — which order the Faction tab's two tables read in.
 *
 * Same shape as the sort half of [loot-filters.ts](./loot-filters.ts): one key type, one default, one
 * value-picker fed to `sortRows`. No filters yet, unlike loot's — the ledger is nowhere near loot's
 * volume, so there has been nothing yet to narrow.
 */
import type { FactionEvent, FactionStanding } from "./types";
import { sortRows, type Sort } from "./sorting";

export type FactionHitSortKey = "at" | "faction" | "delta";

/** Newest first — the order the feed arrives in, and the only one that reads as a log. */
export const DEFAULT_FACTION_HIT_SORT: Sort<FactionHitSortKey> = { key: "at", desc: true };

/**
 * `at` is the log's own timestamp string, which sorts chronologically as text — the same trick
 * `loot-filters.ts`'s `lootValue` relies on. `delta` is `undefined` for a floor/ceiling hit, which
 * states no number, and `sortRows` already sends an `undefined` value to the end either direction.
 */
const hitValue = (e: FactionEvent, key: FactionHitSortKey): string | number | undefined => {
  switch (key) {
    case "at":
      return e.at;
    case "faction":
      return e.faction.toLowerCase();
    case "delta":
      return e.delta ?? undefined;
  }
};

export function sortFactionHits(hits: readonly FactionEvent[], sort: Sort<FactionHitSortKey>): FactionEvent[] {
  return sortRows(hits, sort, hitValue);
}

export type FactionStandingSortKey = "faction" | "net" | "raises" | "lowers" | "lastAt";

/** Biggest net gain first — what the table is for is "which factions am I actually moving". */
export const DEFAULT_FACTION_STANDING_SORT: Sort<FactionStandingSortKey> = { key: "net", desc: true };

const standingValue = (s: FactionStanding, key: FactionStandingSortKey): string | number =>
  key === "faction" ? s.faction.toLowerCase() : s[key];

export function sortFactionStandings(
  standings: readonly FactionStanding[],
  sort: Sort<FactionStandingSortKey>,
): FactionStanding[] {
  return sortRows(standings, sort, standingValue);
}
