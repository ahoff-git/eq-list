/**
 * Black-box tests for what the shopping list holds (`src/shared/items/held-count.ts`, ADR 0382): the
 * inventory dump plus the ledger since it. Only need re-running if that file changes.
 *
 * Every dump row is verbatim from a real `Kainos_qeynos-Inventory.txt` (the EQL client's own format), and
 * every ledger row is a real one from the same character's ledger (`loot_records`), so the rule is
 * pinned against what the game and the app actually wrote — not against what we expect them to.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countableNames,
  countedEntries,
  countEntry,
  describeHeld,
  dumpIsStale,
  dumpOldestAt,
  heldCounts,
  sinceStamp,
  type DumpBaseline,
  type HeldCounted,
  type Movement,
} from "../../src/shared/items/held-count";
import { carryForward, parseInventoryDump } from "../../src/shared/game-export-dumps";
import type { ShoppingList, ShoppingListEntry } from "../../src/shared/types";
import { groupByOrigin, normalizeItemName, satisfied } from "../../src/shared/items/grouping";

const HOUR = 3_600_000;
/** The dump was written Nov 8, 00:05:56 local — as the real one was. Local, so the test passes in any zone. */
const DUMP_AT = new Date(2026, 10, 8, 0, 5, 56).getTime();
const NOW = DUMP_AT + 2 * HOUR;

const tsv = (...rows: string[][]) => ["Location\tName\tID\tCount\tSlots", ...rows.map((r) => r.join("\t"))].join("\r\n");

// Rows from the real dump: a big stack in a bag, a small one beside it, a graded worn piece, bank stacks,
// a bag marked with the dump's trailing `*`, and an empty slot.
const REAL_DUMP = tsv(
  ["Any Slot", "Silversilk Leggings +3", "1366", "1", "11"],
  ["Any Slot-Slot2", "Empty", "0", "0", "0"],
  ["General 1-Slot5", "Bone Chips", "13073", "651", "11"],
  ["General 2-Slot6", "Gnoll Fang", "13915", "29", "11"],
  ["General 3-Slot6", "Kobold Hide", "13424", "11", "11"],
  ["General 3-Slot7", "Phosphorous Powder", "24082", "2", "11"],
  ["Bank1-Slot1", "Fine Steel Dagger", "7350", "1", "11"],
  ["Bank1-Slot2", "Fine Steel Dagger", "7350", "1", "11"],
  ["Bank3", "Backpack*", "32601", "1", "8"],
  ["Bank5-Slot6", "Patch of Gnoll Fur", "13025", "54", "11"],
  ["Hoard 13", "Fine Steel Dagger", "7350", "1", "11"],
);

const dump = (over: Partial<DumpBaseline> = {}, text = REAL_DUMP): DumpBaseline => ({
  writtenAt: DUMP_AT,
  items: parseInventoryDump(text),
  ...over,
});

/** A stamp the way the log writes one, `seconds` after the dump (negative: before). */
const stampAt = (seconds: number): string => {
  const d = new Date(DUMP_AT + seconds * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

const move = (item: string, seconds: number, over: Partial<Movement> = {}): Movement => ({
  at: stampAt(seconds),
  item,
  qty: 1,
  fate: "kept",
  ...over,
});

const counted = (name: string, d: DumpBaseline, moves: Movement[] = []): HeldCounted => {
  const found = heldCounts([name], d, moves).get(normalizeItemName(name));
  assert.equal(found?.kind, "counted", `${name} should be countable, got ${JSON.stringify(found)}`);
  return found as HeldCounted;
};

test("an item in the dump only is held at the dump's count, every area", () => {
  const h = counted("Bone Chips", dump());
  assert.equal(h.held, 651);
  assert.deepEqual([h.inDump, h.looted, h.gone, h.autoSold, h.overdrawn], [651, 0, 0, 0, false]);
  // Bank and hoard stacks are held too: two bank daggers and one in the hoard.
  assert.equal(counted("Fine Steel Dagger", dump()).held, 3);
});

test("a stack is its count, not one", () => {
  assert.equal(counted("Gnoll Fang", dump()).held, 29);
  assert.equal(counted("Patch of Gnoll Fur", dump()).held, 54);
});

test("looted since the dump is added; looted before it is the dump's already", () => {
  const moves = [
    move("Kobold Hide", 60, { qty: 3 }),
    move("Kobold Hide", 600),
    move("Kobold Hide", -60, { qty: 5 }), // before the dump: already in it
  ];
  const h = counted("Kobold Hide", dump(), moves);
  assert.equal(h.looted, 4);
  assert.equal(h.held, 15);
});

test("a row at exactly the dump's second is taken to be in the dump", () => {
  const h = counted("Kobold Hide", dump(), [move("Kobold Hide", 0), move("Kobold Hide", 1)]);
  assert.equal(h.looted, 1);
  assert.equal(h.held, 12);
});

test("an auto-sold drop is never held — it adds nothing and takes nothing, and is told apart", () => {
  const h = counted("Kobold Hide", dump(), [move("Kobold Hide", 30, { fate: "sold", detail: "10 copper", qty: 2 }), move("Kobold Hide", 40)]);
  assert.equal(h.held, 12, "11 in the dump + 1 kept; the 2 auto-sold never arrived");
  assert.equal(h.autoSold, 2);
});

test("an item auto-sold and not in the dump is held at 0, with the sales explaining why", () => {
  const h = counted("Tiger Skin", dump(), [move("Tiger Skin", 90, { fate: "sold", detail: "1 gold and 7 copper" })]);
  assert.deepEqual([h.held, h.inDump, h.autoSold], [0, 0, 1]);
});

test("an item the dump doesn't list is held at 0 — the dump names everything you own", () => {
  assert.equal(counted("Ruby", dump()).held, 0);
});

test("what left is subtracted, and can't take the count below zero — it says the dump is out of date instead", () => {
  const some = counted("Kobold Hide", dump(), [move("Kobold Hide", 30, { fate: "gone", qty: 4 })]);
  assert.deepEqual([some.held, some.gone, some.overdrawn], [7, 4, false]);

  const more = counted("Phosphorous Powder", dump(), [move("Phosphorous Powder", 30, { fate: "gone", qty: 5 }), move("Phosphorous Powder", 60)]);
  assert.deepEqual([more.held, more.overdrawn], [0, true]);
  assert.match(describeHeld(more, { now: NOW, formatAt: String }), /floored at 0/);
});

test("a gone row before the dump is the dump's already", () => {
  assert.equal(counted("Kobold Hide", dump(), [move("Kobold Hide", -30, { fate: "gone", qty: 4 })]).held, 11);
});

test("grades, case and spacing all meet: the list's name, the dump's and the ledger's", () => {
  const d = dump();
  assert.equal(counted("Silversilk Leggings", d).held, 1, "a worn +3 piece is a Silversilk Leggings");
  assert.equal(counted("kobold   hide", d, [move("Kobold Hide +2", 10)]).held, 12, "a graded drop answers for the base item");
  assert.equal(counted("Bone Chips", d, [move("bone chips", 10, { qty: 2 })]).held, 653);
});

test("the dump's trailing * marker doesn't leak into the name, and a bag is an item like any other", () => {
  assert.equal(counted("Backpack", dump()).held, 1);
});

test("an item that drops into the tradeskill depot counts from the depot's own date, not the dump's", () => {
  // The newest dump has no depot rows; the depot was last seen 11 minutes earlier, as the real one was.
  const text = tsv(["General 1-Slot5", "Bone Chips", "13073", "651", "11"]);
  const saved = {
    depot: {
      at: DUMP_AT - 11 * 60_000,
      items: parseInventoryDump(tsv(["Personal-Depot56", "Phosphorous Powder", "24082", "216", "11"])),
    },
  };
  const carried = carryForward(parseInventoryDump(text), DUMP_AT, saved);
  const d: DumpBaseline = { writtenAt: DUMP_AT, items: carried.items, carried: carried.carried };

  const h = counted("Phosphorous Powder", d, [
    move("Phosphorous Powder", -300, { fate: "stored", detail: "tradeskill depot", qty: 2 }), // after the depot was seen, before the dump
    move("Phosphorous Powder", 20, { fate: "stored", detail: "tradeskill depot", qty: 2 }),
    move("Phosphorous Powder", -900, { fate: "stored", detail: "tradeskill depot", qty: 2 }), // before the depot was seen
  ]);
  assert.equal(h.inDump, 216);
  assert.equal(h.looted, 4, "the two after the depot was last seen; the one before it is in it already");
  assert.equal(h.held, 220);
  assert.equal(h.carriedFrom, DUMP_AT - 11 * 60_000);
  assert.match(describeHeld(h, { now: NOW, formatAt: (ms) => `@${ms}` }), /storage \(depot, bank or hoard\) wasn't in that dump/);
});

test("a drop stored in a section the dump never had is counted, and says the rest of that section is missing", () => {
  // The real dump has hoard rows but no depot, and nothing was carried: what was in the depot is unseen.
  const h = counted("Phosphorous Powder", dump(), [move("Phosphorous Powder", 20, { fate: "stored", detail: "tradeskill depot", qty: 2 })]);
  assert.deepEqual([h.held, h.looted, h.missingArea], [4, 2, "depot"], "2 in the bags + 2 stored since; the depot's own stock is unseen");
  assert.match(describeHeld(h, { now: NOW, formatAt: String }), /no depot rows/);
  assert.equal(counted("Phosphorous Powder", dump()).missingArea, undefined, "nothing stored there since: nothing to say");
});

test("a kept drop while the depot is carried still counts from the bags' (the dump's) date", () => {
  const d: DumpBaseline = { ...dump(), carried: [{ area: "depot", at: DUMP_AT - HOUR }] };
  const h = counted("Kobold Hide", d, [move("Kobold Hide", -300)]);
  assert.equal(h.looted, 0, "kept drops go to bags, which the dump itself dated");
  assert.equal(h.carriedFrom, undefined, "and nothing of this item is in the carried depot, so its sum has nothing to say about it");
});

test("a stored drop when the dump itself has the section counts from the dump", () => {
  const h = counted("Fine Steel Dagger", dump(), [
    move("Fine Steel Dagger", -10, { fate: "stored", detail: "Dragon Hoard" }),
    move("Fine Steel Dagger", 10, { fate: "stored", detail: "Dragon Hoard" }),
  ]);
  assert.equal(h.looted, 1);
});

test("the dump's own oldest moment is what the ledger is asked from", () => {
  assert.equal(dumpOldestAt(dump()), DUMP_AT);
  const d = dump({ carried: [{ area: "depot", at: DUMP_AT - 660_000 }, { area: "bank", at: DUMP_AT - 60_000 }] });
  assert.equal(dumpOldestAt(d), DUMP_AT - 660_000);
  assert.equal(sinceStamp(d), stampAt(-660));
});

// ── Refusals: when the ledger can't place a copy, there is no count rather than a guess ──────────

test("a loot-and-combine since the dump makes the item unknown — it used up copies the log doesn't count", () => {
  const found = heldCounts(["Embroidered Black Cape"], dump(), [move("Embroidered Black Cape +1", 30, { fate: "combined", detail: "Embroidered Black Cape +5" })]).get("embroidered black cape");
  assert.equal(found?.kind, "unknown");
  assert.match(describeHeld(found!, { now: NOW, formatAt: String }), /upgrade combine/);
});

test("a combine from before the dump doesn't matter — the dump has its result", () => {
  assert.equal(counted("Embroidered Black Cape", dump(), [move("Embroidered Black Cape +1", -30, { fate: "combined" })]).held, 0);
});

test("a drop stored where the dump doesn't look (the currency tab) makes the item unknown", () => {
  const found = heldCounts(["Mote of Minor Potential"], dump(), [move("Mote of Minor Potential", 30, { fate: "stored", detail: "currency" })]).get("mote of minor potential");
  assert.equal(found?.kind, "unknown");
  assert.match(describeHeld(found!, { now: NOW, formatAt: String }), /currency/);
});

test("an unknown item doesn't spoil the others", () => {
  const out = heldCounts(["Bone Chips", "Mote of Minor Potential"], dump(), [move("Mote of Minor Potential", 30, { fate: "stored", detail: "currency" })]);
  assert.equal(out.get("bone chips")?.kind, "counted");
  assert.equal(out.get("mote of minor potential")?.kind, "unknown");
});

test("only the names asked for are counted, and a blank name is not one", () => {
  const out = heldCounts(["Bone Chips", "  ", ""], dump(), [move("Gnoll Fang", 30)]);
  assert.deepEqual([...out.keys()], ["bone chips"]);
});

test("a ledger row for an unlisted item changes nothing", () => {
  assert.equal(counted("Bone Chips", dump(), [move("Gnoll Fang", 30, { qty: 9 })]).held, 651);
});

// ── The explanation ─────────────────────────────────────────────────────────

const fmt = { now: NOW, formatAt: () => "12:05 AM" };

test("the explanation is the sum, in order, and says what it left out", () => {
  const h = counted("Kobold Hide", dump(), [move("Kobold Hide", 30, { qty: 3 }), move("Kobold Hide", 40, { fate: "sold", detail: "x", qty: 2 })]);
  assert.equal(
    describeHeld(h, fmt),
    ["11 in your inventory dump (12:05 AM) + 3 looted since = 14", "2 more were auto-sold as they dropped, so were never in your bags."].join("\n"),
  );
});

test("a fresh dump carries no warning; an old one is called old, in the status bar's own terms", () => {
  const h = counted("Kobold Hide", dump());
  assert.doesNotMatch(describeHeld(h, { now: DUMP_AT + HOUR, formatAt: () => "t" }), /refresh/);
  assert.match(describeHeld(h, { now: DUMP_AT + 7 * HOUR, formatAt: () => "t" }), /taken 7h ago — type \/outputfile inventory/);
  assert.equal(dumpIsStale(DUMP_AT, DUMP_AT + 5 * HOUR), false);
  assert.equal(dumpIsStale(DUMP_AT, DUMP_AT + 6 * HOUR), true, "half of the 12h an inventory dump is good for");
});

// ── Against the list: which figure a row counts ─────────────────────────────

const entry = (over: Partial<ShoppingListEntry> & { name: string }): ShoppingListEntry => ({ id: over.name, needed: 1, obtained: 0, addedAt: "", ...over });

test("with no dump, nothing is derived and every row counts what it always did", () => {
  const e = entry({ name: "Bone Chips", needed: 20, obtained: 3 });
  assert.deepEqual(countEntry(e), { have: 3, source: "list", held: undefined });
  assert.deepEqual(countedEntries([e], new Map()).entries, [e]);
});

test("a row counts the larger of its own tally and the inventory's — it can raise a count, never lower one", () => {
  const held = counted("Bone Chips", dump());
  assert.deepEqual(countEntry(entry({ name: "Bone Chips", needed: 20, obtained: 3 }), held), { have: 651, source: "inventory", held });
  assert.equal(countEntry(entry({ name: "Bone Chips", needed: 20, obtained: 700 }), held).have, 700);
  assert.equal(countEntry(entry({ name: "Bone Chips", needed: 20, obtained: 700 }), held).source, "list");
});

test("when the two agree the row is the inventory's, so its note can show the sum behind the figure", () => {
  const held = counted("Bone Chips", dump());
  assert.equal(countEntry(entry({ name: "Bone Chips", needed: 20, obtained: 651 }), held).source, "inventory");
  assert.equal(countEntry(entry({ name: "Ruby", needed: 1, obtained: 0 }), counted("Ruby", dump())).source, "list", "nothing held: nothing to attribute");
});

test("a typed figure wins over the inventory, higher or lower — that is the override", () => {
  const held = counted("Bone Chips", dump());
  const typed = entry({ name: "Bone Chips", needed: 20, obtained: 4, countedByHand: true });
  assert.deepEqual(countEntry(typed, held), { have: 4, source: "hand", held });
});

test("an unknown count leaves the row alone, and keeps its reason for the row to show", () => {
  const unknown = heldCounts(["Mote of Minor Potential"], dump(), [move("Mote of Minor Potential", 30, { fate: "stored", detail: "currency" })]).get("mote of minor potential")!;
  const c = countEntry(entry({ name: "Mote of Minor Potential", needed: 5, obtained: 2 }), unknown);
  assert.deepEqual([c.have, c.source, c.held?.kind], [2, "list", "unknown"]);
});

test("a held count ticks the row and the group, through the figures everything else reads", () => {
  const list: ShoppingList = {
    entries: [
      entry({ name: "Bone Chips", needed: 4, origin: { kind: "quest", name: "Bone Chips Tome" } }),
      entry({ name: "Gnoll Fang", needed: 40, origin: { kind: "quest", name: "Bone Chips Tome" } }),
      entry({ name: "Ghoul Lord", kind: "mob" }),
    ],
    questRuns: {},
  };
  const held = heldCounts(countableNames(list.entries), dump(), [move("Gnoll Fang", 30, { qty: 3 })]);
  const { entries, counts } = countedEntries(list.entries, held);

  assert.deepEqual(entries.map((e) => e.obtained), [651, 32, 0], "chips 651 held; fangs 29 + 3 looted; the mob has no count");
  assert.equal(counts.has("Ghoul Lord"), false);
  const [group] = groupByOrigin(entries, {});
  assert.equal(satisfied(entries[0], 1), true);
  assert.equal(satisfied(entries[1], 1), false, "32 of 40");
  assert.equal(group.complete, false);
  assert.equal(group.obtained, 4 + 32, "a row's progress is capped at what it needs, as it always was");
});

test("the names asked for are each item's, once, and never a mob's", () => {
  assert.deepEqual(
    countableNames([entry({ name: "Bone Chips", id: "a" }), entry({ name: "Bone Chips", id: "b" }), entry({ name: "Ghoul Lord", kind: "mob" })]),
    ["Bone Chips"],
  );
});

test("a list saved before rows could be typed counts reads unchanged: no flag means the inventory may raise it", () => {
  // An entry exactly as the live list stores one — no `countedByHand`, an `obtained` of 2 set by hand long ago.
  const old = JSON.parse('{"id":"3abeba87","name":"Ruby","needed":1,"obtained":2,"addedAt":"2026-09-03T22:39:32.428Z","wikiPath":"/Ruby"}') as ShoppingListEntry;
  assert.equal(old.countedByHand, undefined);
  assert.equal(countEntry(old).have, 2, "no dump: exactly what it showed before");
  assert.equal(countEntry(old, counted("Ruby", dump())).have, 2, "a dump that holds none of them can't lower it");
});

// ─── One pile, however many rows want it (ADR 0387) ──────────────────────────

/** The same item under three headings — the example the rule exists for: 3 for a quest, 5 for a recipe, 2 for a second quest. */
const chipRows = (over: Partial<ShoppingListEntry>[] = [{}, {}, {}]): ShoppingListEntry[] =>
  [
    entry({ id: "a", name: "Bone Chips", needed: 3, origin: { kind: "quest", name: "Quest A" }, ...over[0] }),
    entry({ id: "b", name: "Bone Chips", needed: 5, origin: { kind: "recipe", name: "Recipe B" }, ...over[1] }),
    entry({ id: "c", name: "Bone Chips", needed: 2, origin: { kind: "quest", name: "Quest C" }, ...over[2] }),
  ];

/** The rows as they count when `n` Bone Chips are held, by row id. */
const holding = (n: number, rows: ShoppingListEntry[] = chipRows(), runs: Record<string, number> = {}) => {
  const d = dump({}, tsv(["General 1-Slot5", "Bone Chips", "13073", String(n), "11"]));
  const out = countedEntries(rows, heldCounts(countableNames(rows), d, []), runs);
  return { have: out.entries.map((e) => e.obtained), counts: out.counts, done: out.entries.map((e) => satisfied(e, 1)) };
};

test("holding 5 against 3 + 5 + 2 is 5 of the 10 needed — it fills the rows in order, not all of them", () => {
  const { have, done } = holding(5);
  assert.deepEqual(have, [3, 2, 0], "the first row is filled, the second takes the rest, the third gets none");
  assert.deepEqual(done, [true, false, false], "so not every row is ticked");
  assert.equal(have.reduce((a, b) => a + b, 0), 5, "no chip is counted twice");
});

test("holding all 10 fills every row, and holding more goes to the first row, as one row always showed what you hold", () => {
  assert.deepEqual(holding(10).have, [3, 5, 2]);
  assert.deepEqual(holding(12).have, [5, 5, 2]);
});

test("a row's own tally is chips it already has, so it comes out of the pile before the rest is shared", () => {
  // Quest A was looted full (3 of its own), and 5 are held: those 3 are among the 5, leaving 2 for the next row.
  assert.deepEqual(holding(5, chipRows([{ obtained: 3 }, {}, {}])).have, [3, 2, 0]);
  // A tally the inventory can't back up still stands — nothing is ever un-ticked.
  assert.deepEqual(holding(1, chipRows([{ obtained: 3 }, {}, {}])).have, [3, 0, 0]);
});

test("a typed figure is the player's word for its row: it takes from the pile and is never topped up", () => {
  const { have, counts } = holding(5, chipRows([{}, { obtained: 4, countedByHand: true }, {}]));
  assert.deepEqual(have, [1, 4, 0], "4 are spoken for by the typed row, so 1 is left for the first");
  assert.equal(counts.get("b")?.source, "hand");
});

test("a group set to run twice wants twice as many, and the pile is shared against that", () => {
  const rows = chipRows();
  // Quest A twice: 6, so 5 held all go to it — and nothing is left for the other two.
  assert.deepEqual(holding(5, rows, { "quest:Quest A": 2 }).have, [5, 0, 0]);
});

test("a row says it shares: how many rows want the item, and where its figure came from", () => {
  const { counts } = holding(5);
  assert.deepEqual(counts.get("a")?.shared, { rows: 3 });
  assert.equal(counts.get("a")?.source, "inventory");
  assert.equal(counts.get("c")?.source, "list", "nothing was left for it, so its own (empty) tally is the figure");
});

test("a lone row is exactly as it was: the larger of its tally and the pile, and it doesn't claim to share", () => {
  const { have, counts } = holding(12, [chipRows()[1]]);
  assert.deepEqual(have, [12]);
  assert.equal(counts.get("b")?.shared, undefined);
});

test("different items never share, and a mob has no count to share", () => {
  const rows = [entry({ id: "x", name: "Bone Chips", needed: 3 }), entry({ id: "y", name: "Gnoll Fang", needed: 3 }), entry({ id: "m", name: "Ghoul Lord", kind: "mob" })];
  const d = dump({}, tsv(["General 1-Slot5", "Bone Chips", "13073", "5", "11"], ["General 2-Slot6", "Gnoll Fang", "13915", "4", "11"]));
  const out = countedEntries(rows, heldCounts(countableNames(rows), d, []));
  assert.deepEqual(out.entries.map((e) => e.obtained), [5, 4, 0], "each item's own pile, whole");
  assert.equal(out.counts.has("m"), false);
});

test("a grade and a case are the same item to the pile, so rows spelling it differently still share", () => {
  const rows = [entry({ id: "x", name: "Bone Chips", needed: 3 }), entry({ id: "y", name: "bone chips +2", needed: 5 })];
  const d = dump({}, tsv(["General 1-Slot5", "Bone Chips", "13073", "4", "11"]));
  assert.deepEqual(countedEntries(rows, heldCounts(countableNames(rows), d, [])).entries.map((e) => e.obtained), [3, 1]);
});

test("an unknown count shares nothing — each row keeps its own figure", () => {
  const rows = chipRows([{ obtained: 1 }, { obtained: 2 }, {}]);
  const unknown = heldCounts(["Bone Chips"], dump({}, tsv(["General 1-Slot5", "Bone Chips", "13073", "5", "11"])), [move("Bone Chips", 30, { fate: "combined" })]);
  assert.equal(unknown.get("bone chips")?.kind, "unknown");
  assert.deepEqual(countedEntries(rows, unknown).entries.map((e) => e.obtained), [1, 2, 0]);
});
