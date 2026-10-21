/**
 * A guide section's cost to finish (`section-cost.ts`) and where to buy its materials from where you
 * stand (`where-to-buy.ts`) — ADR 0304 — plus a look at the committed merchant data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { costedStep, sectionCost, type CostedStep } from "../../src/shared/tradeskills/section-cost";
import { whereToBuy } from "../../src/shared/tradeskills/where-to-buy";
import { VENDORS } from "../../src/shared/tradeskills/tradeskills.generated";
import { ZONE_EXPANSIONS, outOfEraSet } from "../../src/shared/zones/expansions";
import type { VendorSpot } from "../../src/shared/tradeskills/tradeskill-types";

const step = (from: number, to: number, perCombine: number | undefined, extra: Partial<CostedStep> = {}): CostedStep => ({
  span: { from, to },
  perCombine,
  fixed: 0,
  unpriced: [],
  ...extra,
});

// ─── Cost to finish ─────────────────────────────────────────────────────────────────────────────

test("steps in a row add up: one combine a point at least, the ceiling rate at most", () => {
  const total = sectionCost([step(0, 10, 100), step(10, 20, 200)])!;
  assert.deepEqual(total.cost, { low: 10 * 100 + 10 * 200, high: Math.round(10 * 100 * 2.5 + 10 * 200 * 2.5) });
  assert.deepEqual(total.combines, { low: 20, high: 50 });
  assert.equal(total.pricedPoints, 20);
});

test("alternatives over the same points cost what the cheaper one costs, not both", () => {
  // Brewing's shape: "1 to 31: Short Beer" and "1 to 151: Skull Ale" both cover 1–31.
  const total = sectionCost([step(1, 31, 500), step(1, 151, 300)])!;
  assert.equal(total.cost.low, 150 * 300, "Skull Ale is cheaper over every point it covers");
});

test("a chosen step's one-off purchases are bought once", () => {
  const total = sectionCost([step(0, 10, 100, { fixed: 5000 })])!;
  assert.equal(total.cost.low, 10 * 100 + 5000);
});

test("points only an unpriced step covers are counted and left out, never priced at zero", () => {
  const total = sectionCost([step(0, 10, 100), step(10, 30, undefined)])!;
  assert.deepEqual([total.pricedPoints, total.unpricedPoints, total.cost.low], [10, 20, 1000]);
});

test("your pace scales the ceiling", () => {
  assert.equal(sectionCost([step(0, 10, 100)], 2)!.cost.high, 10 * 100 * 5);
});

test("a step that is all one-off purchases costs nothing per combine, so its priced buys reach the total", () => {
  // Blacksmithing's "1 to 21: Metal Bits": Buy 3 File Mold, 53 Water Flask, 100 Small Piece of Ore.
  const needs = [
    { name: "File Mold", qty: 3, total: true },
    { name: "Small Piece of Ore", qty: 100, total: true },
  ];
  const prices = { "Small Piece of Ore": { copper: 172, source: "x" } };
  const costed = costedStep({ from: 1, to: 21 }, needs, undefined, prices);
  assert.deepEqual(costed, { span: { from: 1, to: 21 }, perCombine: 0, fixed: 17200, unpriced: ["File Mold"] });
  const total = sectionCost([costed])!;
  assert.deepEqual([total.cost.low, total.pricedPoints, total.unpriced], [17200, 20, ["File Mold"]]);
  // A step with per-combine materials and no price for any of them is still unpriced.
  assert.equal(costedStep({ from: 1, to: 21 }, [{ name: "Ore", qty: 1 }], undefined, prices).perCombine, undefined);
});

test("nothing ahead is no total", () => {
  assert.equal(sectionCost([]), undefined);
});

// ─── Where to buy ───────────────────────────────────────────────────────────────────────────────

const V: Record<string, VendorSpot[]> = {
  "Sheet Metal": [{ zone: "East Freeport", zonePage: "Freeport", merchant: "Issilyn Ristan", area: "Inside Armor by Ikthar", y: 72, x: -214 }],
  "File Mold": [
    { zone: "Ak'Anon", merchant: "a clockwork miner", y: 760, x: -155 },
    { zone: "Butcherblock Mountains", merchant: "Kaila Rucksack", y: 2795, x: -697 },
  ],
  "Water Flask": [
    { zone: "Ak'Anon", merchant: "Rylin Coil", y: 1469, x: -190 },
    { zone: "Firiona Vie", merchant: "Marlyn McMerin", y: -3813, x: 1669 },
  ],
};

test("what's sold where you stand comes first, with the merchant's spot", () => {
  const plan = whereToBuy(["Sheet Metal", "File Mold", "Bat Wing"], V, "East Freeport", new Set());
  assert.deepEqual(plan.here, [
    { item: "Sheet Metal", merchant: "Issilyn Ristan", zone: "East Freeport", area: "Inside Armor by Ikthar", loc: { y: 72, x: -214 } },
  ]);
  assert.deepEqual(plan.notSold, ["Bat Wing"]);
});

test("the rest goes to the zones selling the most of it", () => {
  const plan = whereToBuy(["File Mold", "Water Flask"], V, "Qeynos", new Set());
  assert.equal(plan.stops[0].zone, "Ak'Anon", "one stop sells both");
  assert.deepEqual(plan.stops[0].items.map((i) => i.item), ["File Mold", "Water Flask"]);
  assert.equal(plan.stops.length, 1);
});

test("a merchant in a shut zone is no merchant", () => {
  const kunark = outOfEraSet(ZONE_EXPANSIONS.find((e) => e.expansion === "The Ruins of Kunark")?.zones ?? []);
  const plan = whereToBuy(["Water Flask"], { "Water Flask": [V["Water Flask"][1]] }, "Firiona Vie", kunark);
  assert.deepEqual(plan.here, []);
  assert.deepEqual(plan.notSold, ["Water Flask"]);
});

test("what a fourth stop would sell isn't dropped — it's named as sold elsewhere", () => {
  const spot = (zone: string): VendorSpot[] => [{ zone, merchant: `${zone} merchant` }];
  const plan = whereToBuy(["A", "B", "C", "D"], { A: spot("Qeynos"), B: spot("Freeport"), C: spot("Halas"), D: spot("Rivervale") }, null, new Set());
  assert.equal(plan.stops.length, 3);
  const listed = [...plan.stops.flatMap((s) => s.items.map((i) => i.item)), ...plan.elsewhere, ...plan.notSold];
  assert.deepEqual(listed.sort(), ["A", "B", "C", "D"]);
  assert.deepEqual(plan.elsewhere, ["D"]);
});

test("no zone from the log still gives stops", () => {
  const plan = whereToBuy(["Sheet Metal"], V, null, new Set());
  assert.deepEqual([plan.here.length, plan.stops[0]?.zone], [0, "East Freeport"]);
});

test("the committed merchants say where they stand", () => {
  const flasks = VENDORS["Water Flask"] ?? [];
  assert.ok(flasks.length > 50, `only ${flasks.length} Water Flask merchants`);
  assert.ok(flasks.every((v) => v.zone && v.merchant), "a merchant row lost its zone or name");
  assert.ok(flasks.filter((v) => v.y !== undefined).length > flasks.length * 0.9, "most merchants should carry a location");
});
