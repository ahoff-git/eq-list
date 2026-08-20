/**
 * Black-box tests for pooled provenance ([src/shared/pooling.ts](../../src/shared/pooling.ts)) —
 * how much of a figure is yours, and what happens where your sample and a contributor's plainly
 * disagree.
 *
 * The property worth pinning is that **nothing here resolves a disagreement**. It reports one, and
 * only when both samples are big enough for the difference to mean something — a check that fires on
 * noise is a check people learn to scroll past.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { disagreements, poolStanding, poolWhy, provenanceOf, rateSplit } from "../../src/shared/pooling";
import type { MobKnowledge } from "../../src/shared/mob-stats";

function known(p: Partial<MobKnowledge> & { kills: number; myKills: number }): MobKnowledge {
  return {
    mob: "a gnoll pup",
    zone: "Blackburrow",
    drops: [],
    lastAt: "2026-08-19T01:00:00.000Z",
    contributors: [],
    copper: 0,
    copperPerKill: 0,
    ...p,
  };
}

test("whose figure it is, is decided by kills rather than by heads", () => {
  assert.equal(provenanceOf(40, 40), "yours");
  assert.equal(provenanceOf(0, 0), "yours"); // nothing pooled is not somebody else's
  assert.equal(provenanceOf(90, 100), "mostly-yours");
  assert.equal(provenanceOf(50, 100), "pooled");
  assert.equal(provenanceOf(5, 100), "theirs");
  // Five people who killed it twice each don't outweigh one who killed it three hundred times.
  assert.equal(provenanceOf(300, 310), "mostly-yours");
});

test("a standing carries the sample and the share, and the sentence says both", () => {
  const standing = poolStanding(known({ kills: 100, myKills: 10, contributors: ["Bob", "Alice"] }));
  assert.equal(standing.confidence, "solid");
  assert.equal(standing.provenance, "theirs");
  const why = poolWhy(standing);
  assert.match(why, /100 kills/);
  assert.match(why, /10 of them yours/);
  assert.match(why, /2 other players/);
  assert.match(poolWhy(poolStanding(known({ kills: 3, myKills: 3 }))), /hint/);
  assert.match(poolWhy(poolStanding(known({ kills: 0, myKills: 0 }))), /Nothing recorded/);
});

test("a pooled drop splits back into your evidence and theirs", () => {
  const k = known({
    kills: 120,
    myKills: 20,
    drops: [{ item: "Gnoll Fang", count: 30, myCount: 5, rate: 0.25 }],
  });
  const split = rateSplit(k, k.drops[0]);
  assert.deepEqual(split.mine, { count: 5, kills: 20, rate: 0.25 });
  assert.deepEqual(split.theirs, { count: 25, kills: 100, rate: 0.25 });
  assert.equal(split.disagrees, false); // the same rate from both sides is agreement, not a tie
});

test("a plain disagreement is reported", () => {
  const k = known({
    kills: 120,
    myKills: 20,
    // You saw it 1 in 20; they claim better than 1 in 2.
    drops: [{ item: "Gnoll Fang", count: 61, myCount: 1, rate: 0.508 }],
  });
  const [split] = disagreements(k);
  assert.equal(split.item, "Gnoll Fang");
  assert.equal(split.mine.rate, 0.05);
  assert.equal(split.theirs.rate, 0.6);
  // Reported, not resolved: both figures are still here, and neither has been dropped or averaged.
  assert.equal(split.mine.count, 1);
  assert.equal(split.theirs.count, 60);
});

test("a difference between two small samples is not a disagreement", () => {
  // One lucky kill out of two is a 50% rate. Flagging it against a 300-kill sample would be
  // reporting noise, and the check is symmetrical for exactly that reason.
  const tiny = known({ kills: 302, myKills: 2, drops: [{ item: "Gnoll Fang", count: 16, myCount: 1, rate: 0.053 }] });
  assert.deepEqual(disagreements(tiny), []);
  const theirsTiny = known({ kills: 42, myKills: 40, drops: [{ item: "Gnoll Fang", count: 21, myCount: 20, rate: 0.5 }] });
  assert.deepEqual(disagreements(theirsTiny), []);
});

test("a drop nobody else has seen isn't a disagreement about its rate", () => {
  // Your 15 kills, their 100, and they have never seen it: a rate of zero divides nothing, and
  // treating "no evidence" as "evidence of no" is the mistake `drop-truth.ts` names as `unseen`.
  const k = known({ kills: 115, myKills: 15, drops: [{ item: "Gnoll Fang", count: 3, myCount: 3, rate: 0.026 }] });
  assert.deepEqual(disagreements(k), []);
});
