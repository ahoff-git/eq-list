/**
 * Black-box tests for reading `/outputfile` dumps (`src/shared/game-export-dumps.ts`) and fetching
 * one from the game folder (`readExport` in `electron/game-exports.ts`). The text below is shaped
 * on real EQL dumps (2026-10-20), names trimmed. Only need re-running if either file changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  factionConText,
  heldGrades,
  inventoryTotals,
  ownedItems,
  ownedText,
  parseAchievementsDump,
  parseDumpTable,
  parseFactionDump,
  parseInventoryDump,
} from "../../src/shared/game-export-dumps";
import { readExport } from "../game-exports";

const row = (...cols: (string | number)[]) => cols.join("\t");

const INVENTORY = [
  row("Location", "Name", "ID", "Count", "Slots"),
  row("Any Slot", "Devlas Ilkvel +2", 9025, 1, 11),
  row("Any Slot-Slot7", "Minotaur Horn (Exaltation)", 13077, 1, 11),
  row("Fingers", "Moonstone Ring +4", 10150, 1, 11),
  row("Fingers-Slot7", "Moonstone Ring (Exaltation)", 10150, 1, 11),
  row("Fingers", "Moonstone Ring +4", 10150, 1, 11),
  row("General 1", "Bag of Sewn Evil-Eye", 17354, 1, 8),
  row("General 1-Slot3", "Bone Chips", 13073, 643, 11),
  row("General 1-Slot4", "Empty", 0, 0, 0),
  row("General 3", "Light Burlap Sack", 17353, 1, 8),
  row("General 3-Slot1", "Minotaur Horn +4", 13077, 1, 11),
  row("General 3-Slot1-Slot7", "Minotaur Horn (Exaltation)", 13077, 1, 11),
  row("Held", "Empty", 0, 0, 0),
  row("Bank3", "Backpack*", 32601, 1, 8),
  row("Bank3-Slot1", "Bone Chips", 13073, 4, 11),
  row("SharedBank1", "Empty", 0, 0, 0),
  row("Hoard 1", "Fine Steel Rapier", 7352, 1, 11),
  row("Hoard 1-Slot2", "Empty", 0, 0, 0),
  row("Personal-Depot1", "Carnelian", 10011, 4, 11),
  // Lines as the player reported them from each window (2026-10-20).
  row("Hoard 33", "Gnoll Head", 13701, 1, 11),
  row("Personal-Depot43", "Phosphorous Powder", 24082, 756, 11),
  row("KeyRing", "Name", "ID", ""),
  row("Augmentation", "Cat Skull Cap (Exaltation)", 12372),
  row("Activated", "Petamorph Wand: Murderbee", 177979),
  row("Equipment", "Sharp Claws +2", 177824),
  row("Equipment", "Adamantite Epaulets +5", 4402),
  row("Augmentation", "Spiky Splintmail (Exaltation)", 177858),
  "",
].join("\r\n");

test("inventory: every area lands where the game shows it, sockets on their host", () => {
  const items = parseInventoryDump(INVENTORY);
  const where = (name: string) => items.filter((i) => i.name === name).map((i) => `${i.area}:${i.slot}`);

  assert.deepEqual(where("Devlas Ilkvel +2"), ["worn:Any Slot"], "EQL's `Any Slot` is worn gear");
  assert.deepEqual(items.find((i) => i.name === "Devlas Ilkvel +2")?.sockets, [{ name: "Minotaur Horn (Exaltation)", socket: 7 }]);
  assert.equal(
    items.filter((i) => i.name.includes("(Exaltation)") && i.area !== "storage").length,
    0,
    "a socketed augment is never a belonging of its own (a loose one in Storage is)",
  );
  // Two rows share the location `Fingers`: the socket goes on the one it follows.
  const rings = items.filter((i) => i.name === "Moonstone Ring +4");
  assert.deepEqual(rings.map((r) => r.sockets.length), [1, 0]);

  assert.deepEqual(where("Bone Chips"), ["bags:General 1", "bank:Bank3"]);
  assert.equal(items.find((i) => i.name === "Bag of Sewn Evil-Eye")?.container, true);
  assert.equal(items.find((i) => i.name === "Bone Chips" && i.area === "bags")?.inside, "General 1");
  assert.deepEqual(items.find((i) => i.name === "Minotaur Horn +4")?.sockets, [{ name: "Minotaur Horn (Exaltation)", socket: 7 }], "a socket inside a bag");
  assert.deepEqual(where("Backpack"), ["bank:Bank3"], "the trailing `*` marker is dropped");

  assert.deepEqual(where("Fine Steel Rapier"), ["hoard:Hoard 1"]);
  assert.deepEqual(where("Carnelian"), ["depot:Personal-Depot1"], "the hyphen in Personal-Depot isn't a slot");

  assert.deepEqual(where("Cat Skull Cap (Exaltation)"), ["storage:Exaltation"], "the dump's Augmentation is the Exaltation tab");
  assert.deepEqual(where("Petamorph Wand: Murderbee"), ["storage:Activated items"]);
  assert.deepEqual(where("Sharp Claws +2"), ["storage:Equipment"]);
  assert.deepEqual(where("Adamantite Epaulets +5"), ["storage:Equipment"]);
  assert.deepEqual(where("Spiky Splintmail (Exaltation)"), ["storage:Exaltation"]);
  assert.deepEqual(where("Gnoll Head"), ["hoard:Hoard 33"]);
  assert.deepEqual(items.find((i) => i.name === "Phosphorous Powder"), {
    location: "Personal-Depot43",
    area: "depot",
    slot: "Personal-Depot43",
    name: "Phosphorous Powder",
    baseName: "Phosphorous Powder",
    id: 24082,
    count: 756,
    sockets: [],
    container: false,
  });
  assert.equal(items.some((i) => i.name === "Empty" || i.name === "Name"), false);
});

test("inventory totals fold grades and places into one count per item", () => {
  const totals = inventoryTotals(parseInventoryDump(INVENTORY));
  const chips = totals.find((t) => t.baseName === "Bone Chips");
  assert.deepEqual(chips, {
    baseName: "Bone Chips",
    count: 647,
    places: [
      { label: "Bags", slots: ["1"], count: 643 },
      { label: "Bank", slots: ["3"], count: 4 },
    ],
  });
  assert.deepEqual(totals.find((t) => t.baseName === "Moonstone Ring")?.places, [{ label: "Worn", slots: ["Fingers"], count: 2 }]);
  // A Storage tab is a place of its own, not just "Storage".
  assert.deepEqual(totals.find((t) => t.baseName === "Spiky Splintmail (Exaltation)")?.places, [
    { label: "Storage: Exaltation", slots: [], count: 1 },
  ]);
  assert.deepEqual(totals.find((t) => t.baseName === "Gnoll Head")?.places, [{ label: "Dragon's hoard", slots: ["33"], count: 1 }]);
  assert.deepEqual(totals.find((t) => t.baseName === "Phosphorous Powder")?.places, [{ label: "Tradeskill depot", slots: ["43"], count: 756 }]);
});

test("faction: rows and the /con word for a standing", () => {
  const rows = parseFactionDump([row("ID", "Name", "StandingValue", "PointsToMax"), row(65, "Brownies of Faydwer", -46, 2046), row(9, "Craftkeepers", 2000, 0)].join("\r\n"));
  assert.deepEqual(rows, [
    { id: 65, name: "Brownies of Faydwer", standing: -46, pointsToMax: 2046 },
    { id: 9, name: "Craftkeepers", standing: 2000, pointsToMax: 0 },
  ]);
  assert.equal(factionConText(2000), "Ally");
  assert.equal(factionConText(0), "Indifferently");
  assert.equal(factionConText(-46), "Apprehensively");
  assert.equal(factionConText(-2000), "Scowls");
});

test("achievements: categories, achievements and objectives by tab depth, with counts", () => {
  const text = [
    "Untapped Potential: Races",
    "I\tRace Unlock - Erudite",
    "C\t\tGet maximum faction with Deepwater Knights.",
    "I\t\tGet maximum faction with Heretics.",
    "C\tRace Unlock - Gnome",
    "C\t\tGet maximum faction with Gem Choppers.",
    "Slayer: Skill",
    "I\tRacist",
    "I\t\tThe playable races.\t1718/10000",
  ].join("\r\n");
  const cats = parseAchievementsDump(text);
  assert.deepEqual(cats.map((c) => c.name), ["Untapped Potential: Races", "Slayer: Skill"]);
  assert.deepEqual(cats[0].achievements.map((a) => [a.name, a.complete, a.objectives.length]), [
    ["Race Unlock - Erudite", false, 2],
    ["Race Unlock - Gnome", true, 1],
  ]);
  assert.equal(cats[0].achievements[0].objectives[0].complete, true);
  assert.deepEqual(cats[1].achievements[0].objectives[0].progress, { have: 1718, need: 10000 });
});

test("a plain dump: a header only when the first line is all words", () => {
  assert.deepEqual(parseDumpTable("1\tBlast of Cold\r\n255\tZephyr: Toxxulia\r\n", ["Level", "Spell"]), {
    header: ["Level", "Spell"],
    rows: [["1", "Blast of Cold"], ["255", "Zephyr: Toxxulia"]],
  });
  assert.deepEqual(parseDumpTable("RealEstateLocation\tRealEstateName\tItemName\r\n"), {
    header: ["RealEstateLocation", "RealEstateName", "ItemName"],
    rows: [],
  });
  assert.deepEqual(parseDumpTable(""), { header: [], rows: [] });
});

test("readExport hands over the newest matching dump, and refuses a type it doesn't know", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "eql-export-read-"));
  fs.mkdirSync(path.join(root, "Logs"));
  const logFile = path.join(root, "Logs", "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(logFile, "");
  fs.writeFileSync(path.join(root, "Kainos_qeynos-WIZ-Factions.txt"), "ID\tName\tStandingValue\tPointsToMax\r\n");
  fs.writeFileSync(path.join(root, "Other_qeynos-Inventory.txt"), "not ours");

  const dump = readExport(logFile, "faction");
  assert.equal(dump?.fileName, "Kainos_qeynos-WIZ-Factions.txt");
  assert.match(dump?.text ?? "", /StandingValue/);
  assert.equal(readExport(logFile, "inventory"), null, "another character's dump is not ours");
  assert.equal(readExport(logFile, "../../etc/passwd"), null);
  assert.equal(readExport(logFile, 42), null);
});

test("the best grade you hold of each item, never an exaltation's", () => {
  const grades = heldGrades(parseInventoryDump(INVENTORY), (n) => n.toLowerCase());
  assert.equal(grades.get("devlas ilkvel"), 2);
  assert.equal(grades.get("moonstone ring"), 4);
  assert.equal(grades.get("minotaur horn"), 4, "the +4 horn in a bag, not its own socketed stone");
  assert.equal(grades.has("bone chips"), false, "an ungraded item isn't in it");
});

test("what you own is keyed by item page, with exaltations placed by what they're socketed in", () => {
  const owned = ownedItems(parseInventoryDump(INVENTORY), (n) => n.toLowerCase());
  assert.equal(ownedText(owned.get("bone chips")!), "Bags 1 ×643 · Bank 3 ×4");
  // Two Moonstone Rings worn, and one of them carries a Moonstone Ring exaltation.
  assert.equal(ownedText(owned.get("moonstone ring")!), "Worn Fingers ×2 · Exaltation in Moonstone Ring +4 (Worn Fingers)");
  // A socketed exaltation names its host and the host's place; one in a bag's item says the bag.
  assert.equal(ownedText(owned.get("minotaur horn")!), "Exaltation in Devlas Ilkvel +2 (Worn Any Slot) · Bags 3 · Exaltation in Minotaur Horn +4 (Bags 3)");
  // A loose one in Storage already says what it is.
  assert.equal(ownedText(owned.get("spiky splintmail")!), "Storage: Exaltation");
  assert.equal(ownedText(owned.get("gnoll head")!), "Dragon's hoard 33");
  assert.equal(ownedText(owned.get("adamantite epaulets")!), "Storage: Equipment");
  assert.equal(owned.has("minotaur horn (exaltation)"), false, "never keyed by the exaltation's own name");
});

test("faction: a blank standing column is no standing, not a zero", () => {
  const rows = parseFactionDump(["ID\tName\tStandingValue\tPointsToMax", "65\tBrownies of Faydwer\t\t2046", "9\tCraftkeepers\t0\t2000"].join("\r\n"));
  assert.deepEqual(rows.map((r) => [r.name, r.standing]), [["Craftkeepers", 0]]);
});
