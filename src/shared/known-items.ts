/**
 * known-items.ts — the items **you have actually held**, as a thing search can look in.
 *
 * The wiki is the app's index of what exists ([ADR 0003](../../specs/decisions/0003-eqlwiki-runtime-data-source.md)),
 * and on this build it is an incomplete one: a `Desecrated Kejaar Totem` that has dropped for you
 * forty times can be absent from it entirely, and a search for it then answers **nothing at all** —
 * the one answer that is certainly wrong, since the thing is in your bags. That's
 * [ADR 0025](../../specs/decisions/0025-observation-over-the-wiki.md) reaching the search box: the
 * wiki seeds what we know, observation corrects it, and here it has to be able to *add* to it
 * ([ADR 0103](../../specs/decisions/0103-search-can-answer-from-your-own-log.md)).
 *
 * Two records know what you've held, and both are used because neither is a superset of the other:
 *
 *   - the **loot ledger** — every line the log printed, including loot off a corpse in a zone we
 *     couldn't name and things nothing was ever killed for;
 *   - the **pooled mob tally** — which mob gave it up, which is what makes an entry worth opening,
 *     and which covers drops whose loot lines have since aged out of the ledger.
 *
 * Names are folded by `normalizeItemName` and shown by `itemBaseName`, so every grade of an item is
 * one entry ([ADR 0057](../../specs/decisions/0057-a-grade-is-not-an-identity.md)) — a search box
 * offering `Dragoon Dirk +1`, `+2` and `+3` as three findings is offering one item three times.
 *
 * Pure and DOM-free: the renderer supplies both records and this ranks them.
 */
import { fuzzyRank } from "./fuzzy";
import { normalizeItemName } from "./grouping";
import { itemBaseName } from "./names";
import type { MobKnowledge } from "./mob-stats";
import type { LootedItem, SearchResult } from "./types";

/** One item we know exists because we've held it, however the wiki feels about that. */
export interface KnownItem {
  /** The log's own spelling, grade folded away — the only name anything here can offer. */
  item: string;
  /** How much evidence there is: loot lines plus kills that produced it. Ranks the offers. */
  count: number;
  /** Mobs we've watched give it up (empty when only the ledger knows it). */
  mobs: string[];
  /** Most recent sighting, so "you looted this last night" can be told from "once, in April". */
  lastAt: string;
}

/**
 * How well a name has to match before it's offered. The wiki's own index searches at `fuzzyRank`'s
 * default and this is deliberately the same: a player types one query, and a box that answered a
 * typo from one source and not the other would look broken rather than strict.
 */
const MIN_SCORE = 0.45;

/** What one search will offer from your own records — enough to find it, not a second results page. */
const DEFAULT_LIMIT = 6;

/** Fold the two records into one vocabulary of held things, best-evidenced first. */
export function knownItems(loot: readonly LootedItem[], known: readonly MobKnowledge[]): KnownItem[] {
  const byKey = new Map<string, KnownItem>();

  const entryFor = (name: string, at: string): KnownItem | undefined => {
    const key = normalizeItemName(name);
    if (!key) return undefined;
    let entry = byKey.get(key);
    if (!entry) byKey.set(key, (entry = { item: itemBaseName(name).trim(), count: 0, mobs: [], lastAt: at }));
    if (at > entry.lastAt) entry.lastAt = at;
    return entry;
  };

  for (const l of loot) {
    const entry = entryFor(l.item, l.lastAt);
    if (entry) entry.count += l.count;
  }
  for (const mob of known) {
    for (const drop of mob.drops) {
      const entry = entryFor(drop.item, mob.lastAt);
      if (!entry) continue;
      entry.count += drop.count;
      if (!entry.mobs.includes(mob.mob)) entry.mobs.push(mob.mob);
    }
  }

  return [...byKey.values()].sort((a, b) => b.count - a.count || a.item.localeCompare(b.item));
}

/**
 * Rank your own vocabulary against a query, the same way the wiki's index is ranked.
 *
 * The query is base-named first for the same reason `wiki.search` does it: a name read off a
 * tooltip carries a `+2` the records don't, and the stray token drags a good match under the bar.
 */
export function searchKnownItems(
  query: string,
  items: readonly KnownItem[],
  limit = DEFAULT_LIMIT,
): KnownItem[] {
  const q = itemBaseName(query.trim());
  if (q.length < 2) return [];
  return fuzzyRank(q, items, (i) => i.item, { limit, minScore: MIN_SCORE }).map((m) => m.item);
}

/**
 * The ones the wiki's own results don't already cover.
 *
 * This is what keeps the addition honest: an item the wiki *does* know stays a wiki result, opening
 * the wiki's page, with its own evidence underneath
 * ([ADR 0101](../../specs/decisions/0101-an-item-page-says-who-dropped-it.md)). Only a name the
 * index cannot answer is offered from your own log, so the list never shows one item twice.
 */
export function unknownToTheWiki(items: readonly KnownItem[], wikiHits: readonly SearchResult[]): KnownItem[] {
  const covered = new Set(wikiHits.map((r) => normalizeItemName(r.title)));
  return items.filter((i) => !covered.has(normalizeItemName(i.item)));
}
