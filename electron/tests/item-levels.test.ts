/**
 * Black-box tests for *what level do I need to be to get this?*
 * ([ADR 0163](../decisions/0163-an-item-wears-the-level-of-what-drops-it.md)).
 *
 * The wiki never states an item's level, so it is derived — and the whole design is the **hierarchy
 * of evidence**, mob → quest → zone, each answer carrying where it came from. So that is what is
 * pinned: that the precise rung wins when it can, that a vaguer one is used and *labelled* when it
 * can't, and that an item nothing can place stays **absent** rather than becoming level 1.
 *
 * Every card line is verbatim from the app's own page cache, the same rule the other parsers follow —
 * including the two shapes that caused the parsing to be written the way it is: a mob whose level is
 * a **range** (`Level: 21 - 23`), and one whose `Level:` row exists but was never filled in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { itemLevel, levelText, mobCardLevel, npcKey, parseLevelRange, questCardLevel } from "../../src/shared/item-levels";
import type { ItemSource } from "../../src/shared/types";

const drop = (mob: string, zone?: string): ItemSource => ({ kind: "drop", where: mob, detail: zone });
const quest = (name: string, zone?: string): ItemSource => ({ kind: "quest", where: name, detail: zone });

/** A lookup that knows nothing, so a test can add only the rung it is about. */
const NOTHING = { mob: () => undefined, quest: () => undefined };

test("a mob's level comes off its card, single or ranged", () => {
  // Both verbatim from the cache: one fixed, one that varies by spawn.
  assert.deepEqual(mobCardLevel(["Race: Dark Elf", "Class: Shadowknight", "Level: 35", "Zone: Mistmoore Castle"]), {
    min: 35,
    max: 35,
  });
  assert.deepEqual(mobCardLevel(["Race: Aviak", "Class: Warrior", "Level: 21 - 23"]), { min: 21, max: 23 });
});

test("a `Level:` row nobody filled in is unknown, not zero", () => {
  // Common on this wiki — the row exists on every mob page whether or not anyone knew the answer.
  assert.equal(mobCardLevel(["Race: Undead", "Class:", "Level:", "Zone: New Sebilis Expedition"]), undefined);
  assert.equal(mobCardLevel([]), undefined);
  assert.equal(mobCardLevel(undefined), undefined);
});

test("a quest states its requirement, and `Minimum` outranks `Recommended`", () => {
  assert.deepEqual(questCardLevel(["Minimum Level: 8", "Classes: All"]), { min: 8, max: 8 });
  // `37+` means "37 or above" — the number that matters is 37, and the top is not opened up.
  assert.deepEqual(questCardLevel(["Minimum Level: 37+", "Classes: Wizard"]), { min: 37, max: 37 });
  // A page with only advice still answers; a page with both is gated by the minimum.
  assert.deepEqual(questCardLevel(["Recommended Level: 3", "Classes: All"]), { min: 3, max: 3 });
  assert.deepEqual(questCardLevel(["Minimum Level: 20", "Recommended Level: 30"]), { min: 20, max: 20 });
});

test("nonsense in a level field is refused rather than believed", () => {
  assert.equal(parseLevelRange("unknown"), undefined);
  assert.equal(parseLevelRange(""), undefined);
  assert.equal(parseLevelRange(undefined), undefined);
  // The game's cap is 60 in this era; a four-digit "level" is a typo, not content.
  assert.equal(parseLevelRange("9999"), undefined);
  assert.equal(parseLevelRange("0"), undefined);
});

test("a zone roster's name meets the name an item's drop row uses", () => {
  // The join the cheap rung depends on. A zone page writes `A Burly Gnoll` for a reader and
  // disambiguates across zones with a trailing `(Blackburrow)`; the item's drop row writes what the
  // game prints. Without this fold the level is simply never found.
  assert.equal(npcKey("A Burly Gnoll"), npcKey("a burly gnoll"));
  assert.equal(npcKey("A Giant Snake (Blackburrow)"), npcKey("a giant snake"));
  assert.equal(npcKey("  A   Gnoll  "), "a gnoll");
  // Only a *trailing* parenthetical, and only with something before it.
  assert.equal(npcKey("(Something)"), "(something)");
});

test("what the card says outranks anything derived from where it comes from", () => {
  // An item off a level-5 gnoll that says `Required level of 46` is a level-46 item: the gate is
  // *wearing* it, not getting it.
  const level = itemLevel([drop("a gnoll pup", "Blackburrow")], { mob: () => ({ min: 5, max: 7 }), quest: () => undefined }, 46);
  assert.equal(level?.from, "required");
  assert.equal(level?.min, 46);
  assert.match(level?.why ?? "", /must be level 46/);
  // A card that says nothing falls through to the mob, as before.
  assert.equal(itemLevel([drop("a gnoll pup")], { mob: () => ({ min: 5, max: 7 }), quest: () => undefined })?.from, "mob");
});

test("the mob that drops it wins, and the *easiest* mob at that", () => {
  const level = itemLevel([drop("a hill giant"), drop("a gnoll pup")], {
    mob: (n) => (n === "a hill giant" ? { min: 40, max: 40 } : { min: 5, max: 7 }),
    quest: () => undefined,
  });
  // "Can I get this yet" is answered by the easiest way in, not the hardest.
  assert.equal(level?.min, 5);
  assert.equal(level?.from, "mob");
  assert.match(level?.why ?? "", /a gnoll pup is level 5–7/);
});

test("a quest answers when no mob page is held", () => {
  const level = itemLevel([quest("Aviak Talons")], {
    mob: () => undefined,
    quest: (n) => (n === "Aviak Talons" ? { min: 8, max: 8 } : undefined),
  });
  assert.equal(level?.from, "quest");
  assert.equal(level?.min, 8);
  assert.match(level?.why ?? "", /wants level 8/);
});

test("a mob outranks a quest for the same item", () => {
  // Both rungs available: the precise one is the one a player means.
  const level = itemLevel([drop("a krag elder"), quest("Aviak Talons")], {
    mob: () => ({ min: 12, max: 14 }),
    quest: () => ({ min: 8, max: 8 }),
  });
  assert.equal(level?.from, "mob");
});

test("the zone is the floor of the hierarchy, and says so", () => {
  // No mob page and no quest page, but the zone tables ship with the app — so an item with a zone is
  // always placeable, just vaguely. `from: "zone"` is what stops that reading as a fact.
  const level = itemLevel([drop("a gnoll pup", "Blackburrow")], NOTHING);
  assert.equal(level?.from, "zone");
  assert.ok(level && level.min > 0, "a real range came out of the shipped tables");
  assert.match(level?.why ?? "", /Blackburrow/);
});

test("an item nothing can place has no level at all", () => {
  // Absent, not 1 — a level filter must cut it rather than pretend it is a starter item.
  assert.equal(itemLevel([], NOTHING), undefined);
  assert.equal(itemLevel([quest("Some Quest No Page For")], NOTHING), undefined);
  assert.equal(itemLevel([drop("a mob nobody wrote up", "Not A Real Zone")], NOTHING), undefined);
});

test("a range reads as a span, not a subtraction", () => {
  assert.equal(levelText({ min: 35, max: 35 }), "35");
  assert.equal(levelText({ min: 21, max: 23 }), "21–23");
});
