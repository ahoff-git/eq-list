/**
 * Tests for reading a folder of map files: what counts as a source, and — the load-bearing part —
 * that **a pack names its own zones and nothing else's** (ADR 0060). Touches a temp dir, because
 * "which folder did this come from" is the whole question.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createZoneNamer, listSources } from "../eq-maps";

function tempMaps(): { logDir: string; mapsDir: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eql-maps-"));
  const mapsDir = path.join(root, "maps");
  const logDir = path.join(root, "Logs");
  fs.mkdirSync(mapsDir);
  fs.mkdirSync(logDir);
  return { logDir, mapsDir };
}

/** A map file: some geometry so it has bounds, plus the exit labels that name it. */
function writeMap(dir: string, short: string, exits: string[]): void {
  const lines = ["L 0, 0, 0, 100, 100, 0, 0, 0, 0"];
  exits.forEach((to, i) => lines.push(`P ${i * 10}, ${i * 10}, 0, 0, 0, 240, 3, to_${to.replace(/ /g, "_")}`));
  fs.writeFileSync(path.join(dir, `${short}.txt`), lines.join("\n"), "utf8");
}

test("a folder of maps is a source, and each subfolder holding maps is one more", () => {
  const { logDir, mapsDir } = tempMaps();
  writeMap(mapsDir, "gfaydark", ["Clan Crushbone"]);
  const pack = path.join(mapsDir, "Brewall");
  fs.mkdirSync(pack);
  writeMap(pack, "gfaydark", ["Clan Crushbone"]);
  fs.mkdirSync(path.join(mapsDir, "empty")); // no maps, so not a source

  const { sources, mapsDir: found } = listSources(logDir);
  assert.equal(found, mapsDir);
  assert.deepEqual(sources.map((s) => s.id), ["stock", "brewall"]);
  assert.deepEqual(sources[1].files, ["gfaydark"]);
});

/**
 * The reason this is separated. Two packs are two surveys of one world, and `solveZoneNames` gives
 * one name to one file — so pooling their labels let one pack's file take a name out from under the
 * other's. On a real install (133 game maps beside Brewall's 568) that cost Brewall eight zone names
 * its own labels state outright, and rewrote seven more in the game maps' wording.
 */
test("a pack is named from its own labels, never a neighbouring pack's", async () => {
  const { logDir, mapsDir } = tempMaps();
  // The game's own maps: `keep` is the only file, and its exits name the two zones next door.
  writeMap(mapsDir, "keep", ["Blackburrow", "Qeynos Hills"]);
  // The pack: the same short name, but its own labels say this file's neighbours are elsewhere,
  // and it ships `blackburrow` too — which its own gazetteer can therefore name.
  const pack = path.join(mapsDir, "Brewall");
  fs.mkdirSync(pack);
  writeMap(pack, "keep", ["Surefall Glade"]);
  writeMap(pack, "blackburrow", ["Blackburrow", "Surefall Glade"]);

  const namer = createZoneNamer();
  const { sources } = listSources(logDir);
  const stock = await namer.names(sources[0]);
  const brewall = await namer.names(sources[1]);

  // Only the pack ships a `blackburrow`, so only the pack's gazetteer can have named one — the game
  // maps' mention of Blackburrow must not reach across and name a file in the other folder.
  assert.equal(brewall.blackburrow, "Blackburrow");
  assert.equal(stock.blackburrow, undefined, "the game maps have no such file to name");
  // And a name is only ever read off the folder being viewed: neither gazetteer contains a name
  // solved from the other's labels.
  for (const [file, name] of Object.entries(stock)) assert.ok(sources[0].files.includes(file), `${name} named a file the game maps don't have`);
  for (const [file, name] of Object.entries(brewall)) assert.ok(sources[1].files.includes(file), `${name} named a file the pack doesn't have`);
});

test("naming one pack is not affected by another pack appearing beside it", async () => {
  // The same folder, read with and without a second pack present, names its files identically.
  const alone = tempMaps();
  writeMap(alone.mapsDir, "cave", ["Blackburrow", "Qeynos Hills"]);
  writeMap(alone.mapsDir, "blackburrow", ["Blackburrow"]);
  const solo = await createZoneNamer().names(listSources(alone.logDir).sources[0]);

  const beside = tempMaps();
  writeMap(beside.mapsDir, "cave", ["Blackburrow", "Qeynos Hills"]);
  writeMap(beside.mapsDir, "blackburrow", ["Blackburrow"]);
  const pack = path.join(beside.mapsDir, "Brewall");
  fs.mkdirSync(pack);
  // A pack whose labels would compete for the very same names.
  writeMap(pack, "blackburrow", ["Blackburrow", "Qeynos Hills"]);
  writeMap(pack, "qeytoqrg", ["Qeynos Hills", "Blackburrow"]);
  const withPack = await createZoneNamer().names(listSources(beside.logDir).sources[0]);

  assert.deepEqual(withPack, solo);
});
