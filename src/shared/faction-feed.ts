/**
 * faction-feed.ts — merging the faction ledger the main process keeps with hits that arrive live.
 *
 * The same shape as [loot-feed.ts](./loot-feed.ts), for the same reason: the panel wants one list —
 * what was recorded before it opened, plus what has landed since — and those come from a fetched
 * history and a live push subscription that **race**, because the subscription is live from the
 * moment of mount while the fetch is a round trip. A replayed log gap
 * ([ADR 0044](../../specs/decisions/0044-the-log-position-outlives-the-app.md)) delivers a burst of
 * hits at launch, exactly when a window is mounting.
 *
 * Pure and DOM-free so the ordering and de-duplication can be pinned by tests rather than reasoned
 * about in a hook.
 */
import type { FactionRecord } from "./types";

/**
 * A faction hit's identity, for telling "the same hit, from both sources" from "two hits that look
 * alike". `logId` is unique within a run of the app, so a hit present in both the fetch and the live
 * push carries the same one; the faction name rides along too, so a stored hit from an *earlier* run
 * that happens to reuse a `logId` isn't mistaken for one of these (see `lootKey`). Deliberately
 * ignores `causedBy`: it's a guess about the line, not part of what the line is.
 */
export function factionKey(e: FactionRecord): string {
  return `${e.at}\0${e.logId}\0${e.faction}`;
}

/**
 * The feed: everything already held (newest first), then the stored history behind it, minus
 * whatever is already held, capped at `limit`. See `mergeLootFeed` — same reasoning, same shape.
 */
export function mergeFactionFeed(held: FactionRecord[], history: FactionRecord[], limit: number): FactionRecord[] {
  if (!held.length) return history.slice(0, limit);
  const seen = new Set(held.map(factionKey));
  return [...held, ...history.filter((e) => !seen.has(factionKey(e)))].slice(0, limit);
}
