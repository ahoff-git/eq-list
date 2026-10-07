/**
 * faction-pooling.ts — how much of a pooled faction-cause tally is yours, and how much to trust it.
 *
 * Deliberately not a reimplementation: `provenanceOf` (`pooling.ts`) already takes plain numbers, not
 * anything `MobKnowledge`-shaped, so it is reused here unchanged — "whose figure this mostly is" is
 * the same question whether the figure is a drop rate or a faction cause. `causeConfidence`/
 * `causeConfidenceWhy` (`faction-cause.ts`) already grade a *single install's* `hits` count on
 * exactly the ladder this pass wants for a *pooled* one too — "a guess repeated is a guess
 * corroborated" doesn't care whose hits did the repeating. The only genuinely new piece is folding
 * those two into one verdict about a `FactionCauseKnowledge` row.
 */
import { provenanceOf, type Provenance } from "./pooling";
import { causeConfidence, causeConfidenceWhy } from "./faction-cause";
import type { Confidence } from "./estimates";
import { count } from "./format";
import type { FactionCauseKnowledge } from "./faction-observation";

/** How much a pooled faction-cause figure is worth: its sample size, and how much of it is yours. */
export interface FactionPoolStanding {
  confidence: Confidence;
  provenance: Provenance;
  hits: number;
  myHits: number;
  contributors: number;
}

export function factionPoolStanding(known: FactionCauseKnowledge): FactionPoolStanding {
  return {
    confidence: causeConfidence({ hits: known.hits }),
    provenance: provenanceOf(known.myHits, known.hits),
    hits: known.hits,
    myHits: known.myHits,
    contributors: known.contributors.length,
  };
}

/** One sentence a reader can act on: how big the pooled sample is, how much of it is yours, and
 *  how much the repeat count itself is worth believing — `causeConfidenceWhy`'s own wording, which
 *  already covers that last part without this needing to restate it. */
export function factionPoolWhy(known: FactionCauseKnowledge): string {
  const { hits, myHits } = known;
  const peers = known.contributors.length;
  if (!hits) return "Nothing pooled yet.";
  const who =
    peers === 0
      ? "all your own hits"
      : `${myHits} of them yours, the rest from ${peers === 1 ? "1 other player" : `${peers} other players`}`;
  return `${count(hits, "hit")} total — ${who}. ${causeConfidenceWhy({ kind: known.kind, hits })}`;
}
