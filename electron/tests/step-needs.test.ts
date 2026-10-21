/**
 * Black-box tests for reading a race-unlock step's counted materials (`src/shared/faction/step-needs.ts`)
 * and starting list entries at what you hold (`src/shared/items/held-seed.ts`). Only need re-running
 * if those files change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { stepCovered, stepMaterials, stepNeed } from "../../src/shared/faction/step-needs";
import { heldSeeds } from "../../src/shared/items/held-seed";
import { RACE_UNLOCKS } from "../../src/shared/faction/race-unlocks";
import { holdingsOf } from "../../src/shared/tradeskills/held-materials";
import type { ShoppingList, WikiPage } from "../../src/shared/types";

test("a number before a link is that many of the item", () => {
  assert.deepEqual(stepNeed("Give 800 [[Phosphorous Powder]] to [[Zok Zribb]] in [[Rathe Mountains]]"), {
    kind: "item",
    item: "Phosphorous Powder",
    qty: 800,
  });
  assert.deepEqual(stepNeed("Turn in the resulting 1,200 [[Lion Delight]] to [[Iceberg]]"), { kind: "item", item: "Lion Delight", qty: 1200 });
});

test("'N times' after the first link repeats it as a quest, and 'first step' marks it partial", () => {
  assert.deepEqual(stepNeed("Do [[Tumpy Tonics]] 400 times"), { kind: "quest", quest: "Tumpy Tonics", runs: 400, partial: false });
  assert.deepEqual(stepNeed("Do [[Message Intercept]] giving [[A Note]] to [[Sir Lucan D`Lere]] 42 times"), {
    kind: "quest",
    quest: "Message Intercept",
    runs: 42,
    partial: false,
  });
  assert.deepEqual(stepNeed("Do the first step of [[Hogcaller's Inn]] 400 times"), { kind: "quest", quest: "Hogcaller's Inn", runs: 400, partial: true });
  assert.deepEqual(stepNeed("Do the Oggok [[Muffin Quests|Fresh Baked Muffin Quest]] 400 times"), {
    kind: "quest",
    quest: "Muffin Quests",
    runs: 400,
    partial: false,
  });
});

test("a step with no count of a linked thing names nothing", () => {
  for (const s of ["Kill 400 Kobolds", "Kill 400 goblins in [[Runnyeye]]", "Trade [[Metal Bits]] to [[Crusader Iktra]] in [[North Ro]] until amiable", "Aid [[Feskr Drinkmaker]]"])
    assert.equal(stepNeed(s), undefined, s);
});

test("the shipped guide's Froglok step reads as 800 Phosphorous Powder", () => {
  const frog = RACE_UNLOCKS.find((r) => r.race === "Froglok")!;
  assert.deepEqual(frog.method.steps.map(stepNeed).find(Boolean), { kind: "item", item: "Phosphorous Powder", qty: 800 });
});

const page = (kind: WikiPage["kind"], components: { name: string; qty: number }[]) =>
  ({ kind, title: "Tumpy Tonics", wikiPath: "/Tumpy_Tonics", sources: [], components, rewards: [] }) as unknown as WikiPage;

test("a quest step needs its turn-ins times the runs, against what you and peers hold", () => {
  const need = stepNeed("Do [[Tumpy Tonics]] 400 times")!;
  const holdings = holdingsOf([{ baseName: "Kiola Nut", count: 412 }], [{ by: "Bob", item: "Water Flask", count: 20 }]);
  const mats = stepMaterials(need, page("quest", [{ name: "Kiola Nut", qty: 1 }, { name: "Water Flask", qty: 2 }]), holdings);
  assert.deepEqual(
    mats.map((m) => [m.name, m.qty, m.mine, m.peers]),
    [
      ["Kiola Nut", 400, 412, []],
      ["Water Flask", 800, 0, [{ by: "Bob", count: 20 }]],
    ],
  );
  assert.equal(stepCovered(mats), false);
  assert.equal(stepCovered(mats.slice(0, 1)), true);
});

test("a quest step whose page is unread, or not a quest, needs nothing yet", () => {
  const need = stepNeed("Do [[Tumpy Tonics]] 400 times")!;
  assert.deepEqual(stepMaterials(need, null, null), []);
  assert.deepEqual(stepMaterials(need, page("zone", [{ name: "x", qty: 1 }]), null), []);
  assert.equal(stepCovered([]), false, "nothing to hold is not 'in hand'");
});

test("an item step with no dump holds nothing", () => {
  assert.deepEqual(stepMaterials({ kind: "item", item: "Phosphorous Powder", qty: 800 }, null, null), [
    { name: "Phosphorous Powder", qty: 800, mine: 0, peers: [] },
  ]);
});

test("seeding raises obtained to what's held, only under the given origin, never lowering it", () => {
  const origin = { kind: "quest" as const, name: "Tumpy Tonics" };
  const entry = (id: string, name: string, obtained: number, o?: typeof origin, kind?: "mob") =>
    ({ id, name, needed: 1, obtained, origin: o, kind, addedAt: "" });
  const list: ShoppingList = {
    entries: [
      entry("a", "Kiola Nut", 0, origin),
      entry("b", "Water Flask", 30, origin),
      entry("c", "Kiola Nut", 0),
      entry("d", "kiola nut", 0, origin, "mob"),
    ],
    questRuns: {},
  };
  const held = new Map([["kiola nut", 412], ["water flask", 20]]);
  assert.deepEqual(heldSeeds(list, origin, held), [{ id: "a", obtained: 412 }]);
  assert.deepEqual(heldSeeds(list, undefined, held), [{ id: "c", obtained: 412 }]);
});
