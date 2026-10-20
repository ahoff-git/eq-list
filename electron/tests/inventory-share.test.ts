/**
 * Black-box tests for the `inventory` share kind: what a peer's rows must look like to be accepted
 * (`readInventoryRow` via `SHARE_KINDS`), and what we offer from a dump (`inventoryShareRows`). Only
 * need re-running if `peer-share.ts`'s inventory reader or `electron/game-exports.ts` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sharing, shareKind } from "../../src/shared/peers/peer-share";
import { inventoryShareRows } from "../game-exports";

const inventory = shareKind("inventory")!;
const AS_OF = "2026-10-20T17:16:42.000Z";
const newId = () => "id";

test("inventory is a live kind, off until switched on, keyed by item", () => {
  assert.equal(inventory.family, "live");
  assert.equal(sharing(undefined, "inventory"), false);
  assert.equal(sharing({ inventory: true }, "inventory"), true);
  assert.equal(inventory.rowKey?.({ item: "Bone Chips" }), "Bone Chips");
});

test("a peer's row is read for what it says, and dropped or trimmed where it's wrong", () => {
  const rows = inventory.read([
    { item: "Bone Chips", count: 647, places: [{ label: "Bags", slots: ["1"], count: 643 }, { label: "Bank", slots: ["3"], count: 4 }], asOf: AS_OF },
    { item: "", count: 1, places: [], asOf: AS_OF },
    { item: "Rat Whiskers", count: 0, places: [], asOf: AS_OF },
    { item: "Jade", count: 3, places: [], asOf: "not a date" },
    { item: "Amber", count: 2.6, places: [{ label: "", count: 1 }, "junk", { label: "Tradeskill depot", slots: [8, "8"], count: 2 }], asOf: AS_OF },
    "not a row",
  ], newId) as { item: string; count: number; places: { label: string; slots: string[]; count: number }[] }[];

  assert.deepEqual(rows.map((r) => r.item), ["Bone Chips", "Amber"]);
  assert.equal(rows[1].count, 3, "a count is a whole number");
  assert.deepEqual(rows[1].places, [{ label: "Tradeskill depot", slots: ["8"], count: 2 }], "bad places and non-text slots are dropped");
});

test("what we offer is one row per item from the newest dump, dated by it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eql-inv-share-"));
  fs.mkdirSync(path.join(root, "Logs"));
  const logFile = path.join(root, "Logs", "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(logFile, "");
  const dump = path.join(root, "Kainos_qeynos-Inventory.txt");
  fs.writeFileSync(
    dump,
    ["Location\tName\tID\tCount\tSlots", "General 1\tBone Chips\t13073\t643\t11", "Personal-Depot43\tPhosphorous Powder\t24082\t756\t11"].join("\r\n"),
  );
  const at = new Date(AS_OF);
  fs.utimesSync(dump, at, at);

  const rows = inventoryShareRows(logFile);
  assert.deepEqual(rows, [
    { item: "Bone Chips", count: 643, places: [{ label: "Bags", slots: ["1"], count: 643 }], asOf: AS_OF },
    { item: "Phosphorous Powder", count: 756, places: [{ label: "Tradeskill depot", slots: ["43"], count: 756 }], asOf: AS_OF },
  ]);
  assert.deepEqual(inventory.read(rows, newId), rows, "our own rows pass the reader a peer would run them through");
  assert.deepEqual(inventoryShareRows(path.join(root, "Logs", "eqlog_Nobody_qeynos.txt")), []);
});
