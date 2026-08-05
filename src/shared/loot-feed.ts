/**
 * loot-feed.ts — merging the loot ledger the main process keeps with the drops that arrive live.
 *
 * The panel wants one list: what was looted before it opened, plus what has been looted since. Those
 * come from two places (a fetched history and a push subscription) and the two **race**, because the
 * subscription is live from the moment of mount while the fetch is a round trip. That race is normal
 * rather than rare: a replayed log gap
 * ([ADR 0044](../../specs/decisions/0044-the-log-position-outlives-the-app.md)) delivers a burst of
 * drops at launch, exactly when a window is mounting.
 *
 * Whichever wins, both sets are kept — the earlier "keep what we have if we have anything" rule
 * discarded the whole ledger whenever a single live drop got in first. The overlap is real, since a
 * drop is added to the ledger *before* it is broadcast, so a line can legitimately be in both.
 *
 * Pure and DOM-free so the ordering and the de-duplication can be pinned by tests rather than
 * reasoned about in a hook.
 */
import type { LootEvent } from "./types";

/**
 * A loot line's identity, for telling "the same drop, from both sources" from "two drops that look
 * alike".
 *
 * `logId` is what makes this exact: the ledger is populated from the very event objects that get
 * broadcast, so a line present in both carries the same one, and it is unique within a run of the
 * app — which is the only span in which the two sources can overlap. The timestamp and item are
 * carried too, so a stored line from an *earlier* run that happens to reuse a `logId` isn't mistaken
 * for one of these.
 */
export function lootKey(e: LootEvent): string {
  return `${e.at}\0${e.logId}\0${e.item}`;
}

/**
 * The feed: everything already held (newest first), then the stored history behind it, minus
 * whatever is already held, capped at `limit`.
 *
 * `held` comes first unconditionally rather than being merged by timestamp. It is newer by
 * construction — it is what arrived while the history was in flight — and a log's own clock has
 * one-second resolution, so sorting by it would shuffle drops that came off one corpse in order.
 */
export function mergeLootFeed(held: LootEvent[], history: LootEvent[], limit: number): LootEvent[] {
  if (!held.length) return history.slice(0, limit);
  const seen = new Set(held.map(lootKey));
  return [...held, ...history.filter((e) => !seen.has(lootKey(e)))].slice(0, limit);
}
