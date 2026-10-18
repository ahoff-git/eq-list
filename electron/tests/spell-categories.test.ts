/**
 * Black-box tests for naming a spell's spellbook category out of `dbstr_us.txt`.
 *
 * The string rows are copied from a live install (Daybreak's data, identical for every player).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { categoryLabel, parseSpellCategoryNames, spellCategory } from "../../src/shared/spells/spell-categories";

const DBSTR = [
  "13^5^Charm^0^",
  "25^5^Direct Damage^0^",
  "35^5^Enthrall^0^",
  "42^5^Heals^0^",
  "126^5^Utility Detrimental^0^",
  "13^1^Not a category — another string type with the same id^0^",
  "junk",
].join("\r\n");

test("only type-5 strings are category names", () => {
  const names = parseSpellCategoryNames(DBSTR);
  assert.equal(names.get(13), "Charm");
  assert.equal(names.get(126), "Utility Detrimental");
  assert.equal(names.size, 5);
});

test("a spell is named by its category and subcategory", () => {
  const names = parseSpellCategoryNames(DBSTR);
  const charm = spellCategory({ categoryId: 126, subcategoryId: 13 }, names);
  assert.deepEqual(charm, { category: "Utility Detrimental", subcategory: "Charm" });
  assert.equal(categoryLabel(charm!), "Utility Detrimental › Charm");
});

test("a subcategory that repeats its category, or names nothing, is dropped", () => {
  const names = parseSpellCategoryNames(DBSTR);
  assert.deepEqual(spellCategory({ categoryId: 42, subcategoryId: 42 }, names), { category: "Heals" });
  assert.deepEqual(spellCategory({ categoryId: 25, subcategoryId: 999 }, names), { category: "Direct Damage" });
  assert.equal(categoryLabel({ category: "Heals" }), "Heals");
});

test("no category id, or one the table doesn't hold, is no category", () => {
  const names = parseSpellCategoryNames(DBSTR);
  assert.equal(spellCategory({}, names), undefined);
  assert.equal(spellCategory({ categoryId: 999, subcategoryId: 13 }, names), undefined);
});
