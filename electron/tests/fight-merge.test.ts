/**
 * Black-box tests for pooling two provably-overlapping fights into one (`fight-merge.ts`, ADR 0276).
 *
 * The property that matters most: a hit or heal two sources both report is counted **once**, not
 * twice, while one only one side saw is added in rather than dropped — the whole reason a merge is
 * more complete than either log alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeFight, type MergeSource } from "../fight-merge";
import type { FightHeal, FightHit } from "../../src/shared/types";

const T0 = Date.parse("2026-09-03T18:00:00.000Z");
const at = (offsetSec: number): string => new Date(T0 + offsetSec * 1000).toISOString();

function hit(over: Partial<FightHit>): FightHit {
  return { attacker: "Kainos", target: "a gnoll", amount: 10, melee: true, at: at(0), ...over };
}
function heal(over: Partial<FightHeal>): FightHeal {
  return { healer: "Kainos", target: "Kainos`s warder", amount: 10, at: at(0), ...over };
}

test("a hit both sides saw counts once; a hit only one side saw is added in", () => {
  const mine: MergeSource = {
    name: "Kainos",
    hits: [hit({ amount: 20, at: at(0) }), hit({ amount: 15, at: at(2) })],
    heals: [],
  };
  const bran: MergeSource = {
    name: "Bran",
    hits: [
      hit({ attacker: "Bran", amount: 30, at: at(-1) }), // Kainos never saw this one at all
      hit({ amount: 20, at: at(0) }), // the same swing Kainos also saw
      hit({ amount: 15, at: at(2) }), // ditto
      hit({ attacker: "Bran", amount: 25, at: at(3) }),
    ],
    heals: [],
  };

  const merged = mergeFight(mine, [bran]);
  const kainos = merged.byCombatant.find((c) => c.name === "Kainos")!;
  const branRow = merged.byCombatant.find((c) => c.name === "Bran")!;
  const gnoll = merged.byCombatant.find((c) => c.name === "a gnoll")!;

  assert.equal(kainos.dealt, 35); // 20 + 15, not doubled by Bran's copy of the same two swings
  assert.equal(branRow.dealt, 55); // 30 + 25 — including the swing only Bran ever saw
  assert.equal(gnoll.taken, 90);
  assert.equal(merged.totalDealt, 90);
  // "Yours" stays yours — a party-mate's damage never inflates it, merged or not.
  assert.equal(merged.yourDealt, 35);
});

test("a matching amount far apart in time is a different swing, not a duplicate", () => {
  const mine: MergeSource = { name: "Kainos", hits: [hit({ amount: 20, at: at(0) })], heals: [] };
  const bran: MergeSource = { name: "Bran", hits: [hit({ amount: 20, at: at(30) })], heals: [] };
  const merged = mergeFight(mine, [bran]);
  assert.equal(merged.totalDealt, 40); // both kept — 30s apart is not "the same logged moment"
});

test("healing pools the same way damage does", () => {
  const mine: MergeSource = {
    name: "Kainos",
    hits: [hit({ amount: 5, at: at(0) })], // needs at least some damage or there's no fight at all
    heals: [heal({ amount: 8, at: at(1) })],
  };
  const cleric: MergeSource = {
    name: "Bran",
    hits: [],
    heals: [
      heal({ amount: 8, at: at(1) }), // Kainos's own heal, also seen by Bran
      heal({ healer: "Bran", target: "Kainos", amount: 40, at: at(2) }), // Bran healing Kainos
    ],
  };
  const merged = mergeFight(mine, [cleric]);
  assert.equal(merged.totalHealed, 48); // 8 (once) + 40
  assert.equal(merged.yourHealed, 8); // only Kainos's own heal counts as "yours"
  // "Yours" is you *and your pet* — Bran's 40 landed on Kainos, and Kainos's own 8 landed on his
  // pet, and both are "received by yours" the same way `yourTaken` already counts pet damage.
  assert.equal(merged.yourHealReceived, 48);
});

test("a peer contributes even a mob's own attack on them, admitted as party rather than a stranger", () => {
  // Proves `recordParty` is actually seeding the replay: without it, `fight-scope.ts` would treat
  // Bran as an unrelated stranger and refuse his exchange with the gnoll entirely (ADR 0067).
  const mine: MergeSource = { name: "Kainos", hits: [hit({ amount: 20, at: at(0) })], heals: [] };
  const bran: MergeSource = {
    name: "Bran",
    hits: [hit({ attacker: "a gnoll", target: "Bran", amount: 12, at: at(1) })],
    heals: [],
  };
  const merged = mergeFight(mine, [bran]);
  const gnoll = merged.byCombatant.find((c) => c.name === "a gnoll")!;
  assert.equal(gnoll.dealt, 12);
  const branRow = merged.byCombatant.find((c) => c.name === "Bran")!;
  assert.equal(branRow.taken, 12);
});
