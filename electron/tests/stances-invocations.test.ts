/**
 * A review of the *committed* `stances-invocations.generated.ts` data, the same role
 * `race-unlocks.test.ts` plays for the race unlock guide: `scripts/fetch-stances-invocations.mjs`
 * already refuses to write a shape that doesn't fit (see its own header), but this is what a
 * re-supplied file has to pass too — a hand edit or a merge conflict resolved wrong would still be
 * syntactically valid TypeScript. Also covers `filterAbilities`/`matchesAbility`, the pure lookup
 * beside the data.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CLASS_NAMES } from "../../src/shared/class-names";
import {
  ABILITY_INVOCATIONS,
  ABILITY_STANCES,
  STANCES_INVOCATIONS_SOURCE,
  filterAbilities,
  matchesAbility,
  type Ability,
} from "../../src/shared/stances-invocations";

test("every stance and invocation is named once, with real text and at least one class", () => {
  for (const list of [ABILITY_STANCES, ABILITY_INVOCATIONS]) {
    const names = list.map((a) => a.name);
    assert.equal(new Set(names).size, names.length, "a name is listed twice");
    for (const a of list) {
      assert.ok(a.name.trim().length > 0);
      assert.ok(a.description.trim().length > 0, `${a.name}: no description`);
      assert.ok(a.classes.length > 0, `${a.name}: no classes`);
    }
  }
});

test("every class named is one of the sixteen the app knows, translated from the wiki's code", () => {
  for (const a of [...ABILITY_STANCES, ...ABILITY_INVOCATIONS]) {
    for (const cls of a.classes) assert.ok((CLASS_NAMES as readonly string[]).includes(cls), `${a.name}: unknown class "${cls}"`);
  }
});

test("Balanced Stance is every melee class's baseline, per the wiki", () => {
  const balanced = ABILITY_STANCES.find((a) => a.name === "Balanced");
  assert.ok(balanced);
  assert.deepEqual(
    [...balanced!.classes].sort(),
    ["Bard", "Beastlord", "Berserker", "Monk", "Paladin", "Ranger", "Rogue", "Shadow Knight", "Warrior"].sort(),
  );
});

test("Berserker Stance is Berserker-only", () => {
  const berserker = ABILITY_STANCES.find((a) => a.name === "Berserker");
  assert.deepEqual(berserker?.classes, ["Berserker"]);
});

test("the source is stamped with where this came from", () => {
  assert.match(STANCES_INVOCATIONS_SOURCE.title, /Stances/);
  assert.ok(!Number.isNaN(Date.parse(STANCES_INVOCATIONS_SOURCE.scrapedAt)));
});

const SAMPLE: Ability[] = [
  { name: "Offensive", description: "Outgoing melee damage is increased.", classes: ["Warrior", "Berserker"] },
  { name: "Channeler", description: "Reduces incoming damage, charged to mana.", classes: ["Wizard"] },
];

test("matchesAbility: an empty criteria matches everything", () => {
  for (const a of SAMPLE) assert.ok(matchesAbility(a, { text: "", classes: [] }));
});

test("matchesAbility: class criteria is an *or* over ticked classes", () => {
  assert.ok(matchesAbility(SAMPLE[0], { text: "", classes: ["Berserker"] }));
  assert.ok(!matchesAbility(SAMPLE[1], { text: "", classes: ["Berserker"] }));
});

test("matchesAbility: text matches the description, not just the name — the reverse lookup", () => {
  assert.ok(matchesAbility(SAMPLE[1], { text: "mana", classes: [] }));
  assert.ok(!matchesAbility(SAMPLE[0], { text: "mana", classes: [] }));
});

test("matchesAbility: every typed word must match somewhere", () => {
  assert.ok(matchesAbility(SAMPLE[0], { text: "melee increased", classes: [] }));
  assert.ok(!matchesAbility(SAMPLE[0], { text: "melee healing", classes: [] }));
});

test("filterAbilities: both criteria narrow together, not one resetting the other", () => {
  const kept = filterAbilities(SAMPLE, { text: "damage", classes: ["Wizard"] });
  assert.deepEqual(kept.map((a) => a.name), ["Channeler"]);
});
