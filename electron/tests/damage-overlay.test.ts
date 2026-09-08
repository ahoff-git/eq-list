/**
 * Black-box tests for shaping a fight into the floating meter's rows (`damage-overlay.ts`).
 * Built off a real tracker fed real log lines, like `combat-stats.test.ts` and
 * `damage-tree.test.ts` — a `FightStats` this module could actually be handed, not a fixture
 * that claims a shape the log never produces.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCombatStats } from "../combat-stats";
import { overlayDealers } from "../../src/shared/damage-overlay";
import { parseCombat } from "../../src/shared/combat-parser";
import { parseParty, splitLine } from "../../src/shared/log-parser";
import type { CombatEvent } from "../../src/shared/types";

/** Feed lines as if they were tailed from a log. */
function feed(tracker: ReturnType<typeof createCombatStats>, lines: string[]): void {
  for (const message of lines) {
    const event = parseCombat(splitLine(`[Wed Jul 29 00:00:01 2026] ${message}`, 1)!) as CombatEvent;
    assert.ok(event, `expected to parse: ${message}`);
    tracker.record(event);
  }
}

/** Register a group-mate the way the log would announce one joining. */
function join(tracker: ReturnType<typeof createCombatStats>, name: string): void {
  tracker.recordParty(parseParty(splitLine(`[Wed Jul 29 00:00:01 2026] ${name} has joined the group.`, 1)!)!);
}

const tracker = () => createCombatStats(() => "2026-07-29T00:00:00.000Z");

test("friendly dealers rank by damage, and the enemy is left off the board", () => {
  const t = tracker();
  t.setPlayer("You");
  join(t, "Galactic");
  feed(t, [
    "You slash a coyote for 10 points of damage.",
    "Galactic slashes a coyote for 40 points of damage.",
    "A coyote bites YOU for 7 points of damage.",
  ]);
  const dealers = overlayDealers(t.snapshot().fight);
  assert.deepEqual(
    dealers.map((d) => d.name),
    ["Galactic", "You"],
  );
  assert.equal(dealers[0].dealt, 40);
  assert.equal(dealers[1].dealt, 10);
  assert.equal(dealers[1].mine, true);
  assert.equal(dealers[0].mine, false);
});

test("a dealer's category bar splits melee from spell, and sums to their total", () => {
  const t = tracker();
  feed(t, [
    "You slash a coyote for 10 points of damage.",
    "You hit a coyote for 30 points of cold damage by Blast of Cold.",
  ]);
  const you = overlayDealers(t.snapshot().fight).find((d) => d.name === "You")!;
  assert.equal(you.dealt, 40);
  const byLabel = Object.fromEntries(you.categories.map((c) => [c.label, c]));
  assert.equal(byLabel.Melee.damage, 10);
  assert.equal(byLabel.Spell.damage, 30);
  assert.equal(
    you.categories.reduce((n, c) => n + c.damage, 0),
    you.dealt,
  );
  assert.ok(Math.abs(you.categories.reduce((n, c) => n + c.share, 0) - 1) < 1e-9);
  // Biggest first.
  assert.equal(you.categories[0].label, "Spell");
});

test("the source bar splits by the individual skill or spell, and sums to the same total", () => {
  const t = tracker();
  feed(t, [
    "You slash a coyote for 10 points of damage.",
    "You pierce a coyote for 5 points of damage.",
    "You hit a coyote for 30 points of cold damage by Blast of Cold.",
  ]);
  const you = overlayDealers(t.snapshot().fight).find((d) => d.name === "You")!;
  const labels = you.sources.map((s) => s.label).sort();
  assert.deepEqual(labels, ["Blast of Cold", "Pierce", "Slash"]);
  assert.equal(
    you.sources.reduce((n, s) => n + s.damage, 0),
    you.dealt,
  );
});

test("rows past the cap are cut, biggest first", () => {
  const t = tracker();
  t.setPlayer("You");
  const names = ["Alice", "Bob", "Carol", "Dave", "Erin"];
  for (const name of names) join(t, name);
  feed(t, [
    "You slash a coyote for 5 points of damage.",
    ...names.map((name, i) => `${name} slashes a coyote for ${10 + i * 10} points of damage.`),
  ]);
  const dealers = overlayDealers(t.snapshot().fight, 3);
  assert.equal(dealers.length, 3);
  assert.deepEqual(
    dealers.map((d) => d.name),
    ["Erin", "Dave", "Carol"],
  );
});
