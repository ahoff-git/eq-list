/**
 * Black-box tests for what a pick changes against what is worn in its slot (`src/shared/items/slot-change.ts`).
 * Only need re-running if that module or `derived-stats.ts` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveOf, replacements, slotCell, type WornPiece } from "../../src/shared/items/slot-change";
import { derivedRates } from "../../src/shared/items/derived-stats";

const piece = (id: string, slot: string, title: string, stats: WornPiece["stats"]): WornPiece => ({ id, slot, title, stats });
const pick = (slotIndex: number, id: string, slot: string) => ({ slotIndex, id, slot });

// A Wizard at 50 gets 11.25 mana for every INT point — the measured figure.
const wizard = derivedRates({ classes: ["Wizard"], level: 50 });

test("a pick replaces what is worn in its slot", () => {
  const out = replacements([pick(0, "a", "HEAD")], [piece("held:1", "HEAD", "Old Cap", { ac: 10 })]);
  assert.deepEqual(out, { 0: { title: "Old Cap", stats: { ac: 10 } } });
});

test("a pick that is the very piece worn there replaces nothing, even in the other hand of a pair", () => {
  const worn = [piece("held:1", "EAR", "Stud", { int: 5 }), piece("held:2", "EAR", "Hoop", { int: 3 })];
  // The solver swapped the two: Hoop in the first ear slot, Stud in the second. Neither changed.
  assert.deepEqual(replacements([pick(3, "held:2", "EAR"), pick(4, "held:1", "EAR")], worn), {});
  // Replace one: the piece that stays is out of it, so the newcomer takes the other's place.
  assert.deepEqual(replacements([pick(3, "held:2", "EAR"), pick(4, "bank", "EAR")], worn), { 4: { title: "Stud", stats: { int: 5 } } });
});

test("a piece moved to another slot is a change in both: what takes its place replaces it, and it fills what was empty", () => {
  const cap = piece("held:1", "HEAD", "Cap", { mana: 10 });
  // The cap is now picked for an Any Slot, and a better one takes the head.
  assert.deepEqual(replacements([pick(0, "held:1", "ANY"), pick(4, "new", "HEAD")], [cap]), {
    0: { stats: {} },
    4: { title: "Cap", stats: { mana: 10 } },
  });
});

test("a slot with nothing worn replaces nothing — and with nothing worn anywhere there is no comparison at all", () => {
  assert.deepEqual(replacements([pick(0, "held:1", "HEAD"), pick(1, "b", "NECK")], [piece("held:1", "HEAD", "Cap", {})]), { 1: { stats: {} } });
  assert.deepEqual(replacements([pick(0, "a", "HEAD")], []), {}, "no dump: no '+' against an empty body");
});

test("a piece's effective figure counts what its attributes buy", () => {
  assert.deepEqual(effectiveOf({ int: 7, mana: 10 }, "mana", wizard), { value: 10 + 79, fromAttributes: 79 });
  assert.deepEqual(effectiveOf({ int: 7 }, "int", wizard), { value: 7, fromAttributes: 0 }, "INT itself is just INT");
  assert.deepEqual(effectiveOf({ mana: 10 }, "mana", []), { value: 10, fromAttributes: 0 }, "no rates, no conversion");
});

test("replacing 5 INT with 7 INT says +2 INT, and the mana that is worth", () => {
  const replaced = { title: "Plain Ring", stats: { int: 5 } };
  assert.equal(slotCell({ int: 7 }, replaced, "int", wizard).change, 2);
  const mana = slotCell({ int: 7 }, replaced, "mana", wizard);
  // 79 − 56: each side rounded to whole mana as a pool is shown.
  assert.deepEqual([mana.value, mana.change, mana.fromAttributes, mana.replaces], [79, 23, 79, "Plain Ring"]);
});

test("printed and attribute mana change together", () => {
  const cell = slotCell({ int: 7, mana: 10 }, { title: "Old", stats: { int: 5, mana: 20 } }, "mana", wizard);
  assert.deepEqual([cell.value, cell.change], [89, 13]);
});

test("a pick that gives none of a stat still shows what it costs", () => {
  const cell = slotCell({}, { title: "Old", stats: { ac: 20 } }, "ac", wizard);
  assert.deepEqual([cell.value, cell.change], [undefined, -20]);
});

test("no change is not shown — an unchanged pick, an equal one, or no dump", () => {
  assert.equal(slotCell({ ac: 5 }, undefined, "ac", wizard).change, undefined);
  assert.equal(slotCell({ ac: 5 }, { title: "Same", stats: { ac: 5 } }, "ac", wizard).change, undefined);
  assert.equal(slotCell({ ac: 5 }, { stats: {} }, "ac", wizard).change, 5, "an empty slot gains the whole piece");
});
