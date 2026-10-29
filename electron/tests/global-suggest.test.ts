/**
 * Black-box tests for the search bar's autocomplete (`src/shared/find/global-suggest.ts`): one
 * ranking across sections, wiki pages, held items, stances and AAs; the ghost; and recent picks.
 * Only need re-running if it changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ghostCompletion, globalSuggestions, rememberPick, SUGGEST_LIMIT, type Suggestion, type SuggestInputs } from "../../src/shared/find/global-suggest";
import type { AcrossMatches } from "../../src/shared/find/find-across";
import type { InventoryTotal } from "../../src/shared/game-export-dumps";

const none: AcrossMatches = { held: { shown: [], total: 0 }, abilities: { shown: [], total: 0 }, aas: { shown: [], total: 0 } };
const sections = [
  { key: "items", label: "Items", area: "Find" },
  { key: "mounts", label: "Mounts", area: "Character" },
  { key: "spawns", label: "Spawn timers", area: "Now" },
];
const held = (baseName: string, count = 1, bestGrade = 0): InventoryTotal => ({
  baseName,
  count,
  bestGrade,
  places: [{ label: "Bank", slots: ["3"], count }],
});
const input = (patch: Partial<SuggestInputs>): SuggestInputs => ({ text: "", sections, wiki: [], across: none, recent: [], ...patch });
const labels = (s: Suggestion[]) => s.map((x) => x.label);

test("one ranking across kinds: a close name beats a loose section match", () => {
  const got = globalSuggestions(
    input({ text: "moonst", wiki: [{ title: "Moonstone Ring", wikiPath: "" }, { title: "Moonstone", wikiPath: "" }] }),
  );
  assert.deepEqual(labels(got), ["Moonstone", "Moonstone Ring"], "Mounts doesn't make the cut");
  assert.deepEqual(got[0].target, { page: "Moonstone" });
});

test("a name that starts with what you typed beats one that merely has the word", () => {
  const wiki = ["Chase the Moon", "Silver Moon Armor", "Moonstone", "Fist of the Silver Moon"].map((title) => ({ title, wikiPath: "" }));
  const got = globalSuggestions(input({ text: "moon", wiki }));
  assert.equal(got[0].label, "Moonstone");
  assert.equal(ghostCompletion("moon", got), "stone", "the ghost and the top line agree");
});

test("a page you hold is one line that says where, at your grade, and opens the page", () => {
  const across = { ...none, held: { shown: [held("Moonstone Ring", 2, 3)], total: 1 } };
  const got = globalSuggestions(input({ text: "moonstone ring", wiki: [{ title: "Moonstone Ring", wikiPath: "" }], across }));
  assert.equal(got.length, 1);
  assert.equal(got[0].kind, "held");
  assert.equal(got[0].label, "Moonstone Ring +3");
  assert.equal(got[0].detail, "you hold 2 · Bank");
  assert.deepEqual(got[0].target, { page: "Moonstone Ring +3" });
});

test("sections, stances and AAs: a section opens, an ability or AA is looked up", () => {
  const across: AcrossMatches = {
    ...none,
    abilities: { shown: [{ name: "Spirit Stance", description: "", classes: [], kind: "stance" }], total: 1 },
    aas: { shown: [{ name: "Spell Casting Mastery" } as AcrossMatches["aas"]["shown"][number]], total: 1 },
  };
  const got = globalSuggestions(input({ text: "spa", across }));
  assert.deepEqual(got.find((s) => s.kind === "section")?.target, { section: "spawns" });
  assert.deepEqual(got.find((s) => s.kind === "stance")?.target, { lookUp: "Spirit Stance" });
  assert.deepEqual(got.find((s) => s.kind === "aa")?.target, { lookUp: "Spell Casting Mastery" });
});

test("what you picked before ranks first among equals; an out-of-era page sinks", () => {
  const wiki = [{ title: "Bone Chips", wikiPath: "", outOfEra: true }, { title: "Bone Chip", wikiPath: "" }, { title: "Bone Club", wikiPath: "" }];
  const picked: Suggestion = { kind: "page", label: "Bone Club", detail: "wiki", target: { page: "Bone Club" } };
  const got = globalSuggestions(input({ text: "bone c", wiki, recent: [picked] }));
  assert.equal(got[0].label, "Bone Club");
  assert.equal(got.at(-1)?.label, "Bone Chips");
  assert.equal(got.at(-1)?.detail, "wiki · out of era");
});

test("nothing typed shows recent picks, or the sections before any; the list is capped", () => {
  const recent = Array.from({ length: 12 }, (_, i): Suggestion => ({ kind: "page", label: `P${i}`, detail: "wiki", target: { page: `P${i}` } }));
  assert.deepEqual(labels(globalSuggestions(input({ recent }))), labels(recent.slice(0, SUGGEST_LIMIT)));
  assert.deepEqual(labels(globalSuggestions(input({}))), ["Items", "Mounts", "Spawn timers"], "before any pick, the sections");
  const wiki = recent.map((r) => ({ title: `Rat ${r.label}`, wikiPath: "" }));
  assert.equal(globalSuggestions(input({ text: "rat", wiki })).length, SUGGEST_LIMIT);
});

test("the ghost finishes the best prefix match, case-insensitively, and only a prefix", () => {
  const list: Suggestion[] = [
    { kind: "page", label: "Large Moonstone", detail: "", target: { page: "Large Moonstone" } },
    { kind: "page", label: "Moonstone Ring", detail: "", target: { page: "Moonstone Ring" } },
  ];
  assert.equal(ghostCompletion("moon", list), "stone Ring");
  assert.equal(ghostCompletion("stone", list), undefined);
  assert.equal(ghostCompletion("", list), undefined);
});

test("rememberPick moves a pick to the front without duplicating it", () => {
  const a: Suggestion = { kind: "section", label: "Items", detail: "Find", target: { section: "items" } };
  const b: Suggestion = { kind: "page", label: "Bone Chips", detail: "wiki", target: { page: "Bone Chips" } };
  assert.deepEqual(rememberPick([a, b], b), [b, a]);
});
