/**
 * Black-box tests for eqlwiki's melee model (`src/shared/items/melee.ts`) and its use by the loadout
 * builder (`damage-plan.ts`, `bis-plan.ts`). Expected numbers are the wiki's own worked examples where
 * it gives them (Skill Dual Wield, Weapon Procs); the rest are its formulas by hand. Only need
 * re-running if those files change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { asWeapon, damageBonus, defaultSkills, effectiveHaste, hasteCap, meleeChances, normalizeMeleeWeights, procDps, procRateOf, procsPerMinute, swingScore, NO_MELEE_WEIGHTS } from "../../src/shared/items/melee";
import { procHits, procSpellIndex } from "../../src/shared/items/damage-plan";
import { bisPlan } from "../../src/shared/items/bis-plan";
import { NO_BIS_OPTIONS } from "../../src/shared/items/bis-options";
import { itemRows, NO_CRITERIA, type ItemCriteria } from "../../src/shared/items/item-search";
import type { CachedItem } from "../../src/shared/types";

const near = (actual: number, expected: number, what?: string) => assert.ok(Math.abs(actual - expected) < 1e-9, `${what ?? ""} ${actual} ≠ ${expected}`);

test("a capped level-50 Monk: 252 dual wield is 63%, 83.16% with Ambidexterity; 250 double attack is 60%", () => {
  const monk = meleeChances({ classes: ["Monk"], level: 50 });
  assert.equal(monk.skills.dualWield, 252);
  near(monk.dualWield, 0.63);
  near(meleeChances({ classes: ["Monk"], level: 50, ambidexterity: true }).dualWield, 0.8316);
  assert.equal(monk.skills.doubleAttack, 250);
  near(monk.doubleAttack, 0.6);
});

test("triple attack is skill ÷ (skill + 800), from 46; Burst of Power 3 adds 0.225 attacks", () => {
  near(meleeChances({ classes: ["Warrior"], level: 60, tripleAttack: 100 }).tripleAttack, 100 / 900);
  assert.equal(defaultSkills(["Warrior"], 45).tripleAttack, 0);
  assert.equal(defaultSkills(["Warrior"], 46).tripleAttack, 5);
  assert.equal(defaultSkills(["Warrior"], 60).tripleAttack, 75);
  near(meleeChances({ classes: ["Warrior"], level: 60, burstOfPower: 3 }).flurry, 1.225);
  assert.equal(meleeChances({ classes: ["Warrior"], level: 60 }).flurry, 1);
});

test("a trio takes the best cap among its classes, and a caster gets none", () => {
  assert.deepEqual(defaultSkills(["Wizard", "Rogue", "Monk"], 50), { dualWield: 252, doubleAttack: 250, tripleAttack: 25 });
  assert.deepEqual(defaultSkills(["Wizard", "Cleric"], 60), { dualWield: 0, doubleAttack: 0, tripleAttack: 0 });
  assert.equal(defaultSkills(["Paladin"], 19).doubleAttack, 0, "paladins double attack from 20");
  assert.equal(defaultSkills(["Rogue"], 20).dualWield, 125, "6 a level + 5");
});

test("the damage bonus: hand × max(level, dmg) × min(delay, 50)/40 × level/100", () => {
  near(damageBonus({ dmg: 20, delay: 30, twoHanded: false }, 50), 15);
  near(damageBonus({ dmg: 40, delay: 60, twoHanded: true }, 50), 1.1 * 50 * (50 / 40) * 0.5, "delay counts to 50");
  near(damageBonus({ dmg: 70, delay: 40, twoHanded: true }, 50), 1.1 * 70 * 1 * 0.5, "damage above level counts");
});

test("main hand: (2×dmg + bonus)/delay × rounds; off hand: dual wield × 2×dmg/delay × (1 + double attack), no bonus", () => {
  const c = meleeChances({ classes: ["Monk"], level: 50, tripleAttack: 0 });
  const w = { dmg: 20, delay: 30, twoHanded: false };
  near(swingScore(w, "primary", c, 50), ((40 + 15) / 30) * (1 + 0.6) * 10);
  near(swingScore(w, "secondary", c, 50), 0.63 * (40 / 30) * 1.6 * 10);
  assert.equal(swingScore(w, "secondary", meleeChances({ classes: ["Wizard"], level: 50 }), 50), 0, "no dual wield, no off hand");
});

test("procs per minute: DEX/170 + 0.5 to 255, half in the off hand", () => {
  const c = meleeChances({ classes: ["Ranger"], level: 60 });
  near(procsPerMinute(255, "primary", c), 2);
  near(procsPerMinute(400, "primary", c), 2, "past 255 adds nothing");
  near(procsPerMinute(255, "secondary", c), 1);
  near(procsPerMinute(85, "primary", c), 1);
  assert.equal(procsPerMinute(255, "secondary", meleeChances({ classes: ["Cleric"], level: 60 })), 0);
});

test("the haste cap: 55% to level 30, +1% a level to 75% at 50, 100% from 51", () => {
  assert.deepEqual([1, 30, 31, 40, 50, 51, 60].map(hasteCap), [55, 55, 56, 65, 75, 100, 100]);
  assert.equal(effectiveHaste(41, 70, 50), 75, "item and buffs add, to the cap");
  assert.equal(effectiveHaste(21, 0, 60), 21);
});

test("haste divides delay, unrounded: Wurmslayer 40 delay at 31% + 50% swings every 40/1.81", () => {
  const c = meleeChances({ classes: ["Warrior"], level: 60, doubleAttack: 0, tripleAttack: 0 });
  const w = { dmg: 25, delay: 40, twoHanded: false };
  const bonus = damageBonus(w, 60);
  near(swingScore(w, "primary", c, 60, 81), ((50 + bonus) / (40 / 1.81)) * 10, "the bonus stays at the unhasted delay");
  near(swingScore({ dmg: 9, delay: 6, twoHanded: false }, "primary", c, 60, 100), ((18 + damageBonus({ dmg: 9, delay: 6, twoHanded: false }, 60)) / 5) * 10, "never under 5");
});

test("stored melee weights are made whole", () => {
  assert.deepEqual(normalizeMeleeWeights(undefined), NO_MELEE_WEIGHTS);
  assert.deepEqual(normalizeMeleeWeights({ damage: 2, procs: "x", ambidexterity: true, burstOfPower: 9, buffHaste: -5 }), {
    damage: 2,
    procs: 0,
    ambidexterity: true,
    burstOfPower: 3,
    buffHaste: 0,
    procDamage: false,
  });
});

const spell = (title: string, damage: number, lines: string[]) => ({ spell: { title, card: { lines } }, stats: { damage } });
const SPELLS = procSpellIndex([
  spell("Blaze", 418, ["Decrease Hitpoints by 418", "Target Type: Single", "Duration: Instant"]),
  spell("Disease", 2, ["Decrease Hitpoints by 2 per tick", "Target Type: Single", "Duration: 15 minutes"]),
  spell("Dismiss Summoned", 244, ["Decrease Hitpoints by 226 (L23) to 244 (L32)", "Target Type: Construct/Elemental", "Duration: Instant"]),
  spell("Stun", 0, ["Target Type: Single", "Duration: Instant"]),
]);

test("a proc's damage counts when it lands at once and can hit anything", () => {
  assert.equal(procHits(SPELLS, "Blaze"), 418);
  assert.equal(procHits(SPELLS, "blaze"), 418, "names match as the cards spell them, any case");
  assert.equal(procHits(SPELLS, "Disease"), 0, "a per-tick figure isn't a hit");
  assert.equal(procHits(SPELLS, "Dismiss Summoned"), 0, "only summoned things");
  assert.equal(SPELLS.get("dismiss summoned")?.only, "Construct/Elemental");
  assert.equal(procHits(SPELLS, "Stun"), 0, "no damage");
});

test("a proc's damage per second is its rate × its hit; some procs fire faster", () => {
  const c = meleeChances({ classes: ["Ranger"], level: 60 });
  near(procDps("Blaze", 418, 255, "primary", c), (2 * 418) / 60);
  assert.equal(procRateOf("Winter's Roar"), 1.64);
  near(procDps("Winter's Roar", 263, 255, "primary", c), (2 * 1.64 * 263) / 60);
});

// ─── In the loadout builder ─────────────────────────────────────────────────

function page(title: string, lines: string[]): CachedItem {
  return { title, origin: "wiki", card: { title, lines }, sources: [], outOfEra: false } as unknown as CachedItem;
}
const rows = itemRows([
  page("Fine Sword", ["Slot: PRIMARY SECONDARY", "Skill: 1H Slashing Atk Delay: 25", "DMG: 12", "Class: ALL", "Race: ALL"]),
  page("Fine Dagger", ["Slot: PRIMARY SECONDARY", "Skill: 1H Piercing Atk Delay: 20", "DMG: 9", "Class: ALL", "Race: ALL"]),
  page("Great Axe", ["Slot: PRIMARY", "Skill: 2H Slashing Atk Delay: 40", "DMG: 22", "Class: ALL", "Race: ALL"]),
  page("Proc Club", ["Slot: PRIMARY SECONDARY", "Skill: 1H Blunt Atk Delay: 30", "DMG: 8", "Class: ALL", "Race: ALL", "Combat Effect: Stun"]),
  page("Quick Belt", ["Slot: WAIST", "Haste: +41%", "Class: ALL", "Race: ALL"]),
  page("Sturdy Belt", ["Slot: WAIST", "AC: 10", "Class: ALL", "Race: ALL"]),
]);
const as = (classes: string[]): ItemCriteria => ({ ...NO_CRITERIA, hideOutOfEra: false, levelMax: 50, facets: { ...NO_CRITERIA.facets, class: classes } });
const weapons = (plan: ReturnType<typeof bisPlan>) => plan.loadout.picks.filter((p) => p.slot === "PRIMARY" || p.slot === "SECONDARY").map((p) => `${p.slot}:${p.item.title}`);

test("a card that procs is read as a weapon that procs", () => {
  const club = rows.find((r) => r.item.title === "Proc Club")!;
  assert.deepEqual(asWeapon(club.stats), { dmg: 8, delay: 30, twoHanded: false, procs: true, proc: "Stun" });
  assert.equal(asWeapon(rows.find((r) => r.item.title === "Great Axe")!.stats)?.twoHanded, true);
});

test("melee weights alone plan the hands: a dual wielder swings two one-handers, a caster the two-hander", () => {
  const melee = { ...NO_BIS_OPTIONS.melee, damage: 1 };
  const monk = bisPlan({ rows, inventory: [], criteria: as(["Monk"]), weights: {}, options: { ...NO_BIS_OPTIONS, melee } });
  const wizard = bisPlan({ rows, inventory: [], criteria: as(["Wizard"]), weights: {}, options: { ...NO_BIS_OPTIONS, melee } });
  const monkWeapons = weapons(monk);
  assert.equal(monkWeapons.length, 2, monkWeapons.join());
  assert.ok(monk.damage.bestDualWield!.perSecond > monk.damage.bestTwoHanded!.perSecond);
  assert.deepEqual(weapons(wizard), ["PRIMARY:Great Axe"], "no off hand to swing, so the bigger hit wins");
  assert.equal(monk.damage.loadout.perSecond, monk.damage.bestDualWield!.perSecond, "the loadout is the most damage when damage is all that's weighed");
});

test("a proc weight takes the weapon that procs, and makes DEX worth something", () => {
  const plan = bisPlan({ rows, inventory: [], criteria: as(["Monk"]), weights: {}, options: { ...NO_BIS_OPTIONS, melee: { ...NO_BIS_OPTIONS.melee, procs: 100 } } });
  assert.ok(weapons(plan).includes("PRIMARY:Proc Club"), weapons(plan).join());
  assert.equal(plan.damage.dexToCap, 255 - plan.damage.model.dex);
});

test("without melee weights nothing changes: weapons weigh by the sheet alone", () => {
  const plan = bisPlan({ rows, inventory: [], criteria: as(["Monk"]), weights: { dmg: 1 }, options: NO_BIS_OPTIONS });
  assert.ok(plan.loadout.picks.every((p) => p.item.handValue === undefined));
  assert.deepEqual(weapons(plan), ["PRIMARY:Great Axe"], "22 DMG beats 12 + 9 on DMG alone");
});

test("a haste item is worth the swings it adds, to the room your buffs leave under the cap", () => {
  assert.equal(rows.find((r) => r.item.title === "Quick Belt")!.stats.stats.haste, 41);
  const plan = (buffHaste: number) =>
    bisPlan({ rows, inventory: [], criteria: as(["Monk"]), weights: { ac: 1 }, options: { ...NO_BIS_OPTIONS, melee: { ...NO_BIS_OPTIONS.melee, damage: 1, buffHaste } } });
  const quick = (p: ReturnType<typeof bisPlan>) => p.loadout.picks.find((x) => x.item.title === "Quick Belt");
  const open = plan(0);
  assert.ok(quick(open)!.value > 0, "41% haste is worth swings");
  assert.equal(open.damage.bestHaste?.haste, 41);
  assert.deepEqual(open.damage.loadoutHaste, { fromItem: 41, effective: 41 });
  const capped = plan(75);
  assert.equal(capped.damage.model.haste.effective, 75, "level 50's cap");
  assert.equal(quick(capped), undefined, "buffs already at the cap leave item haste worth nothing");
});

test("with proc damage counted, the solver takes the mean proc, and the meanest are listed", () => {
  const procRows = itemRows([
    page("Plain Blade", ["Slot: PRIMARY", "Skill: 1H Slashing Atk Delay: 25", "DMG: 12", "Class: ALL", "Race: ALL"]),
    page("Blazing Blade", ["Slot: PRIMARY", "Skill: 1H Slashing Atk Delay: 25", "DMG: 10", "Class: ALL", "Race: ALL", "Combat Effect: Blaze"]),
    page("Sickly Blade", ["Slot: PRIMARY", "Skill: 1H Slashing Atk Delay: 25", "DMG: 10", "Class: ALL", "Race: ALL", "Combat Effect: Disease"]),
  ]);
  const plan = (procDamage: boolean) =>
    bisPlan({ rows: procRows, inventory: [], criteria: as(["Wizard"]), weights: {}, procSpells: SPELLS, options: { ...NO_BIS_OPTIONS, melee: { ...NO_BIS_OPTIONS.melee, damage: 1, procDamage } } });
  assert.deepEqual(weapons(plan(false)), ["PRIMARY:Plain Blade"], "on swing alone, 12 DMG wins");
  const counted = plan(true);
  assert.deepEqual(weapons(counted), ["PRIMARY:Blazing Blade"], "418 a proc outweighs 2 DMG");
  assert.ok(counted.damage.loadout.procPerSecond > 0);
  assert.deepEqual(counted.damage.meanestProcs.map((p) => p.name), ["Blaze"]);
  assert.equal(counted.damage.uncountedProcs, 1, "Disease is over time");
});
