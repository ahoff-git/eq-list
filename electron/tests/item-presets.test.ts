/**
 * Black-box tests for best-in-slot options (`src/shared/items/bis-options.ts`) and Items-tab presets
 * (`src/shared/items/item-presets.ts`). Only need re-running if either changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NO_BIS_OPTIONS, bisOptionCount, lockAll, normalizeBisOptions, toggleTitle, withLock } from "../../src/shared/items/bis-options";
import { activePreset, normalizePreset, removePreset, savePreset, type ItemPreset } from "../../src/shared/items/item-presets";
import { NO_CRITERIA } from "../../src/shared/items/item-search";
import { NO_MELEE_WEIGHTS } from "../../src/shared/items/melee";

test("stored options are made whole, and a lock on a slot the layout doesn't have is dropped", () => {
  assert.deepEqual(normalizeBisOptions(undefined), NO_BIS_OPTIONS);
  assert.deepEqual(
    normalizeBisOptions({ locks: { 3: { title: "Cap" }, 4: { empty: true }, 99: { title: "Nowhere" }, x: { title: "Bad" } }, excluded: ["A", 7, ""] }),
    { locks: { 3: { title: "Cap" }, 4: { empty: true } }, wantEffects: [], excluded: ["A"], includeHunt: true, huntGrade: 0, melee: NO_MELEE_WEIGHTS },
  );
  // An older build's two lists of things ruled out are one list now; a name in both is kept once.
  assert.deepEqual(normalizeBisOptions({ benched: ["Iron Ring"], skipHunt: ["Cap", "iron ring"] }).excluded, ["Iron Ring", "Cap"]);
  assert.equal(normalizeBisOptions({ huntGrade: 7 }).huntGrade, 0, "+7 isn't one of the grades offered");
  assert.equal(normalizeBisOptions({ includeHunt: false }).includeHunt, false);
});

test("locking, unlocking, locking a whole loadout, and toggling a title the way names match", () => {
  const one = withLock(NO_BIS_OPTIONS, 2, { title: "Ear" });
  assert.deepEqual(one.locks, { 2: { title: "Ear" } });
  assert.deepEqual(withLock(one, 2, undefined).locks, {});
  assert.deepEqual(lockAll(one, [{ slotIndex: 4, title: "Cap" }]).locks, { 2: { title: "Ear" }, 4: { title: "Cap" } });
  assert.deepEqual(toggleTitle(["Iron Ring"], "iron ring"), [], "case aside, it's the same thing");
  assert.deepEqual(toggleTitle([], "Iron Ring"), ["Iron Ring"]);
  assert.equal(bisOptionCount({ ...one, excluded: ["x"], wantEffects: ["Haste"] }), 3);
});

const preset = (name: string, text = ""): ItemPreset => ({
  name,
  criteria: { ...NO_CRITERIA, text },
  weights: { mana: 1 },
  bis: NO_BIS_OPTIONS,
});

test("saving a preset replaces one of the same name, case aside, and keeps them sorted", () => {
  const list = savePreset(savePreset([], preset("Tank", "a")), preset("  caster  set ", "b"));
  assert.deepEqual(list.map((p) => p.name), ["caster set", "Tank"]);
  const again = savePreset(list, preset("tank", "c"));
  assert.deepEqual(again.map((p) => [p.name, p.criteria.text]), [["caster set", "b"], ["tank", "c"]]);
  assert.deepEqual(removePreset(again, "tank").map((p) => p.name), ["caster set"]);
  assert.deepEqual(savePreset(list, preset("   ")), list, "a blank name saves nothing");
});

test("the active preset is the one the current state is exactly, whatever order it was built in", () => {
  const list = [preset("Tank", "a")];
  const now = { criteria: { ...NO_CRITERIA, text: "a" }, weights: { mana: 1 }, bis: NO_BIS_OPTIONS };
  assert.equal(activePreset(list, now), "Tank");
  assert.equal(activePreset(list, { ...now, weights: { mana: 2 } }), undefined);
  // An old preset missing a facet still matches the same state made whole.
  const old = { ...preset("Old", "a"), criteria: { ...NO_CRITERIA, text: "a", facets: { slot: [] } } } as unknown as ItemPreset;
  assert.equal(activePreset([old], now), "Old");
  assert.deepEqual(normalizePreset(old).criteria.facets, NO_CRITERIA.facets);
});
