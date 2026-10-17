/**
 * Crafting success rates between peers (ADR 0303): what leaves (`shareableCraftRates`), what the wire
 * accepts (`SHARE_KINDS`' `crafting` reader), what the receiving store keeps (`sanitizeCraftRates`),
 * and how the room's rates add up (`poolCraftRates`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { shareKind } from "../../src/shared/peers/peer-share";
import { poolCraftRates, shareableCraftRates } from "../../src/shared/tradeskills/craft-rates";
import { sanitizeCraftRates } from "../peer-crafting";
import type { CraftingSummary } from "../../src/shared/tradeskills/crafting-log";

const ROW = { skill: "Blacksmithing", item: "Sheet Metal", level: 36, attempts: 16, ok: 10 };

test("what leaves is item × level counts, only where the log knows the skill", () => {
  const summary: CraftingSummary = {
    sittings: [],
    items: [
      { item: "Sheet Metal", skill: "Blacksmithing", attempts: 17, ok: 11, levels: [{ level: 36, attempts: 16, ok: 10 }, { level: 43, attempts: 1, ok: 1 }], unlevelled: { attempts: 0, ok: 0 }, lastAt: "2026-08-26T01:00:00" },
      { item: "Staff of the Wheel", attempts: 2, ok: 2, levels: [], unlevelled: { attempts: 2, ok: 2 }, lastAt: "2026-10-14T23:13:47" },
    ],
  };
  assert.deepEqual(shareableCraftRates(summary), [ROW, { ...ROW, level: 43, attempts: 1, ok: 1 }]);
});

test("the wire takes a possible rate and refuses an impossible one", () => {
  const spec = shareKind("crafting")!;
  assert.equal(spec.family, "observation");
  assert.deepEqual(spec.read([{ ...ROW, by: "Ayla", byId: "a1", extra: "dropped" }], () => "x"), [{ ...ROW, by: "Ayla", byId: "a1" }]);
  for (const bad of [
    { ...ROW, ok: 17 }, // more out than went in
    { ...ROW, attempts: 0, ok: 0 },
    { ...ROW, level: -1 },
    { ...ROW, item: "" },
    { ...ROW, attempts: 2.5 },
  ]) {
    assert.deepEqual(spec.read([bad], () => "x"), [], JSON.stringify(bad));
  }
});

test("two people's rates for the same item and level are different rows", () => {
  const spec = shareKind("crafting")!;
  assert.notEqual(spec.rowKey?.({ ...ROW, byId: "a1" }), spec.rowKey?.({ ...ROW, byId: "b2" }));
});

test("the receiving store vets again, and keeps no relay claim of its own making", () => {
  assert.deepEqual(sanitizeCraftRates([ROW, { ...ROW, ok: 99 }, { nonsense: true }], false), [ROW]);
});

test("the room adds counts up per item and level, and counts the people", () => {
  const pooled = poolCraftRates([
    { ...ROW, byId: "a1", by: "Ayla" },
    { ...ROW, attempts: 4, ok: 4, byId: "b2", by: "Bo" },
    { ...ROW, level: 37, attempts: 3, ok: 1, byId: "a1", by: "Ayla" },
  ]);
  assert.deepEqual(pooled, [
    { skill: "Blacksmithing", item: "Sheet Metal", level: 36, attempts: 20, ok: 14, people: 2 },
    { skill: "Blacksmithing", item: "Sheet Metal", level: 37, attempts: 3, ok: 1, people: 1 },
  ]);
});
