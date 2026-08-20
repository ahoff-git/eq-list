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

// Every grade of an item is the same drop with a second roll on it, and the wiki only ever lists
// the base item. Matching the log's wording literally reported the game dropping something no
// reference knows *and* the wiki's item never dropping — the same false pair a stray capital used
// to produce, and the reason ADR 0025's example read as a discovery.
test("an item's grade is not a separate drop, and grades pool into one rate", () => {
  const truths = reconcileDrops(
    { "Crushbone Belt": "10%" },
    { "Crushbone Belt +2": 3, "Crushbone Belt +5": 1 },
    40,
  );
  assert.equal(truths.length, 1);
  assert.equal(truths[0].verdict, "confirmed");
  assert.equal(truths[0].seen, 4, "both grades count towards the one drop");
  assert.equal(truths[0].item, "Crushbone Belt");
  assert.equal(truths[0].observedRate, 0.1);
});

test("a graded drop the wiki has never heard of is named by its base item", () => {
  // Still a discovery — but the row describes every grade of it, so it can't be labelled with one.
  const [truth] = reconcileDrops({}, { "Minotaur Battle Axe +1": 1, "Minotaur Battle Axe +3": 1 }, 8);
  assert.equal(truth.verdict, "undocumented");
  assert.equal(truth.item, "Minotaur Battle Axe");
  assert.equal(truth.seen, 2);
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

test("the shown rate carries its own number, so ordering can't disagree with the badge", () => {
  // The wiki's figure is a string on the page; the number beside it is the same claim, parsed.
  const [thin] = reconcileDrops({ "Bone Chips": "20%" }, { "Bone Chips": 1 }, 2);
  assert.equal(bestRate(thin).value, 0.2);
  // Once observation leads, the number is the observation's — not the wiki's, which is what a
  // sort that re-derived the rate for itself would get wrong.
  const [solid] = reconcileDrops({ "Bone Chips": "20%" }, { "Bone Chips": 15 }, TRUST_OBSERVED_AFTER_KILLS * 2);
  assert.equal(bestRate(solid).value, 0.5);
  // A decimal in the wiki's wording survives; a rarity word carries no number at all.
  const [decimal] = reconcileDrops({ Rare: "4.7%" }, {}, 0);
  assert.equal(bestRate(decimal).value, 0.047);
  const [worded] = reconcileDrops({ Mystery: "Always" }, {}, 0);
  assert.equal(bestRate(worded).value, undefined);
  // Nothing known from either side has no number to sort on — which is not the same as zero.
  const [nothing] = reconcileDrops({ Mystery: undefined }, {}, 0);
  assert.equal(bestRate(nothing).value, undefined);
});
