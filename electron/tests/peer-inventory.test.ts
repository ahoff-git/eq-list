/**
 * Black-box tests for reading a peer's shared inventory back into items (`peerInventoryItems` in
 * `src/shared/peers/peer-inventory.ts`) — the round trip a peer's loadout is planned from: their dump,
 * what they send (`inventoryShareRows`), what we accept (the `inventory` kind's reader), and what we
 * rebuild. Only need re-running if one of those, or `inventoryGear`, changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { heldGrades, inventoryTotals, parseInventoryDump, type InventoryItem } from "../../src/shared/game-export-dumps";
import { shareKind, type InventoryShareRow } from "../../src/shared/peers/peer-share";
import { peerInventoryItems } from "../../src/shared/peers/peer-inventory";
import { inventoryShareRows } from "../game-exports";

const row = (...cols: (string | number)[]) => cols.join("\t");
const AS_OF = "2026-10-20T17:16:42.000Z";

const INVENTORY = [
  row("Location", "Name", "ID", "Count", "Slots"),
  row("Any Slot", "Devlas Ilkvel +2", 9025, 1, 11),
  row("Any Slot-Slot7", "Minotaur Horn (Exaltation)", 13077, 1, 11),
  row("Fingers", "Moonstone Ring +4", 10150, 1, 11),
  row("Fingers-Slot7", "Moonstone Ring (Exaltation)", 10150, 1, 11),
  row("Fingers", "Moonstone Ring", 10150, 1, 11),
  row("Primary", "Fine Steel Rapier", 7352, 1, 11),
  row("General 1", "Bag of Sewn Evil-Eye", 17354, 1, 8),
  row("General 1-Slot3", "Bone Chips", 13073, 643, 11),
  row("General 3", "Light Burlap Sack", 17353, 1, 8),
  row("General 3-Slot1", "Minotaur Horn +4", 13077, 1, 11),
  row("General 3-Slot1-Slot7", "Minotaur Horn (Exaltation)", 13077, 1, 11),
  row("General 3-Slot2", "Moonstone Ring +1", 10150, 1, 11),
  row("Bank3", "Backpack*", 32601, 1, 8),
  row("Bank3-Slot1", "Bone Chips", 13073, 4, 11),
  row("Bank4", "Fine Steel Rapier", 7352, 1, 11),
  row("Bank5", "Fine Steel Rapier", 7352, 1, 11),
  row("KeyRing", "Name", "ID", ""),
  row("Equipment", "Adamantite Epaulets +5", 4402),
  row("Augmentation", "Cat Skull Cap (Exaltation)", 12372),
  "",
].join("\r\n");

/** What a peer would send from `text`, through the reader we'd run it through. */
function sharedFrom(text: string): InventoryShareRow[] {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eql-peer-inv-"));
  fs.mkdirSync(path.join(root, "Logs"));
  const logFile = path.join(root, "Logs", "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(logFile, "");
  const dump = path.join(root, "Kainos_qeynos-Inventory.txt");
  fs.writeFileSync(dump, text);
  fs.utimesSync(dump, new Date(AS_OF), new Date(AS_OF));
  return shareKind("inventory")!.read(inventoryShareRows(logFile), () => "id") as InventoryShareRow[];
}

const gearOf = (items: readonly InventoryItem[]) =>
  items
    .filter((i) => i.area === "worn" || i.grade > 0 || i.sockets.length)
    .map((i) => `${i.area}|${i.area === "worn" ? i.slot : ""}|${i.baseName}|+${i.grade}|${i.sockets.map((s) => `${s.socket}:${s.name}`).join(",")}`)
    .sort();

test("a peer's inventory reads back to what their own dump says: totals, places and grades", () => {
  const theirs = parseInventoryDump(INVENTORY);
  const back = peerInventoryItems(sharedFrom(INVENTORY));
  assert.deepEqual(inventoryTotals(back), inventoryTotals(theirs));
  assert.deepEqual(heldGrades(back, (n) => n.toLowerCase()), heldGrades(theirs, (n) => n.toLowerCase()));
});

test("every worn, graded or socketed copy comes back as itself — what a loadout is planned from", () => {
  const theirs = parseInventoryDump(INVENTORY);
  const back = peerInventoryItems(sharedFrom(INVENTORY));
  assert.deepEqual(gearOf(back), gearOf(theirs));
  // Both rings on, at their own grades, with the stone in the one that has it.
  const rings = back.filter((i) => i.area === "worn" && i.baseName === "Moonstone Ring");
  assert.deepEqual(rings.map((r) => [r.slot, r.grade, r.sockets.length]), [["Fingers", 4, 1], ["Fingers", 0, 0]]);
  assert.equal(back.find((i) => i.baseName === "Adamantite Epaulets")?.slot, "Equipment", "a Storage tab is its slot");
});

test("plain stock comes back one to a slot, the stack on the last", () => {
  const back = peerInventoryItems(sharedFrom(INVENTORY));
  const spares = back.filter((i) => i.baseName === "Fine Steel Rapier" && i.area === "bank");
  assert.deepEqual(spares.map((i) => [i.slot, i.count]), [["4", 1], ["5", 1]]);
});

test("a row from a peer whose app predates gear: worn copies in their slots, the best grade on the first", () => {
  const back = peerInventoryItems([
    { item: "Moonstone Ring", count: 3, grade: 4, places: [{ label: "Worn", slots: ["Fingers"], count: 2 }, { label: "Bank", slots: ["7"], count: 1 }], asOf: AS_OF },
    { item: "Gnoll Slayer", count: 1, grade: 2, places: [{ label: "Bags", slots: ["2"], count: 1 }], asOf: AS_OF },
    { item: "Bone Chips", count: 647, places: [{ label: "Bags", slots: ["1"], count: 643 }, { label: "Bank", slots: ["3"], count: 4 }], asOf: AS_OF },
  ]);
  const at = (name: string) => back.filter((i) => i.baseName === name).map((i) => [i.area, i.slot, i.grade, i.count]);
  assert.deepEqual(at("Moonstone Ring"), [["worn", "Fingers", 4, 1], ["worn", "Fingers", 0, 1], ["bank", "7", 0, 1]]);
  assert.deepEqual(at("Gnoll Slayer"), [["bags", "2", 2, 1]]);
  assert.deepEqual(at("Bone Chips"), [["bags", "1", 0, 643], ["bank", "3", 0, 4]]);
});
