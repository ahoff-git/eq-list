/**
 * A review of the *committed* `race-unlocks.generated.ts` data, the same role
 * `zone-gazetteer.test.ts` plays for the zone gazetteer: `scripts/fetch-race-unlocks.mjs` already
 * refuses to write a shape that doesn't fit (see its own header), but this is what a re-supplied file
 * has to pass too — a hand edit, a merge conflict resolved wrong, or a script bug that still produced
 * syntactically valid TypeScript would all slip past the generator's own guard.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { RACE_UNLOCKS, RACE_UNLOCK_SOURCE, factionsForRace, racesRequiringFaction, wikiLinksIn } from "../../src/shared/race-unlocks";

test("at least the races the guide is known to cover are present, each named once", () => {
  assert.ok(RACE_UNLOCKS.length >= 15, `only ${RACE_UNLOCKS.length} races`);
  const names = RACE_UNLOCKS.map((r) => r.race);
  assert.equal(new Set(names).size, names.length, "a race is listed twice");
  assert.ok(names.every((n) => n.trim().length > 0));
});

test("every race's method is well-formed, whatever its kind", () => {
  for (const r of RACE_UNLOCKS) {
    assert.ok(Array.isArray(r.method.steps), `${r.race}: steps`);
    assert.ok(Array.isArray(r.method.hitGroups), `${r.race}: hitGroups`);
    for (const g of r.method.hitGroups) {
      assert.ok(g.label.trim().length > 0, `${r.race}: an unlabeled hit group`);
      assert.ok(g.hits.length > 0, `${r.race}: an empty hit group ("${g.label}")`);
      for (const h of g.hits) {
        assert.ok(h.faction.trim().length > 0, `${r.race}: a hit with no faction name`);
        assert.ok(Number.isInteger(h.amount) && h.amount !== 0, `${r.race}/${h.faction}: amount ${h.amount}`);
      }
    }
  }
});

test("a \"factions\" race states at least one required faction and at least one faction-point hit", () => {
  for (const r of RACE_UNLOCKS) {
    if (r.kind !== "factions") continue;
    assert.ok(r.factions.length > 0, `${r.race}: no required factions`);
    const hits = r.method.hitGroups.reduce((n, g) => n + g.hits.length, 0);
    assert.ok(hits > 0, `${r.race}: requires factions but the guide's method named no faction-point hits`);
  }
});

test("a prerequisite-race entry names a real race; a task entry names a real task", () => {
  for (const r of RACE_UNLOCKS) {
    if (r.kind === "prerequisite-race") assert.ok(r.requires.length > 0, `${r.race}: requires nothing`);
    if (r.kind === "task") assert.ok(r.task.trim().length > 0, `${r.race}: no task named`);
  }
});

test("the two special-cased races are still shaped the way the guide states them", () => {
  const halfElf = RACE_UNLOCKS.find((r) => r.race === "Half Elf");
  assert.equal(halfElf?.kind, "prerequisite-race");
  const kerran = RACE_UNLOCKS.find((r) => r.race === "Kerran");
  assert.equal(kerran?.kind, "task");
});

test("factionsForRace / racesRequiringFaction agree with each other", () => {
  for (const r of RACE_UNLOCKS) {
    if (r.kind !== "factions") continue;
    assert.deepEqual(factionsForRace(r.race), r.factions);
    for (const faction of r.factions) assert.ok(racesRequiringFaction(faction).includes(r.race));
  }
  assert.deepEqual(factionsForRace("Half Elf"), []);
});

test("the source is stamped with where this came from", () => {
  assert.match(RACE_UNLOCK_SOURCE.title, /Race Unlock Guide/);
  assert.ok(!Number.isNaN(Date.parse(RACE_UNLOCK_SOURCE.scrapedAt)));
});

test("a step naming a quest/item/NPC carries a real link, not just prose", () => {
  // Regression: steps used to be flattened to plain display text and every link the method named
  // was rendered separately, disconnected from the sentence that explained it — Kerran's 24 one-link
  // sub-quest steps looked identical to plain text as a result. Every "factions"/"task" race names at
  // least one quest/item/NPC by link; Half Elf is the sole honest exception ("Unlock Wood Elf or
  // Humans (Qeynos)" links to nothing at all on the guide's own page).
  for (const r of RACE_UNLOCKS) {
    if (r.race === "Half Elf") continue;
    const linked = r.method.steps.filter((s) => wikiLinksIn(s).some((seg) => seg.link));
    assert.ok(linked.length > 0, `${r.race}: no step names a wiki-linked quest/item/NPC at all`);
  }
  const kerran = RACE_UNLOCKS.find((r) => r.race === "Kerran")!;
  const kerranLinks = kerran.method.steps.filter((s) => wikiLinksIn(s).some((seg) => seg.link));
  assert.ok(kerranLinks.length >= 10, `Kerran: only ${kerranLinks.length} of its steps carry a real link`);
});

test("wikiLinksIn splits a step into plain-text runs and links, in order", () => {
  assert.deepEqual(wikiLinksIn("Aid [[Feskr Drinkmaker]]"), [{ text: "Aid " }, { link: { title: "Feskr Drinkmaker", display: "Feskr Drinkmaker" } }]);
  assert.deepEqual(wikiLinksIn("Hail any class GM in [[Kerra Isle]] to be assigned this task"), [
    { text: "Hail any class GM in " },
    { link: { title: "Kerra Isle", display: "Kerra Isle" } },
    { text: " to be assigned this task" },
  ]);
  assert.deepEqual(wikiLinksIn("Complete the [[Lion Meat Shipment Quest]] 200 times"), [
    { text: "Complete the " },
    { link: { title: "Lion Meat Shipment Quest", display: "Lion Meat Shipment Quest" } },
    { text: " 200 times" },
  ]);
  assert.deepEqual(wikiLinksIn("no links here"), [{ text: "no links here" }]);
  assert.deepEqual(wikiLinksIn("[[King Ak'Anon (Faction)|King Ak'Anon]]"), [{ link: { title: "King Ak'Anon (Faction)", display: "King Ak'Anon" } }]);
});
