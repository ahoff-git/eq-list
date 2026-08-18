/**
 * item-sources.ts — where an item actually comes from, according to your own kills.
 *
 * [drop-truth.ts](./drop-truth.ts) reconciles the wiki with observation for **one mob**: "of the
 * things this drops, which have I seen?" This is the same reconciliation asked from the other end —
 * "this item I'm holding, who drops it, and where?" — which is the question an *item* page raises
 * and the one the wiki answers worst. Its "Drops From" lists a mob and a zone and never a rate
 * ([wiki-data](../../specs/wiki-data/README.md)), and it describes an older build, so an item this
 * game drops from something the wiki never linked has nowhere at all to show up.
 *
 * Our kill log knows all three: which mob, which zone, and — because a kill carries a position —
 * roughly *where* in that zone ([ADR 0022](../../specs/decisions/0022-invocation-effects-and-kill-locations.md)).
 * So the verdicts here are ADR 0025's, pointed at an item rather than a mob:
 *
 *   - **confirmed** — the wiki says this mob drops it and we've seen it happen.
 *   - **undocumented** — we've seen it and no wiki source names that mob. The row worth reading.
 *   - **unseen** — the wiki names the mob, we've killed it, and it has never once given the item up.
 *     Only produced for a mob we *have* kills of: with no kills there is no observation to add, and
 *     the wiki's own claim is already on the page above.
 *
 * Names are folded by [`normalizeItemName`](./grouping.ts) rather than by `mob-stats.ts`'s
 * `dropKey`, so a `Dragoon Dirk +2` off a corpse answers a search for the wiki's `Dragoon Dirk`
 * ([ADR 0057](../../specs/decisions/0057-a-grade-is-not-an-identity.md)) — the same fold
 * `drop-truth.ts` applies for the same reason.
 *
 * Pure and DOM-free: it takes the pooled knowledge and the page's own sources and returns rows.
 */
import { SUSPICIOUS_AFTER_KILLS, TRUST_OBSERVED_AFTER_KILLS, type DropVerdict } from "./drop-truth";
import { normalizeItemName } from "./grouping";
import { mobKey, type MobKnowledge } from "./mob-stats";
import { ratio } from "./numbers";
import type { ItemSource } from "./types";

/** One place a mob has been killed, and what those kills produced. */
export interface ItemDropPlace {
  /** The zone, as the pooled tally names it (one row per place, not per spelling). */
  zone: string;
  kills: number;
  /** Kills here that produced the item. */
  seen: number;
  rate: number;
  /** The middle of where those kills happened, and how far they spread — "where-ish". */
  area?: MobKnowledge["area"];
  lastAt: string;
}

/** One mob that gives an item up, with the evidence and how it squares with the wiki. */
export interface ItemDropSource {
  mob: string;
  verdict: DropVerdict;
  /** Kills of this mob everywhere, pooled — the denominator for `rate`. */
  kills: number;
  /** How many of those you saw yourself, so a pooled figure keeps its provenance. */
  myKills: number;
  seen: number;
  rate: number;
  /** Where it was killed, most productive place first. */
  places: ItemDropPlace[];
  /** Everyone whose kills are in here (you are not listed). */
  contributors: string[];
  lastAt: string;
  /** True once the sample is big enough to lead with, as `drop-truth.ts` decides it. */
  trustObserved: boolean;
  /** True when the wiki claims this mob drops it and a substantial sample never has. */
  suspicious: boolean;
}

/** How many of a mob's kills produced the item, every grade of it counted as the one drop. */
function seenIn(known: MobKnowledge, itemKey: string): number {
  let seen = 0;
  for (const drop of known.drops) {
    if (normalizeItemName(drop.item) === itemKey) seen += drop.count;
  }
  return seen;
}

/** The mobs a wiki page claims drop the item, folded so "a gnoll" meets the log's "gnoll". */
function claimedMobs(wikiSources: readonly ItemSource[]): Set<string> {
  const mobs = new Set<string>();
  for (const s of wikiSources) {
    if (s.kind !== "drop") continue;
    const key = mobKey(s.where ?? "");
    if (key) mobs.add(key);
  }
  return mobs;
}

/**
 * Who drops `item`, from the pooled kill tally, reconciled with what the page claims.
 *
 * `known` is every mob in every zone it's known in (`mobs.all()`), so a mob killed in three camps
 * arrives as three rows and leaves as one — the answer to "who drops it" is a mob, and the answer
 * to "where" is the list of places under it.
 */
export function itemDropSources(
  item: string,
  known: readonly MobKnowledge[],
  wikiSources: readonly ItemSource[] = [],
): ItemDropSource[] {
  const itemKey = normalizeItemName(item);
  if (!itemKey) return [];
  const claimed = claimedMobs(wikiSources);

  const byMob = new Map<string, ItemDropSource>();
  for (const k of known) {
    const key = mobKey(k.mob);
    if (!key) continue;
    const seen = seenIn(k, itemKey);
    let row = byMob.get(key);
    if (!row) {
      byMob.set(
        key,
        (row = {
          mob: k.mob,
          verdict: "unseen",
          kills: 0,
          myKills: 0,
          seen: 0,
          rate: 0,
          places: [],
          contributors: [],
          lastAt: k.lastAt,
          trustObserved: false,
          suspicious: false,
        }),
      );
    }
    row.kills += k.kills;
    row.myKills += k.myKills;
    row.seen += seen;
    if (k.lastAt > row.lastAt) row.lastAt = k.lastAt;
    for (const by of k.contributors) if (!row.contributors.includes(by)) row.contributors.push(by);
    row.places.push({
      zone: k.zone,
      kills: k.kills,
      seen,
      rate: ratio(seen, k.kills, 3),
      area: k.area,
      lastAt: k.lastAt,
    });
  }

  // A mob earns a row only if it has taught us something about *this* item: either it dropped it
  // somewhere, or the wiki says it should and our kills of it are the evidence against that claim.
  // Judged per mob rather than per camp, so a barren camp of a mob that *does* drop it stays — "40
  // kills there and none here" is the shape of a drop that is zone-specific, and is worth reading.
  const rows = [...byMob.entries()]
    .filter(([key, row]) => row.seen > 0 || claimed.has(key))
    .map(([key, row]) => {
      row.rate = ratio(row.seen, row.kills, 3);
      row.verdict = !claimed.has(key) ? "undocumented" : row.seen > 0 ? "confirmed" : "unseen";
      row.trustObserved = row.kills >= TRUST_OBSERVED_AFTER_KILLS;
      row.suspicious = row.verdict === "unseen" && row.kills >= SUSPICIOUS_AFTER_KILLS;
      // The camp it actually came from leads.
      row.places.sort(
        (a, b) => b.seen - a.seen || b.rate - a.rate || b.kills - a.kills || a.zone.localeCompare(b.zone),
      );
      return row;
    });

  // What we've seen first (the useful answer), then the wiki claims our kills contradict.
  return rows.sort(
    (a, b) => b.seen - a.seen || b.rate - a.rate || b.kills - a.kills || a.mob.localeCompare(b.mob),
  );
}

/** The pooled totals behind a set of rows — the sentence a heading wants: "6 drops in 214 kills". */
export function itemDropTotals(rows: readonly ItemDropSource[]): { kills: number; seen: number; mobs: number } {
  return {
    kills: rows.reduce((n, r) => n + r.kills, 0),
    seen: rows.reduce((n, r) => n + r.seen, 0),
    mobs: rows.filter((r) => r.seen > 0).length,
  };
}

/**
 * The item's own vendor price, if one of your sales has taught us one.
 *
 * A price is a property of the item that holds wherever it dropped
 * ([ADR 0047](../../specs/decisions/0047-money-is-copper-in-two-ledgers.md)), which is exactly why
 * it belongs on the item's page rather than only in the loot ledger.
 *
 * The exact name wins over a folded one, and the row is returned whole so the caller can name what
 * it actually sold: a `+2` fetches more than the plain item, so a grade's price stands in for the
 * base item's only in the absence of a real one, and must say which it is.
 */
export function priceOfItem<T extends { item: string }>(item: string, prices: readonly T[]): T | undefined {
  const key = normalizeItemName(item);
  if (!key) return undefined;
  const exact = item.trim().toLowerCase();
  return (
    prices.find((p) => p.item.trim().toLowerCase() === exact) ??
    prices.find((p) => normalizeItemName(p.item) === key)
  );
}
