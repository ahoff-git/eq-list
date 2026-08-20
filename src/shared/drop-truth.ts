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
import { itemBaseName } from "./names";
import { percent } from "./format";
import { round } from "./numbers";

/** How much evidence before "never seen it" is worth remarking on. */
export const SUSPICIOUS_AFTER_KILLS = 25;

/** How much before an observed rate is worth preferring to the wiki's. */
export const TRUST_OBSERVED_AFTER_KILLS = 15;

/** Under this a drop is rare enough that a whole percent hides the difference between 1-in-100 and
 *  1-in-300 — so it gets a decimal. */
const RARE_BELOW = 0.1;

/** How much before it stops being "indicative" and becomes a figure you'd quote. */
export const SETTLED_AFTER_KILLS = 50;

/** How far a rate out of this many kills should be trusted. Matches the `md-rate` CSS classes. */
export type RateConfidence = "solid" | "fair" | "thin";

/**
 * The sample-size ladder for an observed rate.
 *
 * The mob panel had these two thresholds written as bare `50` and `15`, **twice** — once to pick the
 * CSS class and again to word the hover — and its `15` was silently the same decision as
 * `TRUST_OBSERVED_AFTER_KILLS` above, with nothing tying them together. Moving the line at which we
 * start believing our own kills would have left the dimming and the tooltip disagreeing with the
 * reconciliation.
 *
 * Note this is about **sample size**, not position — the ladder in
 * [kill-confidence.ts](./kill-confidence.ts) answers "where did this happen", a different question
 * with its own tiers.
 */
export function rateConfidence(kills: number): RateConfidence {
  if (kills >= SETTLED_AFTER_KILLS) return "solid";
  if (kills >= TRUST_OBSERVED_AFTER_KILLS) return "fair";
  return "thin";
}

/**
 * Why a rate is dimmed or not — the wording for each rung of the ladder above.
 *
 * It lives here with the thresholds rather than in the panel, because two panels now show the same
 * rate: the map's 📖 list and a mob's own page. A sentence that said "worth trusting" in one and
 * "indicative" in the other, off the same kills, would be two different claims.
 */
export function rateWhy(kills: number): string {
  switch (rateConfidence(kills)) {
    case "solid":
      return `Out of ${kills} kills — a rate worth trusting.`;
    case "fair":
      return `Out of ${kills} kills — indicative, not settled.`;
    default:
      return `Out of only ${kills} kills. Treat this as a hint; kill more (or pool with peers).`;
  }
}

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
  const wikiByKey = new Map<string, { item: string; rate: string | undefined }>();
  for (const [item, rate] of Object.entries(wikiDrops)) {
    const key = normalizeItemName(item);
    if (!wikiByKey.has(key)) wikiByKey.set(key, { item, rate });
  }

  // The same fold puts every grade of an item on one row — a "+2" and a "+5" Crushbone Belt are
  // one drop with a second roll on it (`names.ts`) — so several spellings routinely land on one
  // key here and their counts have to be *added*. Keying a Map straight off the entries would let
  // the last spelling seen overwrite the rest, quietly throwing kills away.
  const observedByKey = new Map<string, { item: string; n: number }>();
  for (const [item, n] of Object.entries(observed)) {
    const key = normalizeItemName(item);
    const already = observedByKey.get(key);
    if (already) already.n += n;
    // Graded names are folded, so the base name is the only one that describes the whole row.
    else observedByKey.set(key, { item: itemBaseName(item), n });
  }

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
        observedRate: kills ? round(seen / kills, 3) : undefined,
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

/** The rate that's being shown: how it reads, where it came from, and what it is as a number. */
export interface ShownRate {
  text: string;
  source: "observed" | "wiki" | "none";
  /**
   * The same figure as a fraction, for **ordering** — absent when there is no figure at all.
   *
   * It's returned from here rather than worked out beside the caller because the precedence above is
   * the whole point of this function: a comparison that re-derived "which figure am I looking at"
   * could sort by the wiki's number while the badge beside it shows yours.
   */
  value?: number;
}

/**
 * The rate to *show*, and where it came from. Observation wins once there's enough of it;
 * before that the wiki's figure is the better guess, and the label says which you're reading.
 */
export function bestRate(truth: DropTruth): ShownRate {
  if (truth.trustObserved && truth.observedRate !== undefined) {
    return { text: dropRate(truth.observedRate), source: "observed", value: truth.observedRate };
  }
  if (truth.wikiRate) return { text: truth.wikiRate, source: "wiki", value: percentValue(truth.wikiRate) };
  if (truth.observedRate !== undefined && truth.seen > 0) {
    return { text: dropRate(truth.observedRate), source: "observed", value: truth.observedRate };
  }
  return { text: "—", source: "none" };
}

/**
 * The wiki's rate as a fraction. It arrives as a string (`"17.3%"`) because that is how the page
 * writes it and `parse.ts` keeps figures verbatim — so the one place that needs to *compare* rates
 * reads it back, rather than every page storing a second, derived copy.
 */
function percentValue(rate: string): number | undefined {
  const m = /(\d+(?:\.\d+)?)\s*%/.exec(rate);
  return m ? Number(m[1]) / 100 : undefined;
}

/**
 * An observed drop rate. Exported because the mob panel shows the same number and had grown its own
 * copy of this line — and a rate that reads `2%` in one place and `1.5%` in another is two different
 * claims about the same kills.
 *
 * The extra decimal below 10% is the point: rare drops are where the interesting differences are, and
 * `0%` for one drop in 300 kills says the opposite of what was measured.
 */
export function dropRate(rate: number): string {
  return percent(rate, { places: rate < RARE_BELOW ? 1 : 0 });
}
