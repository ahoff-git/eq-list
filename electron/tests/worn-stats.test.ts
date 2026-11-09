/**
 * Black-box tests for what a dump's worn gear adds up to (`src/shared/items/worn-stats.ts`) — the one reader the
 * Items tab and "plan as a peer" share. Only need re-running if that module or `loadout-stats.ts` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { wornStats } from "../../src/shared/items/worn-stats";
import type { InventoryItem } from "../../src/shared/game-export-dumps";

/** A catalogue row as the code under test reads it: a title, and the card's stats (sparse, with the rest of the card empty). */
const row = (title: string, stats: Record<string, number>) => ({ item: { title }, stats: { stats, slots: [], classes: [], races: [], flags: [] } }) as never;
const piece = (baseName: string, area: string, grade = 0) => ({ baseName, area, grade }) as unknown as InventoryItem;

test("the worn pieces' stats are summed; what isn't worn doesn't count", () => {
  const rows = [row("Silken Robe", { hp: 100, int: 10 }), row("Jade Ring", { hp: 20, int: 5 }), row("Spare Cloak", { hp: 999 })];
  const worn = wornStats([piece("Silken Robe", "worn"), piece("Jade Ring", "worn"), piece("Spare Cloak", "bags")], rows);
  assert.equal(worn.hp, 120);
  assert.equal(worn.int, 15);
});

test("a worn piece the catalogue has no page for counts for nothing, and no gear is no stats", () => {
  assert.deepEqual(wornStats([piece("Mystery Hat", "worn")], [row("Silken Robe", { hp: 100 })]), {});
  assert.deepEqual(wornStats([], []), {});
});

test("a piece is found by its name as the catalogue writes it, however the dump spells the case", () => {
  assert.equal(wornStats([piece("silken robe", "worn")], [row("Silken Robe", { hp: 100 })]).hp, 100);
});
