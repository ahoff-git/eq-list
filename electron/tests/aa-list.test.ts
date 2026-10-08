/**
 * A review of the *committed* `aa-list.generated.ts` data, the same role `stances-invocations.test.ts`
 * plays for its own generated file: `scripts/fetch-aa-list.mjs` already refuses to write a shape that
 * doesn't fit (see its own header), but this is what a re-supplied file has to pass too — a hand edit,
 * a merge conflict resolved wrong, or a script bug that still produced syntactically valid TypeScript
 * would all slip past the generator's own guard. Also covers `matchesAA`/`filterAA`, the pure lookup
 * beside the data (`aa-list.ts`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { AA_LIST, AA_LIST_SOURCE } from "../../src/shared/aa/aa-list.generated";
import { SPELL_CLASSES } from "../../src/shared/spells/spell-file";
import { filterAA, matchesAA, type AlternateAdvancement } from "../../src/shared/aa/aa-list";

// Pinned against a real run (144, 2026-09-21) with margin for the page picking up a few new AAs —
// not a vanity number, the floor below which something clearly broke (the same role
// `zone-gazetteer.test.ts`'s `CURATED_ZONES.length >= 80` plays for its own list).
const MIN_TOTAL = 130;

test("at least the AAs the wiki is known to carry are present", () => {
  assert.ok(AA_LIST.length >= MIN_TOTAL, `only ${AA_LIST.length} AAs`);
});

test("every category is represented", () => {
  for (const category of ["general", "archetype", "special"] as const) {
    assert.ok(AA_LIST.some((a) => a.category === category), `no "${category}" AAs found`);
  }
});

test("every one of the 16 classes has at least one Class AA", () => {
  const classesSeen = new Set(AA_LIST.filter((a) => a.category === "class").map((a) => a.class));
  assert.deepEqual([...classesSeen].sort(), [...SPELL_CLASSES].sort());
});

test("`class` is set only on class entries, and always a real class", () => {
  for (const a of AA_LIST) {
    if (a.category === "class") assert.ok(SPELL_CLASSES.includes(a.class), `${a.name}: unknown class "${a.class}"`);
    else assert.ok(!("class" in a), `${a.name}: a "${a.category}" entry carries a class`);
  }
});

test("every entry has a real name and description; ranks/cost are strings", () => {
  for (const a of AA_LIST) {
    assert.ok(a.name.trim().length > 0, "an AA with no name");
    assert.ok(a.description.trim().length > 0, `${a.name}: no description`);
    assert.equal(typeof a.ranks, "string", `${a.name}: ranks`);
    assert.equal(typeof a.cost, "string", `${a.name}: cost`);
  }
});

test("no AA is listed twice within the same category/class", () => {
  const seen = new Set<string>();
  for (const a of AA_LIST) {
    const key = `${a.category === "class" ? a.class : a.category}:${a.name}`;
    assert.ok(!seen.has(key), `"${a.name}" is listed twice under ${a.category === "class" ? a.class : a.category}`);
    seen.add(key);
  }
});

test("no leftover wiki markup — the parser strips it, unlike the race guide which keeps it", () => {
  // Deliberately the opposite guard from race-unlocks.test.ts's own markup test: that guide's steps
  // *keep* `[[...]]` links so the UI can render them inline, since a step names a real quest/item/NPC
  // page. An AA's description names nothing this app has a page for, so this parser strips markup
  // instead — this test pins that the stripping actually ran.
  for (const a of AA_LIST) {
    assert.ok(!a.name.includes("[[") && !a.description.includes("[["), `${a.name}: leftover [[ ]] markup`);
    assert.ok(!a.name.includes("'''") && !a.description.includes("'''"), `${a.name}: leftover ''' markup`);
  }
});

test("the source is stamped with where this came from", () => {
  assert.match(AA_LIST_SOURCE.title, /Alternate Advancement/);
  assert.ok(!Number.isNaN(Date.parse(AA_LIST_SOURCE.scrapedAt)));
});

const SAMPLE: AlternateAdvancement[] = [
  { name: "Fury of Magic", ranks: "4", cost: "1/2/3/4", description: "Increases your chance to land a critical hit with your direct damage spells.", category: "archetype" },
  { name: "Berserker Stance AA", ranks: "1", cost: "5", description: "A melee cooldown for Berserkers.", category: "class", class: "Berserker" },
];

test("matchesAA: an empty criteria matches everything", () => {
  for (const a of SAMPLE) assert.ok(matchesAA(a, { text: "", class: "" }));
});

test("matchesAA: a class criterion never hides a category-less AA", () => {
  assert.ok(matchesAA(SAMPLE[0], { text: "", class: "Berserker" }), "an archetype AA must stay visible under any class filter");
});

test("matchesAA: a class criterion narrows class entries to that class only", () => {
  assert.ok(matchesAA(SAMPLE[1], { text: "", class: "Berserker" }));
  assert.ok(!matchesAA(SAMPLE[1], { text: "", class: "Warrior" }));
});

test("matchesAA: text matches the description, not just the name — the reverse lookup", () => {
  assert.ok(matchesAA(SAMPLE[0], { text: "direct damage", class: "" }));
  assert.ok(!matchesAA(SAMPLE[1], { text: "direct damage", class: "" }));
});

test("matchesAA: every typed word must match somewhere", () => {
  assert.ok(matchesAA(SAMPLE[0], { text: "critical direct", class: "" }));
  assert.ok(!matchesAA(SAMPLE[0], { text: "critical healing", class: "" }));
});

test("filterAA: both criteria narrow together, not one resetting the other", () => {
  const kept = filterAA(SAMPLE, { text: "melee", class: "Berserker" });
  assert.deepEqual(kept.map((a) => a.name), ["Berserker Stance AA"]);
});

test("the real catalogue answers the reverse lookup this feature exists for", () => {
  const hits = filterAA(AA_LIST, { text: "direct damage", class: "" });
  assert.ok(hits.length > 0, `"direct damage" matched nothing in the real AA list`);
});
