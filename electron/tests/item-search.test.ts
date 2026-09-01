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
  NO_FACET_VALUE,
  activeCriteria,
  zonesInFilterOrder,
  facetOptions,
  facetCounts,
  namesAPlace,
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

test("ticking every zone is not the same as ticking none", () => {
  // The distinction behind the picker's *All* button and the note under it. An item with no zone at
  // all fails a zone filter however many zones are ticked — so "select all" is a real filter ("only
  // things that come from somewhere"), not a no-op. On a filled catalogue it is 4,560 of 11,171
  // items, which is far too many to have disappear without a word.
  const all = rows();
  const everyZone = with_({ facets: { ...NO_CRITERIA.facets, zone: facetOptions(all, "zone") } });
  const kept = titles(all.filter((r) => matchesItem(r, everyZone)));

  assert.deepEqual(titles(all.filter((r) => matchesItem(r, NO_CRITERIA))).length, 3, "unfiltered is everything");
  assert.deepEqual(kept, ["Cloak of Wisdom", "Aviak Talon"], "the quest-only item is cut");
  assert.equal(kept.includes("Circlet of Intellect"), false);
});

test("the count behind that warning is the rows with nothing at all for a facet", () => {
  const all = rows();
  // One of the three is quest-only, so it names no zone.
  assert.equal(facetCounts(all, NO_CRITERIA).zone.get(NO_FACET_VALUE), 1);
  // …and every one of them has a slot and a source, so those warn about nothing.
  assert.equal(facetCounts(all, NO_CRITERIA).slot.get(NO_FACET_VALUE), 1, "the talon is a quest item with no slot");
  assert.equal(facetCounts(all, NO_CRITERIA).source.get(NO_FACET_VALUE), undefined, "everything has a source");
});

test("`(none)` asks for the half of the catalogue no value can reach", () => {
  const all = rows();
  const noZone = with_({ facets: { ...NO_CRITERIA.facets, zone: [NO_FACET_VALUE] } });
  // Exactly the items ticking every zone would have cut, and nothing else — "show me what the wiki
  // lists no source for" is a real question, and this is the only way to ask it.
  assert.deepEqual(titles(all.filter((r) => matchesItem(r, noZone))), ["Circlet of Intellect"]);
});

test("`(none)` ors with the real values rather than replacing them", () => {
  const all = rows();
  const backOrNowhere = with_({ facets: { ...NO_CRITERIA.facets, slot: ["BACK", NO_FACET_VALUE] } });
  // "worn on the back, or worn nowhere" — one thought, one facet.
  assert.deepEqual(titles(all.filter((r) => matchesItem(r, backOrNowhere))), ["Cloak of Wisdom", "Aviak Talon"]);
});

test("every value plus `(none)` is the whole catalogue back", () => {
  const all = rows();
  const everything = with_({
    facets: { ...NO_CRITERIA.facets, zone: [...facetOptions(all, "zone"), NO_FACET_VALUE] },
  });
  assert.equal(all.filter((r) => matchesItem(r, everything)).length, all.length);
});

test("the sentinel is never offered as if it were a value", () => {
  // It is a pseudo-option the picker adds, not something the catalogue contains — if it leaked into
  // the derived options it would appear in the list twice and read as a zone.
  for (const facet of ["zone", "slot", "class", "source", "flag"] as const) {
    assert.equal(facetOptions(rows(), facet).includes(NO_FACET_VALUE), false, facet);
  }
  // And nothing real can collide with it: facet values come from wiki text, which cannot hold a NUL.
  assert.match(NO_FACET_VALUE, /^\u0000/);
});

test("each effect kind is its own facet", () => {
  const catalogue = [
    item("Worn Haste Belt", ["Slot: WAIST", "Effect: Haste (Worn)"]),
    item("Clicky Heal Ring", ["Slot: FINGER", "Effect: Superior Healing (Must Equip, Casting Time: Instant)"]),
    item("Proc Sword", ["Slot: PRIMARY", "Effect: Invigor (Combat, Casting Time: Instant)"]),
    item("Focus Robe", ["Slot: CHEST", "Focus Effect: Spell Haste I"]),
  ];
  const all = itemRows(catalogue);
  // Four pickers, each offering only what is reached that way — the whole point of splitting them.
  assert.deepEqual(facetOptions(all, "worn"), ["Haste"]);
  assert.deepEqual(facetOptions(all, "click"), ["Superior Healing"]);
  assert.deepEqual(facetOptions(all, "proc"), ["Invigor"]);
  assert.deepEqual(facetOptions(all, "focus"), ["Spell Haste I"]);

  // A worn haste is not a clicky haste, and asking for one must not return the other.
  const worn = with_({ facets: { ...NO_CRITERIA.facets, worn: ["Haste"] } });
  assert.deepEqual(titles(all.filter((r) => matchesItem(r, worn))), ["Worn Haste Belt"]);
});

test("a level cap hides what is known to be out of reach, and nothing else", () => {
  // The whole point of the cap: "hide what I can't use yet". An item nothing could place has no
  // answer to that question, and cutting it would quietly hide 44% of a real catalogue — so the
  // silence is kept and reported rather than acted on. Deliberately unlike a stat floor.
  const catalogue = [
    item("High Thing", ["Req Level: 46", "Slot: HEAD"]),
    item("Low Thing", ["Req Level: 10", "Slot: HEAD"]),
    item("Unplaceable", ["Slot: HEAD"]),
  ];
  const all = itemRows(catalogue);
  assert.deepEqual(all.map((r) => r.level?.min), [46, 10, undefined]);

  const capped = with_({ levelMax: 20 });
  assert.deepEqual(titles(all.filter((r) => matchesItem(r, capped))), ["Low Thing", "Unplaceable"]);

  // A floor reads the same way round.
  assert.deepEqual(titles(all.filter((r) => matchesItem(r, with_({ levelMin: 40 })))), ["High Thing", "Unplaceable"]);
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

test("the Zone column leads with a zone the filter kept", () => {
  /**
   * An item dropping in two zones stays in the list when you untick one of them — the other still
   * answers "can I get this" — but the column showed the *first* zone and a `+1`, so the row read as
   * the very zone you had just excluded. The filter was right and the display was not.
   */
  const both = ["Plane of Fear", "Plane of Hate"];
  assert.deepEqual(zonesInFilterOrder(both, ["Plane of Hate"]), ["Plane of Hate", "Plane of Fear"]);
  assert.deepEqual(zonesInFilterOrder(both, []), both, "nothing ticked, so nothing to lead with");
  assert.deepEqual(
    zonesInFilterOrder(both, ["Befallen"]),
    both,
    "kept by something other than its zone — no 'why' to lead with",
  );
  assert.deepEqual(zonesInFilterOrder(["Befallen"], ["Befallen"]), ["Befallen"], "one zone is already in order");
});

// ─── What a picker knows before you tick it ─────────────────────────────────

test("a facet value counts what it would leave, judged against every other criterion", () => {
  /**
   * The number beside each option, and the whole point of it: an option worth nothing is dimmed and
   * sunk. "Nothing" has to mean *given the rest of what you asked for* — a zone with three hundred
   * items in it but none you can wear at level 20 is a dead end, and a menu that still offered it as
   * though it were live is a menu you have to tick your way through to learn anything.
   */
  const rows = itemRows([
    item("Cloth Cap", ["AC: 2", "Slot: HEAD"], [{ kind: "drop", where: "a gnoll", detail: "Blackburrow" }]),
    item("Steel Helm", ["AC: 20", "Slot: HEAD"], [{ kind: "drop", where: "a giant", detail: "Rathe Mountains" }]),
  ]);

  const loose = facetCounts(rows, NO_CRITERIA);
  assert.equal(loose.zone.get("Blackburrow"), 1);
  assert.equal(loose.zone.get("Rathe Mountains"), 1);

  // A floor no Blackburrow item meets makes that zone a dead end — while leaving the other alone.
  const armoured = facetCounts(rows, with_({ mins: { ac: 10 } }));
  assert.equal(armoured.zone.get("Blackburrow"), undefined, "nothing there clears the floor");
  assert.equal(armoured.zone.get("Rathe Mountains"), 1);
});

test("a value's count ignores what is ticked beside it in its own facet", () => {
  // Ticking within one facet *widens* it, so "what would this get me" cannot depend on its
  // neighbours — otherwise every count in the menu would change as you ticked the first box.
  const rows = itemRows([
    item("Cloth Cap", ["Slot: HEAD"], [{ kind: "drop", where: "a gnoll", detail: "Blackburrow" }]),
    item("Cloth Cape", ["Slot: BACK"], [{ kind: "drop", where: "a rat", detail: "Befallen" }]),
  ]);
  const chosen = with_({ facets: { ...NO_CRITERIA.facets, zone: ["Befallen"] } });
  const counts = facetCounts(rows, chosen);
  assert.equal(counts.zone.get("Blackburrow"), 1, "still one item there, ticked or not");
  assert.equal(counts.zone.get("Befallen"), 1);
});

test("a criterion in another facet does cut a value's count", () => {
  // The other half of the same rule: facets narrow each other, so a slot you have ruled out takes
  // its zones down with it. This is what makes the dimming worth anything.
  const rows = itemRows([
    item("Cloth Cap", ["Slot: HEAD"], [{ kind: "drop", where: "a gnoll", detail: "Blackburrow" }]),
    item("Cloth Cape", ["Slot: BACK"], [{ kind: "drop", where: "a rat", detail: "Befallen" }]),
  ]);
  const backOnly = facetCounts(rows, with_({ facets: { ...NO_CRITERIA.facets, slot: ["BACK"] } }));
  assert.equal(backOnly.zone.get("Befallen"), 1);
  assert.equal(backOnly.zone.get("Blackburrow"), undefined, "the head slot is ruled out, so its zone is dead");
});

test("a row two facets away from the results speaks for neither", () => {
  // No single tick can reach it, so counting it under both would promise something no click delivers.
  const rows = itemRows([item("Cloth Cap", ["Slot: HEAD"], [{ kind: "drop", where: "a gnoll", detail: "Blackburrow" }])]);
  const far = facetCounts(
    rows,
    with_({ facets: { ...NO_CRITERIA.facets, slot: ["BACK"], zone: ["Befallen"] } }),
  );
  assert.equal(far.slot.get("HEAD"), undefined);
  assert.equal(far.zone.get("Blackburrow"), undefined);
});

test("a zone cell that names no place is not a zone", () => {
  /**
   * The wiki's drop tables are hand-written and a few of their Zone cells hold a leaked header row, a
   * section marker, or the wiki shrugging — `Various Zones` alone on 106 items. None can answer
   * "which place", so none is offered, and an item left with nothing falls to `(none)`.
   * ("Staff of the Earthcrafter" is the one that started this: `Cazic Thule (God)` in `Pre-Revamp`.)
   */
  for (const junk of [
    "Zone Name",
    "Various Zones",
    "Other 50+ zones",
    "Unknown",
    "Pre-Revamp",
    "Confirmed Drop Zones",
    "Unconfirmed:",
    "(ToV East mobs)",
    "   ",
  ]) {
    assert.equal(namesAPlace(junk), false, junk);
  }
  for (const real of ["Blackburrow", "Cabilis (East)", "Accursed Temple of Cazic-Thule (2002)", "The Feerrott"]) {
    assert.equal(namesAPlace(real), true, real);
  }

  const rows = itemRows([
    item("Staff of the Earthcrafter", ["Slot: PRIMARY"], [
      { kind: "drop", where: "Fright", detail: "Plane of Fear" },
      { kind: "drop", where: "Cazic Thule (God)", detail: "Pre-Revamp" },
    ]),
    item("Widely Dropped Thing", ["Slot: NECK"], [{ kind: "drop", where: "anything", detail: "Various Zones" }]),
  ]);
  assert.deepEqual(rows[0].zones, ["Plane of Fear"], "the real zone stays, the annotation goes");
  assert.deepEqual(rows[1].zones, [], "nothing placed it, so it is one of the placeless");
  assert.equal(facetCounts(rows, NO_CRITERIA).zone.get(NO_FACET_VALUE), 1);
});

test("the criteria count is what a Clear button owes the reader", () => {
  assert.equal(activeCriteria(NO_CRITERIA), 0);
  assert.equal(
    activeCriteria(with_({ text: "cloak", facets: { ...NO_CRITERIA.facets, slot: ["BACK", "HEAD"] }, mins: { wis: 5 } })),
    3,
    "a facet counts once however many values are ticked in it",
  );
  assert.equal(
    activeCriteria(with_({ hideOutOfEra: false })),
    0,
    "the era flag is the default view, not a criterion — counting it would leave Clear (1) with nothing set",
  );
});

test("an out-of-era item is hidden until you ask for it", () => {
  // The default is on: most of the catalogue is out of era and none of it can be got on this server,
  // so including it answers a question nobody asked. Untickable, for reading about the game elsewhere.
  const era = itemRows([item("Kunark Thing", ["AC: 10"], [], { outOfEra: true })]);
  assert.equal(matchesItem(era[0], NO_CRITERIA), false, "hidden by default");
  assert.equal(matchesItem(era[0], with_({ hideOutOfEra: false })), true, "and shown when unticked");
});
