/**
 * mob-provenance.ts — the Mob Knowledge panel's own small badges on top of `pooling.ts`.
 *
 * `pooling.ts` says it plainly: "Pure and DOM-free: the panels word it, this decides it." This is
 * the wording layer for one row at a time — the same split `faction-sort.ts`'s `pooledCauseBadge`
 * draws for the Faction tab (ADR 0283): a short label plus a hover-explained tooltip, built off an
 * already-decided verdict rather than a second opinion about one.
 *
 * Unlike the Faction tab, there's no separate per-domain pooling file to sit beside this one —
 * `pooling.ts` already speaks `MobKnowledge`/`MobDrop` directly, the way `faction-pooling.ts` speaks
 * `FactionCauseKnowledge` — so this is only the "a panel wants a short badge, not a whole sentence"
 * layer on top of it, not a second `provenanceOf`/`rateSplit`.
 */
import { poolStanding, poolWhy, rateSplit, type PoolStanding } from "../pooling";
import { dropRate } from "./drop-truth";
import type { MobDrop, MobKnowledge } from "./mob-stats";

/** A small badge, and the sentence a hover explains it with. */
export interface ProvenanceBadge {
  label: string;
  title: string;
  confidence: PoolStanding["confidence"];
}

/**
 * A graded verdict on how much of a mob's pooled kill tally is really yours — replacing "pooled
 * with X, Y" with the same kind of confidence-graded note the Faction tab's `pooledCauseBadge`
 * shows.
 *
 * Silent (`undefined`) the moment nothing is pooled at all, same rule `pooledCauseBadge` states: a
 * tally nobody else has touched should look exactly like it did before pooling existed, not get a
 * badge that fires on silence.
 */
export function provenanceBadge(known: MobKnowledge): ProvenanceBadge | undefined {
  const standing = poolStanding(known);
  if (standing.contributors === 0) return undefined;
  const label =
    standing.provenance === "mostly-yours"
      ? "mostly yours"
      : standing.provenance === "pooled"
        ? "pooled"
        : standing.provenance === "theirs"
          ? "mostly theirs"
          : undefined; // "yours" with contributors > 0 is a peer who hasn't added a kill yet — nothing to grade
  if (!label) return undefined;
  return { label, title: poolWhy(standing), confidence: standing.confidence };
}

/**
 * A badge for a drop row whose own rate and the pool's plainly disagree — the thing
 * `pooling.ts`'s `disagreements()` computes and nothing was reading before this. Looked up one row
 * at a time (via `rateSplit`, which `disagreements()` itself is built from) rather than requiring a
 * caller to search a precomputed list, the same per-row shape `pooledCauseBadge` offers.
 *
 * Silent whenever the two samples agree, or either is too small to lead — `rateSplit`'s own rule,
 * restated here only in the title.
 */
export function disagreeBadge(known: MobKnowledge, drop: MobDrop): { label: string; title: string } | undefined {
  const split = rateSplit(known, drop);
  if (!split.disagrees) return undefined;
  return {
    label: "disagrees",
    title:
      `You saw ${dropRate(split.mine.rate)} over ${split.mine.kills} kills; ` +
      `peers saw ${dropRate(split.theirs.rate)} over ${split.theirs.kills} kills. ` +
      `Reported, not resolved — one of these is about kills this install never saw.`,
  };
}
