/**
 * Black-box tests for heal cells and their roll-up — `heal-tree.ts`'s share of ADR 0053's
 * guarantee: **every level sums to the one above it**, asserted structurally (`sumsUp`) rather
 * than on one hand-picked total, the same discipline `damage-tree.test.ts` holds itself to.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHealCells, healDrillDown, rollUpHeals, sumHealed } from "../../src/shared/heal-tree";
import { parseCombat } from "../../src/shared/combat-parser";
import { splitLine } from "../../src/shared/log-parser";
import type { HealEvent, HealNode } from "../../src/shared/types";

/** Parse a line the way the watcher would, and insist it's a heal. */
function heal(message: string): HealEvent {
  const event = parseCombat(splitLine(`[Wed Jul 29 00:00:01 2026] ${message}`, 1)!);
  assert.ok(event && event.kind === "heal", `expected a heal: ${message}`);
  return event as HealEvent;
}

/** Cells from a handful of log lines. */
function cellsFrom(lines: string[]) {
  const acc = createHealCells();
  for (const line of lines) acc.record(heal(line));
  return acc.cells();
}

/** Assert each node's amount equals the sum of its children's, all the way down. */
function sumsUp(nodes: HealNode[], parentAmount: number, path = "root"): void {
  assert.equal(
    nodes.reduce((n, x) => n + x.amount, 0),
    parentAmount,
    `${path}: levels must sum to the level above`,
  );
  for (const node of nodes) {
    if (node.children.length) sumsUp(node.children, node.amount, `${path} > ${node.label}`);
  }
}

const HEALING = [
  "You healed Kainos`s warder for 8 hit points.",
  "You healed Kainos`s warder for 8 hit points. (Critical)",
  "You healed Kainos`s warder for 1 (20) hit points by Inner Fire.",
  "Hullshamancer healed himself for 10 hit points by Lifespike.",
  "You healed Kainos for 6 hit points.",
];

test("heals on the same (healer, target, spell) are one cell", () => {
  const cells = cellsFrom(HEALING);
  const plain = cells.find((c) => c.healer === "You" && c.target === "Kainos`s warder" && c.spell === "Unknown")!;
  assert.deepEqual(
    { amount: plain.amount, hits: plain.hits, crits: plain.crits, maxHit: plain.maxHit },
    { amount: 16, hits: 2, crits: 1, maxHit: 8 },
  );
  // Named separately from the un-named heals above, even on the same healer and target.
  const named = cells.find((c) => c.healer === "You" && c.target === "Kainos`s warder" && c.spell === "Inner Fire")!;
  assert.equal(named.amount, 1);
  // Overheal is the attempted amount minus what actually landed.
  assert.equal(named.overhealed, 19);
});

test("a self-heal is its own (healer === target) cell, same as any other", () => {
  const cells = cellsFrom(HEALING);
  const self = cells.find((c) => c.healer === "Hullshamancer" && c.target === "Hullshamancer")!;
  assert.equal(self.spell, "Lifespike");
  assert.equal(self.amount, 10);
});

test("every level of the roll-up sums to the one above it", () => {
  const cells = cellsFrom(HEALING);
  const total = sumHealed(cells);
  const byTarget = rollUpHeals(cells, ["target", "spell"]);
  sumsUp(byTarget, total);
  const bySpell = rollUpHeals(cells, ["spell", "target"]);
  sumsUp(bySpell, total);
});

test("drilling into one healer sees only their own cells", () => {
  const cells = cellsFrom(HEALING);
  const yours = healDrillDown(cells, "healer", "You", ["target", "spell"]);
  // "You" never healed yourself in this fixture, and Hullshamancer's self-heal is a different healer.
  assert.equal(
    yours.reduce((n, t) => n + t.amount, 0),
    16 + 1 + 6, // Kainos`s warder (plain + Inner Fire) + Kainos
  );
  sumsUp(yours, yours.reduce((n, t) => n + t.amount, 0));
});

test("mine is flagged the same way a damage node flags it", () => {
  const cells = cellsFrom(HEALING);
  const byTarget = rollUpHeals(cells, ["target"], (name) => name === "Kainos`s warder");
  const warder = byTarget.find((t) => t.label === "Kainos`s warder")!;
  const kainos = byTarget.find((t) => t.label === "Kainos")!;
  assert.equal(warder.mine, true);
  assert.equal(kainos.mine, false);
  // Only combatant levels carry it — a spell name is neither yours nor anyone's.
  const bySpell = rollUpHeals(cells, ["spell"], (name) => name === "Kainos`s warder");
  assert.equal(bySpell[0].mine, undefined);
});
