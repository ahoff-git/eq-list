/**
 * Black-box tests for reading an item's stat card as numbers.
 *
 * **Every card line below is verbatim from the app's own page cache** — the same rule the log
 * parsers follow, and for the same reason: this parser's whole job is to survive markup written by
 * many hands over many years, and an invented line proves nothing about that.
 *
 * The two cases that shaped the parser lead: a weapon line where the skill's `1H` sits where a
 * number would (which a general "anything before a colon" reader turns into a stat called
 * `Slashing Atk Delay`, silently losing the delay), and a card that never mentions a stat at all —
 * which has to stay *absent*, not become a zero, or every filter downstream starts admitting things
 * it was told to cut.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EQ_CLASSES, parseItemStats, statLine } from "../../src/shared/item-stats";

test("several stats on one line are all read", () => {
  const { stats } = parseItemStats(["WIS: +9 INT: +4 MANA: +25"]);
  assert.deepEqual(stats, { wis: 9, int: 4, mana: 25 });
});

test("a weapon keeps its delay even though the skill starts with a digit", () => {
  // The line that produced the label-anchored parser. "Skill: 1H Slashing" is not "Skill: 1".
  const { stats, skill } = parseItemStats(["Skill: 1H Slashing Atk Delay: 26", "DMG: 13"]);
  assert.equal(skill, "1H Slashing");
  assert.equal(stats.delay, 26);
  assert.equal(stats.dmg, 13);
  // The one number no card prints, and the only one anyone compares two weapons by.
  assert.equal(stats.ratio, 0.5);
});

test("a stat the card never mentions is absent, not zero", () => {
  const { stats } = parseItemStats(["QUEST ITEM", "WT: 0.6 Size: SMALL", "Class: ALL", "Race: ALL"]);
  assert.equal(stats.wis, undefined);
  assert.equal("wis" in stats, false);
  // …while the one it did give is read, decimal and all.
  assert.equal(stats.wt, 0.6);
});

test("a negative stat keeps its sign", () => {
  const { stats } = parseItemStats(["AC: 2 MANA: 75", "STA: -10", "SV Magic: 10"]);
  assert.equal(stats.sta, -10);
  assert.equal(stats.ac, 2);
  assert.equal(stats.svMagic, 10);
});

test("`ALL except` becomes the classes that can actually use it", () => {
  const { classes } = parseItemStats(["Class: ALL except NEC WIZ MAG ENC"]);
  assert.equal(classes.includes("WAR"), true);
  assert.equal(classes.includes("NEC"), false);
  assert.equal(classes.length, EQ_CLASSES.length - 4);
});

test("`Class: NONE` is nobody, and a bare list is itself", () => {
  assert.deepEqual(parseItemStats(["Class: NONE", "Race: None"]).classes, []);
  assert.deepEqual(parseItemStats(["Class: NONE", "Race: None"]).races, []);
  // No space after the colon — one live page writes it this way.
  assert.deepEqual(parseItemStats(["Class:CLR DRU SHM"]).classes, ["CLR", "DRU", "SHM"]);
});

test("the spellings of one flag fold into one flag", () => {
  assert.deepEqual(parseItemStats(["MAGIC ITEM LORE ITEM NO DROP"]).flags, ["MAGIC", "LORE", "NO DROP"]);
  // Written differently on a page of a different vintage; still the same three facts.
  assert.deepEqual(parseItemStats(["LORE ITEM NODROP"]).flags, ["LORE", "NO DROP"]);
  assert.deepEqual(parseItemStats(["Lore Equipped, Attunable, Quest"]).flags, ["LORE", "QUEST", "ATTUNABLE"]);
});

test("a spell's name never flags the item", () => {
  // "Quest" inside an effect name would otherwise mark a dropped weapon as a quest item.
  const { flags, effects } = parseItemStats(["Effect: Feet like Cat (Combat, Casting Time: Instant) at Level 20"]);
  assert.deepEqual(flags, []);
  assert.deepEqual(effects, ["Feet like Cat"]);
});

test("an effect's casting time is not read as a stat", () => {
  const { stats } = parseItemStats(["Effect: Fear (Any Slot/Can Equip, Casting Time: 2) at Level 30"]);
  assert.deepEqual(stats, {});
});

test("slots are uppercased, and the wiki's typo lands on the real slot", () => {
  assert.deepEqual(parseItemStats(["Slot: Primary Secondary"]).slots, ["PRIMARY", "SECONDARY"]);
  // A live page spells the off-hand `SECONDAY`; two spellings would be two filter options, and
  // half the off-hand items would hide behind whichever one you didn't pick.
  assert.deepEqual(parseItemStats(["Slot: PRIMARY SECONDAY"]).slots, ["PRIMARY", "SECONDARY"]);
});

test("a card that puts the slot on a bare line of its own still has a slot", () => {
  // One live page ends the card with an unlabelled `Primary`. Without this the only weapon in the
  // catalogue with no slot is a weapon you can plainly equip.
  const { slots } = parseItemStats(["Attunable", "Skill: 2H Blunt Atk Delay: 42", "DMG: 15", "Race: ALL", "Primary"]);
  assert.deepEqual(slots, ["PRIMARY"]);
  // All-or-nothing, so a flag line that merely contains a slot word is not read as one.
  assert.deepEqual(parseItemStats(["MAGIC ITEM LORE ITEM"]).slots, []);
});

test("`Size Capacity` is not the item's own size", () => {
  const { size, stats } = parseItemStats(["WT: 1.0 Size: SMALL", "Capacity: 10 Size Capacity: LARGE"]);
  assert.equal(size, "SMALL");
  assert.equal(stats.wt, 1);
});

test("a whole real card reads as its numbers", () => {
  const card = [
    "Attunable Lore Equipped",
    "Slot: FINGERS",
    "AC: 2 MANA: 75",
    "STA: -10",
    "SV Magic: 10",
    "WT: 0.1 Size: TINY",
    "Class: NEC WIZ MAG ENC",
    "Race: ALL",
  ];
  const read = parseItemStats(card);
  assert.deepEqual(read.slots, ["FINGER"]);
  assert.deepEqual(read.classes, ["NEC", "WIZ", "MAG", "ENC"]);
  assert.equal(read.races.length, 16);
  assert.deepEqual(read.flags, ["LORE", "ATTUNABLE"]);
  assert.equal(statLine(read), "AC 2 · Mana 75 · STA -10 · SV Magic 10 · Weight 0.1");
});

test("no card at all is a reading, not a crash", () => {
  const read = parseItemStats(undefined);
  assert.deepEqual(read.stats, {});
  assert.deepEqual(read.slots, []);
  assert.equal(statLine(read), "");
});
