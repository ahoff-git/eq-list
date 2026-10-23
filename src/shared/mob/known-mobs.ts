/**
 * known-mobs.ts — the mobs **you have killed**, as one searchable vocabulary.
 *
 * The mob half of what `known-items.ts` does for items (ADR 0103): Search offers a name your log knows
 * and the wiki's index doesn't, under "From your own log · not on the wiki", and opening it shows a page
 * made of your own kills (ADR 0334). Folded from the pooled kill tally, one entry per mob however many
 * zones it was killed in.
 */
import { fuzzyRank } from "../fuzzy";
import { DEFAULT_LIMIT, MIN_SCORE } from "../items/known-items";
import { mobKey, type MobKnowledge } from "./mob-stats";
import type { SearchResult } from "../types";

/** One mob we know exists because it has died in front of us, or a peer. */
export interface KnownMob {
  /** The kill log's spelling — article-stripped, as the log writes it. */
  mob: string;
  /** Kills across every zone — ranks the offers. */
  kills: number;
  /** Every zone it's been killed in, most kills first. */
  zones: string[];
  lastAt: string;
}

/** Fold the per-zone tally into one entry per mob, most-killed first. */
export function knownMobs(known: readonly MobKnowledge[]): KnownMob[] {
  const byKey = new Map<string, KnownMob & { byZone: Map<string, number> }>();
  for (const m of known) {
    const key = mobKey(m.mob);
    if (!key) continue;
    let entry = byKey.get(key);
    if (!entry) byKey.set(key, (entry = { mob: m.mob, kills: 0, zones: [], lastAt: m.lastAt, byZone: new Map() }));
    entry.kills += m.kills;
    entry.byZone.set(m.zone, (entry.byZone.get(m.zone) ?? 0) + m.kills);
    if (m.lastAt > entry.lastAt) entry.lastAt = m.lastAt;
  }
  return [...byKey.values()]
    .map(({ byZone, ...mob }) => ({ ...mob, zones: [...byZone].sort((a, b) => b[1] - a[1]).map(([zone]) => zone) }))
    .sort((a, b) => b.kills - a.kills || a.mob.localeCompare(b.mob));
}

/** Rank the vocabulary against a query, at the same bar as the wiki's index and your items. */
export function searchKnownMobs(query: string, mobs: readonly KnownMob[], limit = DEFAULT_LIMIT): KnownMob[] {
  const q = query.trim();
  if (q.length < 2) return [];
  return fuzzyRank(q, mobs, (m) => m.mob, { limit, minScore: MIN_SCORE }).map((m) => m.item);
}

/**
 * The ones the wiki's results don't already cover. Compared by `mobKey`, so the wiki's "A ghoul sage"
 * covers the log's "ghoul sage" — that mob opens the wiki's page, with your kills under it.
 */
export function mobsUnknownToTheWiki(mobs: readonly KnownMob[], wikiHits: readonly SearchResult[]): KnownMob[] {
  const covered = new Set(wikiHits.map((r) => mobKey(r.title)));
  return mobs.filter((m) => !covered.has(mobKey(m.mob)));
}
