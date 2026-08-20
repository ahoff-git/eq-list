/**
 * Black-box tests for mob levels ([src/shared/levels.ts](../../src/shared/levels.ts)) and the
 * containment bound they run on ([src/shared/estimates.ts](../../src/shared/estimates.ts)).
 *
 * The interesting property is the one that inverts everything else in `estimates.ts`: a mob is a
 * *range*, so evidence widens its bounds instead of tightening them. These pin that it widens, that
 * it only ever widens, and that a bad reading can't widen it — because a containment can no more
 * recover from a bad value than a constraint can.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tighten, widen } from "../../src/shared/estimates";
import { levelText, levelWhy, levelsAgree, mergeLevels, observeLevel, parseLevelClaim } from "../../src/shared/levels";

test("widen is tighten's mirror, and the direction is the whole difference", () => {
  // A constraint closes in on one true value…
  assert.equal(tighten(640, 700, "lower"), 700);
  assert.equal(tighten(780, 700, "upper"), 700);
  // …a containment opens out to cover every value seen.
  assert.equal(widen(12, 9, "lower"), 9);
  assert.equal(widen(12, 17, "upper"), 17);
  // Neither moves the wrong way on an observation it already covers.
  assert.equal(widen(9, 12, "lower"), 9);
  assert.equal(widen(17, 12, "upper"), 17);
  // Nothing known yet: the first observation is simply taken, either way round.
  assert.equal(widen(undefined, 12, "lower"), 12);
  assert.equal(widen(undefined, 12, "upper"), 12);
});

test("a mob's range covers every level it has been seen at", () => {
  let range = observeLevel(undefined, 12);
  range = observeLevel(range, 17);
  range = observeLevel(range, 14);
  assert.deepEqual(range, { low: 12, high: 17, samples: 3 });
  assert.equal(levelText(range!), "12–17");
});

test("one sighting is a level, not a range, and says so", () => {
  const range = observeLevel(undefined, 12)!;
  assert.equal(levelText(range), "12");
  // The hedge belongs in the wording: a single consider says nothing at all about the spread.
  assert.match(levelWhy(range), /once/);
  assert.match(levelWhy({ low: 12, high: 12, samples: 9 }), /9 times/);
  assert.match(levelWhy({ low: 12, high: 17, samples: 9 }), /between levels 12 and 17/);
});

test("an impossible level is discarded, never folded in", () => {
  const range = observeLevel(undefined, 12);
  // Clamping would be worse than dropping: against a bound that only widens, a clamped value is a
  // wrong answer nobody can take back.
  assert.deepEqual(observeLevel(range, 0), range);
  assert.deepEqual(observeLevel(range, -4), range);
  assert.deepEqual(observeLevel(range, 9_999), range);
  assert.deepEqual(observeLevel(range, Number.NaN), range);
  // …and the sample count doesn't move either, so nothing gets credit for a reading we refused.
  assert.equal(observeLevel(range, 0)?.samples, 1);
  assert.equal(observeLevel(undefined, 0), undefined);
});

test("pooling two observers' ranges covers both, and adds their samples", () => {
  const mine = { low: 12, high: 14, samples: 3 };
  const theirs = { low: 13, high: 17, samples: 20 };
  assert.deepEqual(mergeLevels(mine, theirs), { low: 12, high: 17, samples: 23 });
  // Nothing from one side is still everything from the other.
  assert.deepEqual(mergeLevels(undefined, theirs), theirs);
  assert.deepEqual(mergeLevels(mine, undefined), mine);
  assert.equal(mergeLevels(undefined, undefined), undefined);
});

test("the wiki's three ways of writing a level all read the same", () => {
  // Every one of these is on a real page in the fixtures.
  assert.deepEqual(parseLevelClaim("Level: 33-37"), { low: 33, high: 37 });
  assert.deepEqual(parseLevelClaim("Level: 9 - 11"), { low: 9, high: 11 });
  assert.deepEqual(parseLevelClaim("Level: 30"), { low: 30, high: 30 });
  assert.deepEqual(parseLevelClaim("Level: 33–37"), { low: 33, high: 37 }); // en dash
  // A card is a list of "Label: value" rows, so the label has to be found rather than assumed.
  assert.deepEqual(parseLevelClaim("Race: Gnoll Level: 12-15 Class: Warrior"), { low: 12, high: 15 });
  // Nothing claimed, or nothing believable claimed, is no claim — not a half-read one.
  assert.equal(parseLevelClaim("Race: Gnoll"), undefined);
  assert.equal(parseLevelClaim("Level: 0"), undefined);
  assert.equal(parseLevelClaim("Level: 12-999"), undefined);
  // "Minimum Level" on a quest page is a claim about the *player*, and the word before it is the
  // only thing distinguishing the two — so this deliberately still reads, and callers ask mob cards.
  assert.deepEqual(parseLevelClaim("Level: 3"), { low: 3, high: 3 });
});

test("agreement with the wiki is overlap, not equality", () => {
  // Our range is built from however many considers were typed, so it is nearly always narrower than
  // the truth. Demanding a match would flag every mob nobody has conned forty times.
  assert.ok(levelsAgree({ low: 34, high: 35, samples: 4 }, { low: 33, high: 37 }));
  assert.ok(levelsAgree({ low: 30, high: 40, samples: 90 }, { low: 33, high: 37 }));
  assert.ok(levelsAgree({ low: 37, high: 40, samples: 9 }, { low: 33, high: 37 })); // touching counts
  // Not touching at all is the case worth reporting: two claims about different mobs, patches or
  // difficulty tiers.
  assert.equal(levelsAgree({ low: 12, high: 14, samples: 9 }, { low: 33, high: 37 }), false);
});
