/**
 * faction-observation.ts — pooled evidence for what actually raises or lowers a faction: the
 * *verified* half of `faction-cause.ts`'s guess, shared the way `mob-stats.ts` shares a drop rate.
 *
 * Mirrors that module's role one level up: `FactionObservation` is the unit a contributor reports
 * (one tally per faction+cause, the same grain `FactionCauseTally` already uses for a single
 * install's own standing — `mob-stats.ts`'s `MobObservation` is likewise one mob+zone's own tally,
 * never one kill at a time), and `FactionCauseKnowledge` is what pooling several contributors'
 * tallies — plus your own — actually answers, the same "provenance, not a trust score" question
 * `pooling.ts` already answers for a mob's drop rate, asked here about a faction's cause instead.
 *
 * **A dialogue cause is still a guess, far more so than a kill — pooling must never erase that
 * difference.** `kind` rides along on every row for exactly this reason: a reader (the merge below,
 * and the UI) can always tell which kind of evidence a pooled number is actually made of, never a
 * blended, undifferentiated count. `electron/faction-observations.ts` is the store half — its own
 * header has the five rules this is pooled under.
 *
 * Pure and DOM-free, like `pooling.ts`: the panels word it, this decides it.
 */
import type { Contributor } from "./contributors";
import type { FactionCause } from "./types";

/**
 * One contributor's tally of a single (faction, cause) question — "N hits, net M, blamed on this
 * mob/NPC" — reported the way a `MobObservation` reports one mob+zone's own tally, not one kill at
 * a time. `by`/`byId` are stamped on the way out by `credit` (`electron/faction-observations.ts`),
 * the same as `MobObservation.by`/`byId` — absent for a row that hasn't been pooled yet (your own,
 * read straight off the ledger).
 */
export interface FactionObservation {
  faction: string;
  /** Kill vs. dialogue — see this module's header for why it's never flattened away. */
  kind: FactionCause["kind"];
  /** The mob or NPC/speaker name — the same field `FactionCauseTally.source` already means. */
  source: string;
  net: number;
  hits: number;
  by?: string;
  byId?: string;
}

/**
 * What pooling several contributors' tallies (plus your own) says about one (faction, cause)
 * question — the unit the `faction-pooling.ts` helpers are asked about, and what the Faction tab
 * reads to show pooled evidence beside its own.
 */
export interface FactionCauseKnowledge {
  faction: string;
  kind: FactionCause["kind"];
  source: string;
  /** Every hit anyone has attributed to this cause — yours and every pooled contributor's, summed. */
  net: number;
  hits: number;
  /** Your own share of `hits` — what provenance is judged against (`pooling.ts`'s `provenanceOf`). */
  myHits: number;
  /** Everyone besides you whose report touched this row. */
  contributors: Contributor[];
}

const keyOf = (faction: string, kind: string, source: string): string =>
  `${faction.toLowerCase()}\u0000${kind}\u0000${source.toLowerCase()}`;

/**
 * Fold your own tallies (`mine` — derived fresh from the ledger every time, never stored; see the
 * module header) together with what peers have reported (`pooled`), one row per
 * (faction, kind, source) — the same question `mergeObservations` (`mob-stats.ts`) answers for a
 * mob's drop rate, asked here about a faction's cause instead. Biggest `|net|` first, the same
 * order `faction-log.ts`'s own `byCauseImpact` already sorts a standing's causes in.
 */
export function mergeFactionObservations(
  mine: readonly FactionObservation[],
  pooled: readonly FactionObservation[],
): FactionCauseKnowledge[] {
  const byKey = new Map<string, FactionCauseKnowledge>();

  for (const o of mine) {
    const key = keyOf(o.faction, o.kind, o.source);
    byKey.set(key, { faction: o.faction, kind: o.kind, source: o.source, net: o.net, hits: o.hits, myHits: o.hits, contributors: [] });
  }

  for (const o of pooled) {
    const key = keyOf(o.faction, o.kind, o.source);
    const cur = byKey.get(key) ?? { faction: o.faction, kind: o.kind, source: o.source, net: 0, hits: 0, myHits: 0, contributors: [] };
    cur.net += o.net;
    cur.hits += o.hits;
    if (o.byId && !cur.contributors.some((c) => c.id === o.byId)) cur.contributors.push({ id: o.byId, name: o.by || o.byId });
    byKey.set(key, cur);
  }

  return [...byKey.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || b.hits - a.hits);
}
