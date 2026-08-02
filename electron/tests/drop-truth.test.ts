/**
 * Black-box tests for reconciling the wiki's drop list with what we've observed. The wiki
 * describes an older, since-modified game, so these mostly pin *when* to believe which source
 * — and that a small sample never gets to masquerade as a rate.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bestRate,
  reconcileDrops,
  SUSPICIOUS_AFTER_KILLS,
  TRUST_OBSERVED_AFTER_KILLS,
} from "../../src/shared/drop-truth";

test("a drop the wiki lists and we've seen is confirmed", () => {
  const [truth] = reconcileDrops({ "Bone Chips": "20%" }, { "Bone Chips": 5 }, 20);
  assert.equal(truth.verdict, "confirmed");
  assert.equal(truth.seen, 5);
  assert.equal(truth.observedRate, 0.25);
  assert.equal(truth.wikiRate, "20%");
});

test("a drop the wiki has never heard of is flagged as undocumented", () => {
  // The most valuable row on the screen: the game does something no reference knows.
  const [truth] = reconcileDrops({}, { "Strange Trinket": 2 }, 30);
  assert.equal(truth.verdict, "undocumented");
  assert.equal(truth.wikiRate, undefined);
});

// The log and the wiki rarely agree on capitalisation. Matching them literally split one item
// into two rows with opposite, both-wrong verdicts — and since "undocumented" is the headline
// claim here, a stray capital was enough to manufacture a discovery.
test("a difference in capitalisation is the same item, not a discovery", () => {
  const truths = reconcileDrops({ "Bone Chips": "25%" }, { "bone chips": 8 }, 40);
  assert.equal(truths.length, 1);
  assert.equal(truths[0].verdict, "confirmed");
  assert.equal(truths[0].seen, 8);
  assert.equal(truths[0].wikiRate, "25%");
  assert.equal(truths[0].item, "Bone Chips", "the wiki's spelling is the canonical one");
  assert.equal(truths[0].suspicious, false);
});

test("a wiki claim we've never seen is 'unseen', and only suspicious with evidence", () => {
  const [thin] = reconcileDrops({ "Fabled Sword": "1%" }, {}, 3);
  assert.equal(thin.verdict, "unseen");
  assert.equal(thin.suspicious, false, "three kills prove nothing");

  const [solid] = reconcileDrops({ "Fabled Sword": "1%" }, {}, SUSPICIOUS_AFTER_KILLS);
  assert.equal(solid.verdict, "unseen");
  assert.equal(solid.suspicious, true);
});

test("observed drops sort ahead of the wiki's unconfirmed claims", () => {
  const truths = reconcileDrops(
    { Claimed: "50%", Seen: "5%" },
    { Seen: 3, Extra: 1 },
    20,
  );
  assert.deepEqual(
    truths.map((t) => t.item),
    ["Seen", "Extra", "Claimed"],
  );
});

test("the wiki leads until the sample is big enough, then observation takes over", () => {
  const [thin] = reconcileDrops({ "Bone Chips": "20%" }, { "Bone Chips": 1 }, 2);
  assert.equal(bestRate(thin).source, "wiki", "two kills shouldn't overrule the wiki");
  assert.equal(bestRate(thin).text, "20%");

  const [solid] = reconcileDrops({ "Bone Chips": "20%" }, { "Bone Chips": 15 }, TRUST_OBSERVED_AFTER_KILLS * 2);
  assert.equal(bestRate(solid).source, "observed");
  assert.equal(bestRate(solid).text, "50%"); // 15 of 30
});

test("with no wiki figure, even a thin observation is better than nothing", () => {
  const [truth] = reconcileDrops({}, { "Odd Bauble": 1 }, 4);
  assert.equal(bestRate(truth).source, "observed");
  assert.equal(bestRate(truth).text, "25%");
});

test("a small rate keeps a decimal, so 4.7% doesn't collapse to 5%", () => {
  const [truth] = reconcileDrops({}, { Rare: 3 }, 100);
  assert.equal(bestRate(truth).text, "3.0%");
});

test("nothing known from either side reads as nothing, not as zero", () => {
  const [truth] = reconcileDrops({ Mystery: undefined }, {}, 0);
  assert.equal(bestRate(truth).source, "none");
  assert.equal(bestRate(truth).text, "—");
  assert.equal(truth.observedRate, undefined);
});
