/**
 * Black-box tests for the item search: what a criterion may do, and what a value weight means.
 *
 * Two promises are pinned here because everything else rests on them.
 *
 * **Subtractive.** Adding a criterion may only ever remove rows. The test that matters is the one
 * that would catch a "helpful" widening — a stat floor asked of a card that never mentioned the
 * stat has to fail, because treating silence as a zero that *might* still pass is exactly how a
 * filter starts including what it was told to cut.
 *
 * **The user's yardstick.** The example from the request itself is pinned as written: INT worth 2
 * and WIS worth 1 makes ten wisdom exactly level with five intelligence.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_CRITERIA,
  activeCriteria,
  facetOptions,
  itemCatalog,
  itemRows,
  itemValue,
  matchesItem,
  searchItems,
} from "../../src/shared/item-search";
import { parseItemStats } from "../../src/shared/item-stats";
import type { CachedItem, ItemSource } from "../../src/shared/types";

const item = (title: string, lines: string[], sources: ItemSource[] = [], extra: Partial<CachedItem> = {}): CachedItem => ({
  title,
  origin: "wiki",
  wikiPath: `/${title.replace(/ /g, "_")}`,
  card: { title, lines },
  sources,
  fetchedAt: "2026-08-01T12:00:00.000Z",
  ...extra,
});

const drop = (mob: string, zone: string): ItemSource => ({ kind: "drop", where: mob, detail: zone });

/** Three items with enough between them to tell every rule apart. */
const CATALOGUE: CachedItem[] = [
  item(
    "Cloak of Wisdom",
    ["MAGIC ITEM", "Slot: BACK", "WIS: +10", "Class: ALL", "Race: ALL"],
    [drop("a heretic prophet", "The Feerrott")],
  ),
  item(
    "Circlet of Intellect",
    ["MAGIC ITEM LORE ITEM", "Slot: HEAD", "INT: +5", "Class: NEC WIZ MAG ENC", "Race: ALL"],
    [{ kind: "quest", where: "Apprentice Heretic" }],
  ),
  item("Aviak Talon", ["QUEST ITEM", "WT: 0.1 Size: SMALL", "Class: ALL", "Race: ALL"], [drop("a krag elder", "Feerrott")]),
];

const rows = () => itemRows(CATALOGUE);
const titles = (found: { item: CachedItem }[]) => found.map((f) => f.item.title);
const with_ = (patch: Partial<typeof NO_CRITERIA>) => ({ ...NO_CRITERIA, ...patch });

test("ten wisdom is worth five intelligence when INT counts double", () => {
  const wis = parseItemStats(["WIS: +10"]);
  const int = parseItemStats(["INT: +5"]);
  const weights = { int: 2, wis: 1 };
  assert.equal(itemValue(wis, weights), 10);
  assert.equal(itemValue(int, weights), 10);
});

test("an unweighted stat is worth nothing, and a negative weight subtracts", () => {
  const heavy = parseItemStats(["STR: +5", "WT: 8"]);
  assert.equal(itemValue(heavy, {}), 0, "no weights means the column is saying nothing yet");
  assert.equal(itemValue(heavy, { str: 1 }), 5, "the weight sheet scores what it names and no more");
  // Weight is the stat where less is better; the sheet says so with a sign.
  assert.equal(itemValue(heavy, { str: 1, wt: -0.5 }), 1);
});

test("a stat floor cuts the item whose card never mentioned the stat", () => {
  const [cloak, circlet, talon] = rows();
  const needsInt = with_({ mins: { int: 5 } });
  assert.equal(matchesItem(circlet, needsInt), true);
  assert.equal(matchesItem(cloak, needsInt), false, "10 WIS is not 5 INT");
  // The one that matters: a quest item with no stats at all must not slip through as an implied 0.
  assert.equal(matchesItem(talon, needsInt), false);
});

test("every criterion only ever removes rows", () => {
  const all = rows();
  let last = all.length;
  for (const c of [
    with_({ text: "of" }),
    with_({ text: "of", facets: { ...NO_CRITERIA.facets, slot: ["BACK", "HEAD"] } }),
    with_({ text: "of", facets: { ...NO_CRITERIA.facets, slot: ["BACK", "HEAD"] }, mins: { wis: 1 } }),
  ]) {
    const found = all.filter((r) => matchesItem(r, c)).length;
    assert.ok(found <= last, "a criterion widened the results");
    last = found;
  }
  assert.equal(last, 1);
});

test("two ticks in one facet are an `or`, two facets are an `and`", () => {
  const all = rows();
  const either = with_({ facets: { ...NO_CRITERIA.facets, slot: ["BACK", "HEAD"] } });
  assert.deepEqual(titles(all.filter((r) => matchesItem(r, either))), ["Cloak of Wisdom", "Circlet of Intellect"]);
  // …and adding a second facet narrows that, rather than adding to it.
  const andQuest = with_({ facets: { ...NO_CRITERIA.facets, slot: ["BACK", "HEAD"], source: ["quest"] } });
  assert.deepEqual(titles(all.filter((r) => matchesItem(r, andQuest))), ["Circlet of Intellect"]);
});

test("a class filter reads `ALL` as including that class", () => {
  const all = rows();
  const warrior = with_({ facets: { ...NO_CRITERIA.facets, class: ["WAR"] } });
  // The circlet is caster-only; the other two say `Class: ALL` and so are a warrior's.
  assert.deepEqual(titles(all.filter((r) => matchesItem(r, warrior))), ["Cloak of Wisdom", "Aviak Talon"]);
});

test("one zone under one spelling, however the wiki wrote it", () => {
  // "The Feerrott" on one page and "Feerrott" on another are one place, and a filter offering both
  // would hide half the zone's items behind whichever you didn't pick.
  assert.deepEqual(facetOptions(rows(), "zone"), ["The Feerrott"]);
  const inZone = with_({ facets: { ...NO_CRITERIA.facets, zone: ["The Feerrott"] } });
  assert.deepEqual(titles(rows().filter((r) => matchesItem(r, inZone))), ["Cloak of Wisdom", "Aviak Talon"]);
});

test("the name box matches words in any order and ignores a grade", () => {
  const all = rows();
  assert.deepEqual(titles(all.filter((r) => matchesItem(r, with_({ text: "wisdom cloak" })))), ["Cloak of Wisdom"]);
  assert.deepEqual(titles(all.filter((r) => matchesItem(r, with_({ text: "talon" })))), ["Aviak Talon"]);
});

test("sorting by a stat leads with the items that have it", () => {
  const found = searchItems(rows(), NO_CRITERIA, {}, { key: "wis", desc: true });
  assert.equal(found[0].item.title, "Cloak of Wisdom");
  // The two with no wisdom at all sort below it rather than tying with a zero at the top.
  assert.equal(found[1].stats.stats.wis, undefined);
});

test("sorting by value ranks by the weights you set", () => {
  const found = searchItems(rows(), NO_CRITERIA, { int: 2, wis: 1 }, { key: "value", desc: true });
  assert.deepEqual(titles(found), ["Circlet of Intellect", "Cloak of Wisdom", "Aviak Talon"]);
  assert.equal(found[0].value, 10);
  assert.equal(found[1].value, 10);
  // A tie is broken by name, so an equal column is still in a readable order.
});

test("the wiki's copy of an item wins over Lucy's, and a grade is not a second item", () => {
  const lucy: CachedItem[] = [
    { title: "Cloak of Wisdom", origin: "lucy", lucyId: 42, sources: [], fetchedAt: "2026-08-01T12:00:00.000Z" },
    { title: "Dragoon Dirk +2", origin: "lucy", lucyId: 43, sources: [], fetchedAt: "2026-08-01T12:00:00.000Z" },
  ];
  const catalogue = itemCatalog([...CATALOGUE, item("Dragoon Dirk", ["DMG: 13"])], lucy);
  const cloak = catalogue.find((i) => i.title === "Cloak of Wisdom");
  assert.equal(cloak?.origin, "wiki", "the nearer record is the one to search");
  assert.equal(catalogue.filter((i) => i.title.startsWith("Dragoon Dirk")).length, 1);
});

test("the criteria count is what a Clear button owes the reader", () => {
  assert.equal(activeCriteria(NO_CRITERIA), 0);
  assert.equal(
    activeCriteria(with_({ text: "cloak", facets: { ...NO_CRITERIA.facets, slot: ["BACK", "HEAD"] }, mins: { wis: 5 }, hideOutOfEra: true })),
    4,
    "a facet counts once however many values are ticked in it",
  );
});

test("an out-of-era item is only dropped when asked", () => {
  const era = itemRows([item("Kunark Thing", ["AC: 10"], [], { outOfEra: true })]);
  assert.equal(matchesItem(era[0], NO_CRITERIA), true);
  assert.equal(matchesItem(era[0], with_({ hideOutOfEra: true })), false);
});
