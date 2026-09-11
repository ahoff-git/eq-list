/**
 * faction-sort.ts — which order the Faction tab's two tables read in.
 *
 * Same shape as the sort half of [loot-filters.ts](./loot-filters.ts): one key type, one default, one
 * value-picker fed to `sortRows`. No filters yet, unlike loot's — the ledger is nowhere near loot's
 * volume, so there has been nothing yet to narrow.
 */
import type { FactionRecord, FactionStanding } from "./types";
import { sortRows, type Sort } from "./sorting";
import { ratio } from "./numbers";

export type FactionHitSortKey = "at" | "faction" | "delta" | "cause";

/** Newest first — the order the feed arrives in, and the only one that reads as a log. */
export const DEFAULT_FACTION_HIT_SORT: Sort<FactionHitSortKey> = { key: "at", desc: true };

/** The mob or NPC a guessed cause names, whichever kind it is — for sorting and display alike. */
export const causeSource = (e: FactionRecord): string | undefined =>
  e.causedBy ? (e.causedBy.kind === "kill" ? e.causedBy.mob : e.causedBy.npc) : undefined;

/**
 * `at` is the log's own timestamp string, which sorts chronologically as text — the same trick
 * `loot-filters.ts`'s `lootValue` relies on. `delta` is `undefined` for a floor/ceiling hit, which
 * states no number; `cause` is `undefined` when nothing was correlated. `sortRows` already sends an
 * `undefined` value to the end either direction.
 */
const hitValue = (e: FactionRecord, key: FactionHitSortKey): string | number | undefined => {
  switch (key) {
    case "at":
      return e.at;
    case "faction":
      return e.faction.toLowerCase();
    case "delta":
      return e.delta ?? undefined;
    case "cause":
      return causeSource(e)?.toLowerCase();
  }
};

export function sortFactionHits(hits: readonly FactionRecord[], sort: Sort<FactionHitSortKey>): FactionRecord[] {
  return sortRows(hits, sort, hitValue);
}

export type FactionStandingSortKey = "faction" | "net" | "raises" | "lowers" | "rate" | "lastAt";

/** Biggest net gain first — what the table is for is "which factions am I actually moving". */
export const DEFAULT_FACTION_STANDING_SORT: Sort<FactionStandingSortKey> = { key: "net", desc: true };

/** Net change per hour between the first and last hit on record — the same "part over elapsed hours"
 *  `SessionPanel`'s `coinPerHour` uses (ADR 0047), always derived from the raw totals rather than
 *  stored so it can never drift from what they say. Zero (not a lie) while there's only one hit. */
export function ratePerHour(s: FactionStanding): number {
  const spanHours = (Date.parse(s.lastAt) - Date.parse(s.firstAt)) / 3_600_000;
  return ratio(s.net, spanHours, 1);
}

const standingValue = (s: FactionStanding, key: FactionStandingSortKey): string | number =>
  key === "faction" ? s.faction.toLowerCase() : key === "rate" ? ratePerHour(s) : s[key];

export function sortFactionStandings(
  standings: readonly FactionStanding[],
  sort: Sort<FactionStandingSortKey>,
): FactionStanding[] {
  return sortRows(standings, sort, standingValue);
}
