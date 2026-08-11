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
import { clock, dayTime, duration, figure, when } from "../../src/shared/format";

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
