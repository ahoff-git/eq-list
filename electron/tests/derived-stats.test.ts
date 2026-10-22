/**
 * Black-box tests for derived stats: what a point of STA, INT, WIS or AGI is worth in HP, mana and
 * AC, and how that folds into a weight sheet.
 *
 * The rates are pinned against the published figures they were checked on, not against the code:
 * eqlwiki's level-50 and level-60 STA-to-HP charts, and the 11.25 / 22.5 mana per point EQL players
 * measured at level 50 (see `derived-stats.ts`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { derivedGains, derivedRates, foldDerivedWeights, ratesInUse } from "../../src/shared/items/derived-stats";
import { itemRows, searchItems, NO_CRITERIA } from "../../src/shared/items/item-search";
import type { CachedItem } from "../../src/shared/types";

const rate = (classes: string[], level: number, from: string) =>
  derivedRates({ classes, level }).find((r) => r.from === from)?.perPoint;

test("STA buys HP at the wiki's per-class rates, at 50 and at 60", () => {
  const chart: [string, number, number][] = [
    ["Warrior", 4.5, 6],
    ["Shadow Knight", 3.83, 5.2],
    ["Paladin", 3.83, 5.2],
    ["Ranger", 3.33, 4.2],
    ["Monk", 3, 4],
    ["Bard", 3, 4],
    ["Cleric", 2.5, 3],
    ["Enchanter", 2, 2.4],
  ];
  for (const [klass, at50, at60] of chart) {
    assert.equal(rate([klass], 50, "sta"), at50, `${klass} at 50`);
    assert.equal(rate([klass], 60, "sta"), at60, `${klass} at 60`);
  }
});

test("a trio's HP is its two biggest pools — the third class adds nothing", () => {
  // Warrior 300 + Cleric 150 at level 60; the Wizard's 120 is left out.
  const hp = derivedRates({ classes: ["Wizard", "Cleric", "Warrior"], level: 60 }).find((r) => r.from === "sta");
  assert.equal(hp?.perPoint, 9);
  assert.deepEqual(hp?.pools, ["Warrior", "Cleric"]);
});

test("INT and WIS buy mana only for the classes whose pools run on them", () => {
  assert.equal(rate(["Wizard"], 50, "int"), 11.25);
  assert.equal(rate(["Wizard"], 50, "wis"), undefined);
  assert.equal(rate(["Cleric"], 50, "wis"), 11.25);
  // A hybrid pools at the full caster's rate.
  assert.equal(rate(["Shadow Knight"], 50, "int"), 11.25);
  assert.equal(rate(["Warrior", "Monk", "Rogue"], 50, "int"), undefined);
  assert.equal(rate(["Warrior", "Monk", "Rogue"], 50, "wis"), undefined);
});

test("two pools on one stat buy it twice; the counted pair is chosen by class, full casters first", () => {
  // "22.5 mana per wis at lvl 50 with 2x wis casters".
  assert.equal(rate(["Cleric", "Druid", "Wizard"], 50, "wis"), 22.5);
  assert.equal(rate(["Cleric", "Druid", "Wizard"], 50, "int"), undefined);
  // Two WIS hybrids must not crowd out the only real caster.
  assert.equal(rate(["Ranger", "Paladin", "Enchanter"], 50, "int"), 11.25);
  assert.equal(rate(["Ranger", "Paladin", "Enchanter"], 50, "wis"), 11.25);
});

test("mana per point grows with level", () => {
  assert.equal(rate(["Wizard"], 20, "int"), 3.75);
  assert.equal(rate(["Wizard"], 40, "int"), 7.5);
  assert.equal(rate(["Wizard"], 60, "int"), 15);
});

test("AGI buys AC whatever the classes, so it is offered with none ticked", () => {
  assert.deepEqual(
    derivedRates({ classes: [], level: 50 }).map((r) => `${r.from}->${r.to}`),
    ["agi->ac"],
  );
  assert.equal(rate([], 50, "agi"), 0.33);
});

test("folding adds the secondary weight times the rate to the primary stat, and nothing else", () => {
  const rates = derivedRates({ classes: ["Wizard"], level: 50 });
  assert.deepEqual(foldDerivedWeights({ mana: 1 }, rates), { mana: 1, int: 11.25 });
  assert.deepEqual(foldDerivedWeights({ mana: 1, int: 2 }, rates), { mana: 1, int: 13.25 });
  assert.deepEqual(foldDerivedWeights({ ac: 3 }, rates), { ac: 3, agi: 0.99 });
  // A sheet that weights no secondary stat comes back as it went in.
  assert.deepEqual(foldDerivedWeights({ str: 1, int: 2 }, rates), { str: 1, int: 2 });
  assert.deepEqual(ratesInUse({ str: 1 }, rates), []);
});

test("a search for mana ranks an INT ring for a wizard, and not for a warrior", () => {
  const card = (title: string, lines: string[]): CachedItem => ({
    title,
    origin: "wiki",
    wikiPath: `/${title}`,
    card: { title, lines: ["Slot: FINGER", ...lines, "Class: ALL", "Race: ALL"] },
    sources: [],
    fetchedAt: "",
  });
  const rows = itemRows([card("Mana Band", ["MANA: +25"]), card("Brain Band", ["INT: +10"])]);
  const sheet = { mana: 1 };
  const order = (classes: string[]) =>
    searchItems(rows, NO_CRITERIA, foldDerivedWeights(sheet, derivedRates({ classes, level: 50 })), {
      key: "value",
      desc: true,
    }).map((r) => `${r.item.title} ${r.value}`);
  assert.deepEqual(order(["Wizard"]), ["Brain Band 112.5", "Mana Band 25"]);
  assert.deepEqual(order(["Warrior"]), ["Mana Band 25", "Brain Band 0"]);
});

test("an item says what its attributes give in the stats you weighted — and nothing for ones you didn't", () => {
  // A Wizard/Enchanter at 50: 22.5 mana per INT. Weighting mana alone, a +9 INT item explains itself
  // as mana; its STA would be HP, but HP isn't weighted, so it isn't mentioned.
  const rates = derivedRates({ classes: ["Wizard", "Enchanter"], level: 50 });
  assert.deepEqual(derivedGains({ int: 9, sta: 5, mana: 10 }, { mana: 1 }, rates), [{ from: "int", to: "mana", points: 9, amount: 203 }]);
  assert.deepEqual(derivedGains({ int: 9 }, { hp: 1 }, rates), [], "mana not weighted: INT explains nothing");
});
