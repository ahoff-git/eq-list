/**
 * Black-box tests for the unmatched-line tally — the parser's calibration loop.
 *
 * The two rules worth pinning are the ones that decide whether the list is useful or noise:
 * a line somebody *said* is counted and discarded rather than kept, and a line the game wrote
 * has its numbers folded so one wording is one row. Only needs re-running if
 * `unmatched-lines.ts` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createUnmatchedLines, isIgnored, lineShape } from "../../src/shared/unmatched-lines";

test("numbers fold so one wording is one row", () => {
  assert.equal(lineShape("You have taken 12 damage."), "You have taken # damage.");
  assert.equal(
    lineShape("A coyote hits YOU for 5 points of damage."),
    "A coyote hits YOU for # points of damage.",
  );
  // The same sentence with different amounts is the same shape — the whole point.
  assert.equal(lineShape("You gain 3 skill."), lineShape("You gain 41 skill."));
});

test("chat is ignored, in every form the client writes it", () => {
  assert.ok(isIgnored("Bunnyslayer tells you, 'inc'"));
  assert.ok(isIgnored("You tell Bunnyslayer, 'omw'"));
  assert.ok(isIgnored("Bunnyslayer tells the group, 'pull'"));
  assert.ok(isIgnored("Bunnyslayer says, 'hello'"));
  assert.ok(isIgnored("You tell mychannel:1, 'find batwing'"));
  assert.ok(isIgnored("Bunnyslayer waves."));
  // A line the game wrote about the world is not chat, and must survive to be counted.
  assert.equal(isIgnored("A coyote staggers and falls."), false);
  assert.equal(isIgnored("You feel a sudden chill."), false);
});

test("a said line is counted but its words are never kept", () => {
  const u = createUnmatchedLines();
  u.note("Bunnyslayer tells you, 'my password is hunter2'");
  const { seen, ignored, shapes } = u.stats();
  assert.equal(seen, 1);
  assert.equal(ignored, 1);
  assert.equal(shapes, 0, "nothing anyone typed should be retained");
  assert.deepEqual(u.top(), []);
});

test("repeats of one shape become one row with a count", () => {
  const u = createUnmatchedLines();
  u.note("You have taken 12 damage.");
  u.note("You have taken 40 damage.");
  u.note("You have taken 7 damage.");
  u.note("You feel a sudden chill.");

  assert.deepEqual(u.top(), [
    { shape: "You have taken # damage.", count: 3 },
    { shape: "You feel a sudden chill.", count: 1 },
  ]);
  assert.equal(u.stats().shapes, 2);
});

test("the commonest come first, and the list can be capped", () => {
  const u = createUnmatchedLines();
  u.note("rare line");
  for (let i = 0; i < 5; i++) u.note("common line");
  assert.deepEqual(u.top(1), [{ shape: "common line", count: 5 }]);
});

test("a full table stops taking new shapes and says how many it turned away", () => {
  const u = createUnmatchedLines(2);
  u.note("first");
  u.note("second");
  u.note("third");
  u.note("fourth");
  // The two it already holds keep counting; the newcomers are tallied as dropped.
  u.note("first");

  const { shapes, dropped } = u.stats();
  assert.equal(shapes, 2);
  assert.equal(dropped, 2);
  assert.deepEqual(u.top(), [
    { shape: "first", count: 2 },
    { shape: "second", count: 1 },
  ]);
});

test("blank lines are not a shape", () => {
  const u = createUnmatchedLines();
  u.note("");
  u.note("   ");
  assert.deepEqual(u.stats(), { seen: 0, ignored: 0, shapes: 0, dropped: 0 });
});

test("clearing resets the counts as well as the shapes", () => {
  const u = createUnmatchedLines();
  u.note("You feel a sudden chill.");
  u.note("Bunnyslayer says, 'hi'");
  u.clear();
  assert.deepEqual(u.stats(), { seen: 0, ignored: 0, shapes: 0, dropped: 0 });
  assert.deepEqual(u.top(), []);
});
