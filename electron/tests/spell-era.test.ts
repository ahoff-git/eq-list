/**
 * Black-box tests for the spell level rule every era flag applies (ADR 0288).
 *
 * Pins that a spell is judged by its *lowest* class level, that a card naming no class is never
 * judged, that only a spell page is judged at all, and that a flag already set is never cleared.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { minLevel, pastLevelCap, withSpellLevelEra } from "../../src/shared/spells/spell-era";
import type { ItemCard, SearchResult } from "../../src/shared/types";

const card = (title: string, classes: string): ItemCard => ({ title, lines: [`Classes: ${classes}`, "Mana: 40"] });
const TASHANIA = card("Tashania", "Enchanter - Level 41");
const TASHANIAN = card("Tashanian", "Enchanter - Level 57");

test("the lowest class level decides", () => {
  assert.equal(minLevel({ Enchanter: 57, Bard: 49 }), 49);
  assert.equal(pastLevelCap({ Enchanter: 57, Bard: 49 }, 50), false);
  assert.equal(pastLevelCap({ Enchanter: 57 }, 50), true);
  assert.equal(pastLevelCap({ Enchanter: 50 }, 50), false); // at the cap is reachable
});

test("a card naming no class is never judged by level", () => {
  assert.equal(minLevel({}), undefined);
  assert.equal(pastLevelCap({}, 1), false);
});

test("a search result is flagged by the spell page it names — Tashanian past 50, Tashania not", () => {
  const result = (title: string): SearchResult => ({ title, wikiPath: `/${title}` });
  assert.equal(withSpellLevelEra(result("Tashanian"), { kind: "spell", card: TASHANIAN }, 50).outOfEra, true);
  assert.equal(withSpellLevelEra(result("Tashania"), { kind: "spell", card: TASHANIA }, 50).outOfEra, undefined);
  // When Kunark opens, the cap rises and it comes back with no other change.
  assert.equal(withSpellLevelEra(result("Tashanian"), { kind: "spell", card: TASHANIAN }, 60).outOfEra, undefined);
});

test("only a spell is judged, and a result with no page held is left as the categories said", () => {
  const item = { title: "Orb of Tishan", outOfEra: false };
  assert.equal(withSpellLevelEra(item, { kind: "item", card: TASHANIAN }, 50), item);
  assert.equal(withSpellLevelEra(item, undefined, 50), item);
  assert.equal(withSpellLevelEra(null, { kind: "spell", card: TASHANIAN }, 50), null);
});

test("a flag already set stays set, and the input is never mutated", () => {
  const flagged = { title: "Tashania", outOfEra: true };
  assert.equal(withSpellLevelEra(flagged, { kind: "spell", card: TASHANIA }, 50), flagged);
  const page: { title: string; kind: "spell"; card: ItemCard; outOfEra?: boolean } = {
    title: "Tashanian",
    kind: "spell",
    card: TASHANIAN,
  };
  const out = withSpellLevelEra(page, page, 50);
  assert.equal(out.outOfEra, true);
  assert.equal(page.outOfEra, undefined);
});
