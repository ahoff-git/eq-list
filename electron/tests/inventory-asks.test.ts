/**
 * Black-box tests for which peers a holdings view asks for their inventory
 * (`src/shared/peers/inventory-asks.ts`). Only need re-running if that file changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { INVENTORY_REASK_MS, inventoryAsksDue } from "../../src/shared/peers/inventory-asks";

const peer = (rev: number, n = 40) => ({ peerId: "p1", sessionId: "s1", offer: { inventory: { n, rev } } });
const answer = (rev: number) => ({ peerId: "p1", kind: "inventory" as const, rev });

test("a peer offering an inventory is asked once per revision, and not while their answer is in", () => {
  const asked = new Map<string, number>();
  assert.deepEqual(inventoryAsksDue([peer(3)], [], asked, 0), ["p1"]);
  assert.deepEqual(inventoryAsksDue([peer(3)], [], asked, 1000), [], "an ask in flight isn't repeated");
  assert.deepEqual(inventoryAsksDue([peer(3)], [answer(3)], asked, 2000), []);
  assert.deepEqual(inventoryAsksDue([peer(4)], [answer(3)], asked, 3000), ["p1"], "a moved revision is asked for");
});

test("an answer the tray later drops is asked for again, though their revision hasn't moved", () => {
  const asked = new Map<string, number>();
  inventoryAsksDue([peer(3)], [], asked, 0);
  inventoryAsksDue([peer(3)], [answer(3)], asked, 1000);
  // The hub sweeps a tray entry nobody refreshed in 30 minutes; a live kind is never re-fetched on
  // its own, so without asking again their holdings would be gone until their next dump.
  assert.deepEqual(inventoryAsksDue([peer(3)], [], asked, 2000), ["p1"]);
});

test("an ask nobody answered is repeated once it has waited long enough", () => {
  const asked = new Map<string, number>();
  assert.deepEqual(inventoryAsksDue([peer(3)], [], asked, 0), ["p1"]);
  assert.deepEqual(inventoryAsksDue([peer(3)], [], asked, INVENTORY_REASK_MS - 1), [], "not before the wait");
  assert.deepEqual(inventoryAsksDue([peer(3)], [], asked, INVENTORY_REASK_MS), ["p1"], "the reply was lost — ask again");
});

test("a peer offering nothing, or with no session to address, isn't asked", () => {
  const asked = new Map<string, number>();
  assert.deepEqual(inventoryAsksDue([peer(3, 0)], [], asked, 0), []);
  assert.deepEqual(inventoryAsksDue([{ peerId: "p1", offer: { inventory: { n: 5, rev: 1 } } }], [], asked, 0), []);
});
