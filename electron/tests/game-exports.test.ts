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
import { readExportTimes } from "../game-exports";

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
