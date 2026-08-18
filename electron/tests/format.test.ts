/**
 * The display formatters the panels share.
 *
 * Worth pinning because of how they got here: `mins` existed in two components under **one name with two
 * different outputs** — one dropped the seconds, one kept them — so the same span read `5m` in one panel
 * and `5m 30s` in another. Both readings were wanted; having them share a name was the bug. The option
 * is now explicit, and these tests are what stop it collapsing back into one behaviour.
 *
 * Times go through the browser's locale formatting, so the assertions are about *structure* (does it
 * carry seconds, does a bad value read as a gap) rather than exact wording, which is the user's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { clock, count, countOf, dayTime, duration, figure, locText, percent, when } from "../../src/shared/format";

test("a duration says minutes, and seconds only when asked", () => {
  // The distinction the two copies disagreed about.
  assert.equal(duration(330), "5m");
  assert.equal(duration(330, { seconds: true }), "5m 30s");
  assert.equal(duration(300, { seconds: true }), "5m 0s", "an exact minute still shows its zero");
});

test("under a minute is always seconds, because \"0m\" says nothing", () => {
  assert.equal(duration(45), "45s");
  assert.equal(duration(45, { seconds: true }), "45s");
  assert.equal(duration(0), "0s");
  assert.equal(duration(59, { seconds: true }), "59s");
  assert.equal(duration(60), "1m", "and a whole minute crosses over");
});

test("a clock carries seconds only when asked", () => {
  const iso = "2026-08-11T16:12:30.000Z";
  const plain = clock(iso);
  const precise = clock(iso, { seconds: true });
  // Locale wording is the browser's; what's ours is how many parts there are.
  assert.equal(plain.match(/\d+/g)?.length, 2, `expected hour+minute, got ${plain}`);
  assert.equal(precise.match(/\d+/g)?.length, 3, `expected hour+minute+second, got ${precise}`);
  assert.ok(precise.startsWith(plain.split(/\s/)[0]), "the same time, more precisely");
});

test("a timestamp that isn't one reads as a gap — in every shape, not just some", () => {
  // This is why they share a guarded core. Four tooltips called `new Date(iso).toLocaleString()` raw,
  // which renders the literal words "Invalid Date" — so one bad stored timestamp read as "—" in a list
  // and "Invalid Date" in the tooltip beside it.
  for (const bad of ["", "not a date", "2026-13-45T99:99:99Z"]) {
    const shown = [clock(bad), clock(bad, { seconds: true }), dayTime(bad), when(bad)];
    assert.deepEqual(shown, ["—", "—", "—", "—"], `${JSON.stringify(bad)} should read as a gap everywhere`);
    assert.ok(!shown.join(" ").includes("Invalid"), "and never as the words \"Invalid Date\"");
  }
});

test("the date shapes differ in what they show, not in whether they're safe", () => {
  const iso = "2026-08-11T16:12:30.000Z";
  // `dayTime` adds the day a `clock` leaves out; `when` is the locale's full stamp. Exact wording is the
  // browser's, so what's asserted is that each says strictly more than the last.
  assert.ok(dayTime(iso).length > clock(iso).length, "a day and a time beats a time");
  assert.ok(when(iso).length >= dayTime(iso).length);
});

test("a tally of nothing reads as nothing, and a real one reads with separators", () => {
  // Zero and absence are the same thing in a damage column, and a column of 0s reads as measurements.
  assert.equal(figure(0), "—");
  assert.equal(figure(undefined), "—");
  assert.equal(figure(null), "—");
  assert.equal(figure(12345), (12345).toLocaleString());
  assert.notEqual(figure(1), "—", "one is a real number");
});

test("a tally pluralizes its noun, and only one of anything is singular", () => {
  assert.equal(count(1, "kill"), "1 kill");
  assert.equal(count(3, "kill"), "3 kills");
  // The case a hand-written `n === 1 ? "" : "s"` gets right by accident and a `n > 1` gets wrong.
  assert.equal(count(0, "kill"), "0 kills");
  // Irregular wording is the caller's to give, so the helper never has to know any English.
  assert.equal(count(1, "mob is", "mobs are"), "1 mob is");
  assert.equal(count(4, "mob is", "mobs are"), "4 mobs are");
});

test("\"of\" appears only when a filter is actually hiding something", () => {
  assert.equal(countOf(340, 340, "drop"), "340 drops", "nothing hidden, so nothing to compare against");
  assert.equal(countOf(12, 340, "drop"), "12 of 340 drops");
  assert.equal(countOf(0, 340, "drop"), "0 of 340 drops", "filtered down to nothing still says what of");
  assert.equal(countOf(1, 1, "drop"), "1 drop");
});

test("a percentage takes the fraction, and 0% is a reading rather than a gap", () => {
  assert.equal(percent(0.372), "37%");
  assert.equal(percent(0.372, { places: 1 }), "37.2%");
  assert.equal(percent(1), "100%");
  // Unlike a tally, a measured nothing is real: 0% of the damage is a fact about the fight.
  assert.equal(percent(0), "0%");
});

test("a percentage of nothing is a gap, not NaN%", () => {
  // What an unguarded division used to put on screen. `over` returns undefined for exactly this case.
  for (const nothing of [undefined, null, NaN, Infinity]) {
    assert.equal(percent(nothing), "—", String(nothing));
  }
});

// Every coordinate the app shows is an estimate — a roam centre averaged from kills — and it is read
// straight into the game, so the order (y first, as EQ prints it) and the rounding are both load-bearing.
test("a position reads y first and rounded, ready to type into the game", () => {
  assert.equal(locText({ y: 1234.4, x: -567.6 }), "1234, -568");
  assert.equal(locText({ y: 0, x: 0 }), "0, 0", "the origin is a place like any other");
  assert.equal(locText({ y: -0.4, x: 12 }), "0, 12", "no negative zero on screen");
});
