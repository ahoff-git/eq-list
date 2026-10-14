/**
 * The committed `gm-event-items.generated.ts`, and the era rule over it (`gm-event-items.ts`) as the
 * Items tab's gate (`eraCorpus`) applies it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GM_EVENT_ITEMS } from "../../src/shared/items/gm-event-items.generated";
import { isGmEventItem, outOfEraWithGmEvents, withGmEventEra } from "../../src/shared/items/gm-event-items";
import { eraCorpus } from "../../src/shared/items/item-era";
import type { ItemRow } from "../../src/shared/items/item-search";

test("the items the wiki says came from a GM event are listed, and a hedged one isn't", () => {
  for (const name of ["Oakwynd", "Writ of Innoruuk", "Breastplate of Afflation", "Blade of Shadowed Flame", "Glimmer Ring"]) {
    assert.ok(GM_EVENT_ITEMS.includes(name), name);
  }
  // "Possibly a GM Event item?" is a guess, not a statement.
  assert.ok(!GM_EVENT_ITEMS.includes("Shield of Hatred"));
});

test("a GM-event item is matched however it's spelled, a graded copy included", () => {
  assert.equal(isGmEventItem("oakwynd"), true);
  assert.equal(isGmEventItem("Oakwynd +1"), true);
  assert.equal(isGmEventItem("Rusty Short Sword"), false);
});

test("out of era if the categories say so, or if it's a GM-event item", () => {
  assert.equal(outOfEraWithGmEvents("Oakwynd", false), true);
  assert.equal(outOfEraWithGmEvents("Oakwynd", undefined), true);
  assert.equal(outOfEraWithGmEvents("Rusty Short Sword", true), true);
  assert.equal(outOfEraWithGmEvents("Rusty Short Sword", false), false);
});

test("a page or result is corrected only when it needs to be", () => {
  const page = { title: "Oakwynd", outOfEra: false };
  assert.deepEqual(withGmEventEra(page), { title: "Oakwynd", outOfEra: true });
  assert.equal(page.outOfEra, false, "the original is left alone");
  const other = { title: "Rusty Short Sword", outOfEra: false };
  assert.equal(withGmEventEra(other), other);
  assert.equal(withGmEventEra(null), null);
});

test("the Items tab marks a GM-event item out of era, and hides it when asked", () => {
  const row = (title: string) => ({ item: { title, origin: "wiki", outOfEra: false }, zones: [] }) as unknown as ItemRow;
  const rows = [row("Oakwynd"), row("Rusty Short Sword")];
  const shown = eraCorpus(rows, new Set(), false);
  assert.deepEqual(shown.map((r) => [r.item.title, !!r.item.outOfEra]), [["Oakwynd", true], ["Rusty Short Sword", false]]);
  assert.deepEqual(eraCorpus(rows, new Set(), true).map((r) => r.item.title), ["Rusty Short Sword"]);
});
