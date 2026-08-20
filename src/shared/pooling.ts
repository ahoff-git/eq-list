/**
 * pooling.ts — how much of a pooled figure is yours, and what to do when a contributor disagrees
 * with you.
 *
 * Pooling is the only way most of these figures get big enough to mean anything: forty kills of a
 * mob is a hint, and six players' forty kills is a rate. It is also the only place this app takes a
 * number from someone it cannot check. Those two facts are not in tension so long as one rule holds
 * — **a pooled figure never stops saying whose it is** — and this module is that rule in code.
 *
 * Three things follow from it, and none of them is "score the contributor":
 *
 *   1. **Provenance is shown, not scored.** A rate is labelled by where it came from
 *      (`provenanceOf`), because "40 kills, all yours" and "40 kills, 2 yours" are different claims
 *      about the same number. A trust *score* per peer would be worse than useless: it would look
 *      authoritative, and there is nothing to compute it from — we have no way to tell an unlucky
 *      streak from a liar, and pretending otherwise would put a made-up number in front of a real
 *      one.
 *   2. **Disagreement is reported, not resolved** (`estimates.ts` rule 5). Where your own sample and
 *      a contributor's say plainly different things, both are shown and neither is dropped. One of
 *      them is about an evening this app did not attend.
 *   3. **Nothing pooled can move what you saw yourself.** That property is upheld a layer down — in
 *      `mob-knowledge.ts`, where your observations are derived from your kill log every time and
 *      peers' are stored apart — and is worth naming here because it is what makes reading a
 *      stranger's numbers safe at all.
 *
 * Pure and DOM-free: the panels word it, this decides it.
 */
import { confidenceOf, disagrees, type Confidence, type SampleScale } from "./estimates";
import { SETTLED_AFTER_KILLS, TRUST_OBSERVED_AFTER_KILLS } from "./drop-truth";
import { ratio } from "./numbers";
import type { MobDrop, MobKnowledge } from "./mob-stats";

/**
 * The sample ladder a pooled figure is judged on — the same two numbers `drop-truth.ts` has used to
 * decide when an observed rate may lead and when it stops needing a hedge, rather than a second
 * opinion about the same question.
 */
export const POOL_SCALE: SampleScale = { fair: TRUST_OBSERVED_AFTER_KILLS, solid: SETTLED_AFTER_KILLS };

/** Where a pooled figure mostly came from. */
export type Provenance =
  /** Every kill behind it is one of yours. */
  | "yours"
  /** Mostly yours, sharpened by others. */
  | "mostly-yours"
  /** A genuine pool — neither side is the story. */
  | "pooled"
  /** Almost none of this is yours: useful, and unverifiable by you. */
  | "theirs";

/** Above this share of the kills, a figure is essentially one person's. */
const MOSTLY = 0.8;

/** Below this share, calling it "ours" would be flattering. */
const BARELY = 0.2;

/**
 * Whose figure this mostly is.
 *
 * By **kills**, not by contributor count: five people who killed it twice each are not a bigger
 * claim on the rate than one person who killed it three hundred times, and counting heads instead
 * of samples is how a pooled figure starts flattering whoever is chattiest.
 */
export function provenanceOf(myKills: number, kills: number): Provenance {
  if (kills <= 0 || myKills >= kills) return "yours";
  const mine = myKills / kills;
  if (mine >= MOSTLY) return "mostly-yours";
  return mine <= BARELY ? "theirs" : "pooled";
}

/** How much a pooled figure is worth: its sample size, and how much of the sample you witnessed. */
export interface PoolStanding {
  confidence: Confidence;
  provenance: Provenance;
  kills: number;
  myKills: number;
  /** How many other people are in it. */
  contributors: number;
}

export function poolStanding(known: MobKnowledge): PoolStanding {
  return {
    confidence: confidenceOf(known.kills, POOL_SCALE),
    provenance: provenanceOf(known.myKills, known.kills),
    kills: known.kills,
    myKills: known.myKills,
    contributors: known.contributors.length,
  };
}

/** One sentence a reader can act on: how big the sample is, and how much of it is yours. */
export function poolWhy(standing: PoolStanding): string {
  const { kills, myKills, contributors } = standing;
  if (!kills) return "Nothing recorded yet.";
  const who =
    standing.provenance === "yours"
      ? "all your own kills"
      : `${myKills} of them yours, the rest from ${contributors === 1 ? "1 other player" : `${contributors} other players`}`;
  const worth =
    standing.confidence === "solid"
      ? "a rate worth trusting"
      : standing.confidence === "fair"
        ? "indicative, not settled"
        : "a hint, not a rate";
  return `Out of ${kills} kills — ${who}. ${worth[0].toUpperCase()}${worth.slice(1)}.`;
}

/**
 * How far apart two rates have to be before it is worth saying so.
 *
 * A ratio rather than a difference, because these are probabilities across three orders of
 * magnitude: half a percentage point is nothing between two common drops and everything between two
 * rare ones. Three-to-one is deliberately loose — the everyday spread of small samples must not trip
 * it, or the flag becomes wallpaper and stops being read.
 */
const DISAGREE_RATIO = 3;

/** Your sample and everyone else's, side by side, for one drop. */
export interface RateSplit {
  item: string;
  mine: { count: number; kills: number; rate: number };
  theirs: { count: number; kills: number; rate: number };
  /** True when the two are far enough apart to be worth a reader's attention. */
  disagrees: boolean;
}

/**
 * Split a pooled drop back into your evidence and theirs.
 *
 * Possible only because the merge carries `myCount` alongside `count` — without it a pooled rate can
 * be believed or not, and nothing in between.
 *
 * `disagrees` fires only when **both** samples are big enough to lead (`POOL_SCALE.fair`). That
 * matters: one lucky kill out of two is a 50% rate, and flagging it against a peer's 300-kill 5%
 * would be reporting noise as a disagreement. Which is a way of saying the check is symmetrical on
 * purpose — it is not "is this peer wrong", it is "do these two samples describe the same mob".
 */
export function rateSplit(known: MobKnowledge, drop: MobDrop): RateSplit {
  const theirKills = known.kills - known.myKills;
  const theirCount = drop.count - drop.myCount;
  const mine = { count: drop.myCount, kills: known.myKills, rate: ratio(drop.myCount, known.myKills, 3) };
  const theirs = { count: theirCount, kills: theirKills, rate: ratio(theirCount, theirKills, 3) };
  const comparable = known.myKills >= POOL_SCALE.fair && theirKills >= POOL_SCALE.fair;
  const [low, high] = mine.rate <= theirs.rate ? [mine.rate, theirs.rate] : [theirs.rate, mine.rate];
  return { item: drop.item, mine, theirs, disagrees: comparable && low > 0 && disagrees(low, high, DISAGREE_RATIO) };
}

/** Every drop where your sample and the pool's plainly disagree — the rows worth a second look. */
export function disagreements(known: MobKnowledge): RateSplit[] {
  return known.drops.map((d) => rateSplit(known, d)).filter((s) => s.disagrees);
}
