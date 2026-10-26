/**
 * Which pack a route is asked over (`travelPack`, ADR 0340): the drawn one if it can teleport, else
 * the installed pack that reaches most — ports first, borders second.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { travelPack, type TravelReach } from "../../src/shared/travel/reach";

const pack = (source: string, druid: number, wizard: number, borders = 100): { source: string; reach: TravelReach } => ({
  source,
  reach: { borders, druid, wizard },
});

test("a drawn pack that can teleport is kept, even beside a richer one", () => {
  assert.equal(travelPack(pack("mine", 2, 0), [pack("brewall", 14, 10)]), "mine");
});

test("a drawn pack with no ports borrows the pack with the most, borders breaking a tie", () => {
  assert.equal(travelPack(pack("stock", 0, 0), [pack("thin", 3, 0), pack("brewall", 14, 10)]), "brewall");
  assert.equal(travelPack(pack("stock", 0, 0), [pack("a", 5, 5, 100), pack("b", 5, 5, 150)]), "b");
});

test("with nothing that can teleport, the drawn pack stands", () => {
  assert.equal(travelPack(pack("stock", 0, 0, 90), [pack("bare", 0, 0, 300)]), "stock");
  assert.equal(travelPack(pack("stock", 0, 0), []), "stock");
});
