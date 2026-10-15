/**
 * The committed `spell-sources.generated.ts` (a hand edit or a bad regenerate has to pass this too),
 * the lookup beside it (`spell-sources.ts`), and the Spells tab's Source sort (`spell-search.ts`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { SPELL_SOURCES } from "../../src/shared/spells/spell-sources.generated";
import { sourceKindsLabel, spellSource, spellSourceSortValue } from "../../src/shared/spells/spell-sources";
import { searchSpells, NO_CRITERIA, type SpellRow } from "../../src/shared/spells/spell-search";

test("every entry has a kind, and only a quest entry names quests", () => {
  for (const [title, s] of Object.entries(SPELL_SOURCES)) {
    assert.ok(s.kinds.length > 0, `${title}: no kinds`);
    if (s.quests?.length) assert.ok(s.kinds.includes("quest"), `${title}: quests without the quest kind`);
  }
});

test("the two big quest spells are quest-only, and say which quest", () => {
  assert.deepEqual(spellSource("Ice Comet"), { kinds: ["quest"], quests: ["Tarton's Wheel"] });
  assert.deepEqual(spellSource("Tashania"), { kinds: ["quest"], quests: ["Coin of Tash (Tashania)"] });
});

test("a vendor spell is a vendor, and a merchant in a 'Caster Quest NPC Area' is still one", () => {
  assert.deepEqual(spellSource("Burst of Fire")?.kinds, ["vendor"]);
  assert.deepEqual(spellSource("Translocate: Common")?.kinds, ["vendor"]);
});

test("a quest spell a vendor also sells is both, however the page writes it", () => {
  // Two `where_to_obtain` fields (Fire Flux); a quest section outside the field (Spirit Pouch, Talisman).
  assert.deepEqual(spellSource("Fire Flux")?.kinds, ["quest", "vendor"]);
  assert.deepEqual(spellSource("Spirit Pouch"), { kinds: ["quest", "vendor"], quests: ["More Help for Innoruuk"] });
  assert.deepEqual(spellSource("Talisman of Jasinth")?.kinds, ["quest", "vendor"]);
  assert.equal(sourceKindsLabel(spellSource("Fire Flux")!), "Quest · Vendor");
});

test("a quest-only spell sorts ahead of one a vendor also sells", () => {
  assert.ok(spellSourceSortValue("Ice Comet")! < spellSourceSortValue("Fire Flux")!);
});

test("a spell several ways is labelled all of them, quest first", () => {
  assert.equal(sourceKindsLabel({ kinds: ["quest", "drop"] }), "Quest · Drop");
});

test("the lookup ignores case, and a spell the wiki says nothing about has no source", () => {
  assert.equal(spellSource("ice comet")?.quests?.[0], "Tarton's Wheel");
  assert.equal(spellSource("No Such Spell"), undefined);
  assert.equal(spellSourceSortValue("No Such Spell"), undefined);
});

test("sorting by Source puts quest-only spells first and the unknown last", () => {
  const row = (title: string): SpellRow => ({ spell: { title, fetchedAt: "" }, stats: { levels: {} } });
  const rows = ["No Such Spell", "Burst of Fire", "Cripple", "Ice Comet"].map(row);
  const sorted = searchSpells(rows, { ...NO_CRITERIA, hideOutOfEra: false }, { key: "source", desc: false });
  assert.deepEqual(
    sorted.map((r) => r.spell.title),
    ["Ice Comet", "Cripple", "Burst of Fire", "No Such Spell"],
  );
});
