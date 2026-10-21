/**
 * Black-box tests for the `/outputfile` dump ages: naming and staleness (`src/shared/game-exports.ts`)
 * and the folder read (`electron/game-exports.ts`). Only need re-running if either changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  exportAgeText,
  exportFilePrefix,
  exportFileType,
  exportStaleness,
  GAME_EXPORT_COMMANDS,
  lastExportedAt,
  RECIPE_EXPORT_COMMANDS,
} from "../../src/shared/game-exports";
import { archiveExports, inventoryShareRows, readExportTimes, readInventory } from "../game-exports";

const HOUR = 3_600_000;
const inventory = GAME_EXPORT_COMMANDS.find((c) => c.fileType === "inventory")!;
const faction = GAME_EXPORT_COMMANDS.find((c) => c.fileType === "faction")!;
const baking = RECIPE_EXPORT_COMMANDS.find((c) => c.fileType === "baking")!;

test("a dump's prefix is the log's own character_server pair", () => {
  assert.equal(exportFilePrefix("G:\\EQ\\Logs\\eqlog_Kainos_pq.proj.txt"), "Kainos_pq.proj-");
  assert.equal(exportFilePrefix("/eq/Logs/eqlog_Kainos_legends.txt"), "Kainos_legends-");
  assert.equal(exportFilePrefix("/eq/Logs/renamed.txt"), null);
  assert.equal(exportFilePrefix(undefined), null);
});

test("a file is a dump for this character only when the prefix matches, any case", () => {
  assert.equal(exportFileType("Kainos_legends-Inventory.txt", "Kainos_legends-"), "inventory");
  assert.equal(exportFileType("kainos_LEGENDS-GuildBank.TXT", "Kainos_legends-"), "guildbank");
  assert.equal(exportFileType("Other_legends-Inventory.txt", "Kainos_legends-"), null);
  assert.equal(exportFileType("eqlog_Kainos_legends.txt", "Kainos_legends-"), null);
  assert.equal(exportFileType("Kainos_legends-.txt", "Kainos_legends-"), null);
});

test("a command's last export is its newest file with a matching part, class code and plural allowed", () => {
  // The shapes the EQL client really wrote (2026-10-20): a class code before, a plural after.
  const times = { inventory: 100, "wiz-factions": 70, factions: 50, "recipes-baking": 30, spellbook: 999 };
  assert.equal(lastExportedAt(inventory, times), 100);
  assert.equal(lastExportedAt(faction, times), 70);
  assert.equal(lastExportedAt(baking, times), 30);
  assert.equal(lastExportedAt(inventory, {}), undefined);
});

test("recipes are one command per tradeskill, never `all`", () => {
  assert.ok(RECIPE_EXPORT_COMMANDS.length > 5);
  assert.ok(RECIPE_EXPORT_COMMANDS.every((c) => /^\/outputfile recipes [a-z]+$/.test(c.command) && !c.command.endsWith(" all")));
});

test("staleness runs 0 to 1 over the command's window, and is null when never taken", () => {
  const now = 100 * HOUR;
  assert.equal(exportStaleness(inventory, now, now), 0);
  assert.equal(exportStaleness(inventory, now - inventory.staleAfterMs / 2, now), 0.5);
  assert.equal(exportStaleness(inventory, now - inventory.staleAfterMs * 3, now), 1);
  assert.equal(exportStaleness(inventory, now + HOUR, now), 0, "a clock skewed ahead reads as fresh, not negative");
  assert.equal(exportStaleness(inventory, undefined, now), null);
});

test("an age reads at reminder coarseness", () => {
  assert.equal(exportAgeText(20_000), "just now");
  assert.equal(exportAgeText(40 * 60_000), "40m ago");
  assert.equal(exportAgeText(5 * HOUR), "5h ago");
  assert.equal(exportAgeText(72 * HOUR), "3d ago");
});

test("the reader finds this character's dumps beside the Logs folder, and no one else's", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eql-exports-"));
  const logs = path.join(root, "Logs");
  fs.mkdirSync(logs);
  const logFile = path.join(logs, "eqlog_Kainos_legends.txt");
  fs.writeFileSync(logFile, "");
  for (const name of ["Kainos_legends-Inventory.txt", "Kainos_legends-Spellbook.txt", "Other_legends-Inventory.txt"]) {
    fs.writeFileSync(path.join(root, name), "Location\tName\tID\tCount\tSlots\r\n");
  }
  const at = new Date("2026-10-20T12:00:00Z");
  fs.utimesSync(path.join(root, "Kainos_legends-Inventory.txt"), at, at);

  const times = readExportTimes(logFile);
  assert.deepEqual(Object.keys(times).sort(), ["inventory", "spellbook"]);
  assert.equal(times.inventory, at.getTime());
  assert.deepEqual(readExportTimes(path.join(root, "nowhere", "Logs", "eqlog_X_y.txt")), {});
  assert.deepEqual(readExportTimes(undefined), {});
});

test("readInventory: a field dump that overwrote a bank dump still shows the bank, dated by the older dump", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eql-carry-"));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "eql-carry-ud-"));
  fs.mkdirSync(path.join(root, "Logs"));
  const logFile = path.join(root, "Logs", "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(logFile, "");
  const dump = path.join(root, "Kainos_qeynos-Inventory.txt");
  const write = (rows: string[], when: Date) => {
    fs.writeFileSync(dump, ["Location\tName\tID\tCount\tSlots", ...rows].join("\r\n"));
    fs.utimesSync(dump, when, when);
  };
  const atBank = new Date("2026-10-18T12:00:00Z");
  write(["General 1\tBag\t1\t1\t8", "General 1-Slot1\tBone Chips\t13073\t5\t11", "Bank3\tJade\t10023\t21\t11", "Personal-Depot1\tAmber\t10022\t39\t11"], atBank);
  assert.equal(readInventory(logFile, userData)?.carriedItems, undefined, "nothing to carry yet");

  // The game rewrites the same file away from the bank: bags only.
  write(["General 1\tBag\t1\t1\t8", "General 1-Slot1\tBone Chips\t13073\t9\t11"], new Date("2026-10-20T12:00:00Z"));
  const field = readInventory(logFile, userData);
  assert.deepEqual(field?.carried?.map((c) => [c.area, c.at]).sort(), [["bank", atBank.getTime()], ["depot", atBank.getTime()]]);
  assert.deepEqual(field?.carriedItems?.map((i) => [i.name, i.asOf]).sort(), [["Amber", atBank.getTime()], ["Jade", atBank.getTime()]]);
  // Shared with peers too, carried rows included.
  assert.ok(inventoryShareRows(logFile, userData).some((r) => r.item === "Jade"));
});

test("every export is archived once per content, and nothing archived is ever removed", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eql-archive-"));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "eql-archive-ud-"));
  fs.mkdirSync(path.join(root, "Logs"));
  const logFile = path.join(root, "Logs", "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(logFile, "");
  const inv = path.join(root, "Kainos_qeynos-Inventory.txt");
  const fac = path.join(root, "Kainos_qeynos-WIZ-Factions.txt");
  fs.writeFileSync(inv, "Location\tName\tID\tCount\tSlots\r\nBank1\tJade\t1\t21\t11");
  fs.writeFileSync(fac, "ID\tName\tStandingValue\tPointsToMax\r\n9\tCraftkeepers\t2000\t0");
  fs.writeFileSync(path.join(root, "Other_qeynos-Inventory.txt"), "not ours");
  const archived = (type: string) => {
    const dir = path.join(userData, "export-archive", "Kainos_qeynos", type);
    return fs.existsSync(dir) ? fs.readdirSync(dir).sort() : [];
  };

  assert.equal(archiveExports(logFile, userData), 2);
  assert.equal(archiveExports(logFile, userData), 0, "the same content isn't kept twice");
  assert.equal(archived("inventory").length, 1);
  assert.equal(archived("wiz-factions").length, 1);
  assert.ok(!fs.existsSync(path.join(userData, "export-archive", "Other_qeynos")), "another character's dump isn't ours to keep");

  // The game overwrites the file with a new export: both are kept.
  fs.writeFileSync(inv, "Location\tName\tID\tCount\tSlots\r\nGeneral 1\tBone Chips\t2\t9\t11");
  fs.utimesSync(inv, new Date("2026-10-21T08:00:00Z"), new Date("2026-10-21T08:00:00Z"));
  assert.equal(archiveExports(logFile, userData), 1);
  const copies = archived("inventory");
  assert.equal(copies.length, 2);
  assert.ok(copies.some((c) => fs.readFileSync(path.join(userData, "export-archive", "Kainos_qeynos", "inventory", c), "utf8").includes("Jade")), "the first export is still there");

  // Even if the game's file goes, the archive stays.
  fs.rmSync(inv);
  archiveExports(logFile, userData);
  assert.equal(archived("inventory").length, 2);
});
