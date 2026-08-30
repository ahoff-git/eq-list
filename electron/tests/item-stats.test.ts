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
  assert.deepEqual(effects, [{ name: "Feet like Cat", kind: "proc" }]);
});

test("how you reach an effect is read off the parenthetical", () => {
  // Every line verbatim from the catalogue. The *kind* is most of what somebody is shopping for — a
  // worn haste and a clicky haste are not substitutes — so getting this wrong makes the dropdowns
  // useless rather than merely imprecise.
  const kindOf = (line: string) => parseItemStats([line]).effects[0]?.kind;
  assert.equal(kindOf("Effect: Invigor (Combat, Casting Time: Instant) at Level 30"), "proc");
  assert.equal(kindOf("Effect: Dyn's Dizzying Draught (Proc)"), "proc");
  assert.equal(kindOf("Effect: Truesight (Worn)"), "worn");
  assert.equal(kindOf("Effect: Serpent Sight (Worn, Casting Time: Instant)"), "worn");
  assert.equal(kindOf("Effect: Dulsehound (Any Slot, Casting Time: Instant)"), "click");
  assert.equal(kindOf("Effect: Gaze (Any Slot/Can Equip, Casting Time: Instant) at Level 20"), "click");
  // "Must Equip" is a click that has to be worn, not a fifth kind — you still press it.
  assert.equal(kindOf("Effect: Superior Healing (Must Equip, Casting Time: Instant) at Level 45"), "click");
  assert.equal(kindOf("Effect: Summon Horse (Casting Time: 3.0)"), "click");
  // The two that label themselves.
  assert.equal(kindOf("Focus Effect: Summoning Haste I"), "focus");
  assert.equal(kindOf("Combat Effect: Knee Shot (Req Level 45)"), "proc");
});

test("a stated `Required Level` is read — and only from the item's own line", () => {
  // 19 of 11,155 cards state one, and where they do it is the real gate. Every line here is verbatim
  // from the catalogue, including the three that look like a requirement and are not.
  const req = (line: string) => parseItemStats([line]).requiredLevel;
  assert.equal(req("Req Level: 30"), 30);
  assert.equal(req("Required Level: 49"), 49);
  assert.equal(req("Required level of 55."), 55);

  // The traps: these gate the **effect**, not wearing the item. An axe with a level-15 proc can be
  // held by anyone, and reading 15 as a requirement would hide it from every lower-level search.
  assert.equal(req("Combat Effect: Knee Shot (Req Level 15)"), undefined);
  assert.equal(
    req("Click Effect: Whirl Bolt (Must Equip) - Cast Time: 1.0 seconds, Required Level: 46, Cooldown: 240 seconds"),
    undefined,
  );
  assert.equal(req("Cast Time: 7.3 seconds Required Level: 15"), undefined, "a cast time means it's a spell's line");

  // And the wiki's way of saying "none".
  assert.equal(req("Recommended level of 10 Required level of 0"), undefined);
  assert.equal(req("Slot: PRIMARY"), undefined);
});

test("a bare `Effect:` with nothing after it is not an effect", () => {
  // 44 lines in the catalogue look exactly like this.
  assert.deepEqual(parseItemStats(["Effect:"]).effects, []);
  assert.deepEqual(parseItemStats(["Focus Effect:  "]).effects, []);
});

test("the same effect named twice on one card is one effect", () => {
  const { effects } = parseItemStats([
    "Effect: Haste (Worn)",
    "Effect: Haste (Worn)",
    "Focus Effect: Spell Haste I",
  ]);
  assert.deepEqual(effects, [
    { name: "Haste", kind: "worn" },
    { name: "Spell Haste I", kind: "focus" },
  ]);
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
  assert.deepEqual(read.effects, []);
  assert.equal(statLine(read), "AC 2 · Mana 75 · STA -10 · SV Magic 10 · Weight 0.1");
});

test("no card at all is a reading, not a crash", () => {
  const read = parseItemStats(undefined);
  assert.deepEqual(read.stats, {});
  assert.deepEqual(read.slots, []);
  assert.equal(statLine(read), "");
});
