/**
 * drop-truth.ts — reconciling what the wiki claims a mob drops with what we've actually seen.
 *
 * The wiki is a solid starting point and not much more: it describes an older, since heavily
 * modified game, so its drop rates are someone else's sample of a different patch. Our own
 * kills are this server, this build, now — but they're a *small* sample, and a small sample
 * confidently presented is its own kind of lie.
 *
 * So neither source wins outright. This puts them side by side and names the disagreement,
 * which is the useful part:
 *
 *   - **confirmed** — the wiki lists it and we've seen it. Observed rate leads; the wiki's is
 *     context.
 *   - **undocumented** — we've seen it and the wiki doesn't list it at all. The most valuable
 *     row on the screen: something the game does that no reference knows.
 *   - **unseen** — the wiki lists it and we haven't seen it once. Meaningless after three
 *     kills, damning after two hundred, so it carries the kill count that makes it judgeable.
 *
 * Pure and DOM-free so it can be tested without a wiki or a log.
 */
import { normalizeItemName } from "./grouping";

/** How much evidence before "never seen it" is worth remarking on. */
export const SUSPICIOUS_AFTER_KILLS = 25;

/** How much before an observed rate is worth preferring to the wiki's. */
export const TRUST_OBSERVED_AFTER_KILLS = 15;

export type DropVerdict = "confirmed" | "undocumented" | "unseen";

/** One item, as both sources see it. */
export interface DropTruth {
  item: string;
  verdict: DropVerdict;
  /** Kills behind the observation — the denominator for `observedRate`. */
  kills: number;
  /** Times we saw it drop. */
  seen: number;
  /** `seen / kills`, or undefined when we have no kills to go on. */
  observedRate?: number;
  /** The wiki's figure, verbatim (it's a string like "4.7%"), when it has one. */
  wikiRate?: string;
  /** True once the observation rests on enough kills to lead with. */
  trustObserved: boolean;
  /** True when the wiki claims it but a substantial sample has never produced it. */
  suspicious: boolean;
}

/**
 * Reconcile one mob's wiki loot list with what we've observed.
 *
 * `wikiDrops` maps item → the wiki's rate string (absent rate is fine — being *listed* is the
 * claim). `observed` maps item → how many of `kills` produced it.
 */
export function reconcileDrops(
  wikiDrops: Record<string, string | undefined>,
  observed: Record<string, number>,
  kills: number,
): DropTruth[] {
  // The wiki and the log rarely agree on capitalisation, and matching them literally turned
  // one item into two contradictory rows: the log's spelling "undocumented" (the wiki has
  // never heard of it) and the wiki's "unseen" (all those kills produced none) — both false,
  // and both the opposite of the truth. Since "undocumented" is the headline claim this
  // module exists to make (ADR 0025), a capital letter must not be able to manufacture one.
  const wikiByKey = new Map(Object.entries(wikiDrops).map(([item, rate]) => [normalizeItemName(item), { item, rate }]));
  const observedByKey = new Map(Object.entries(observed).map(([item, n]) => [normalizeItemName(item), { item, n }]));
  const keys = new Set([...wikiByKey.keys(), ...observedByKey.keys()]);
  const trustObserved = kills >= TRUST_OBSERVED_AFTER_KILLS;

  return [...keys]
    .map((key): DropTruth => {
      const fromWiki = wikiByKey.get(key);
      const fromLog = observedByKey.get(key);
      const seen = fromLog?.n ?? 0;
      const listed = !!fromWiki;
      // Prefer the wiki's spelling: it's the canonical one, and it's what the item's page and
      // the shopping list are keyed by.
      const item = fromWiki?.item ?? fromLog?.item ?? key;
      return {
        item,
        verdict: !listed ? "undocumented" : seen > 0 ? "confirmed" : "unseen",
        kills,
        seen,
        observedRate: kills ? Math.round((seen / kills) * 1000) / 1000 : undefined,
        wikiRate: fromWiki?.rate,
        trustObserved,
        // A wiki claim is only suspicious once we've killed the thing enough times that its
        // absence means something.
        suspicious: listed && seen === 0 && kills >= SUSPICIOUS_AFTER_KILLS,
      };
    })
    // What we've actually seen first, then the wiki's unconfirmed claims.
    .sort((a, b) => b.seen - a.seen || a.item.localeCompare(b.item));
}

/**
 * The rate to *show*, and where it came from. Observation wins once there's enough of it;
 * before that the wiki's figure is the better guess, and the label says which you're reading.
 */
export function bestRate(truth: DropTruth): { text: string; source: "observed" | "wiki" | "none" } {
  if (truth.trustObserved && truth.observedRate !== undefined) {
    return { text: formatRate(truth.observedRate), source: "observed" };
  }
  if (truth.wikiRate) return { text: truth.wikiRate, source: "wiki" };
  if (truth.observedRate !== undefined && truth.seen > 0) {
    return { text: formatRate(truth.observedRate), source: "observed" };
  }
  return { text: "—", source: "none" };
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(rate < 0.1 ? 1 : 0)}%`;
}
