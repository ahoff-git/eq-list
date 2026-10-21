/**
 * Black-box tests for what Search's one box finds beyond the wiki (ADR 0321): your held items, stances
 * and invocations, and AAs — each matched the way its own section matches, name matches first.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findAcross } from "../../src/shared/find/find-across";
import { filterAA, AA_LIST, NO_AA_CRITERIA } from "../../src/shared/aa/aa-list";

const total = (baseName: string, count = 1, bestGrade = 0) => ({ baseName, count, bestGrade, places: [] });

test("an empty box finds nothing", () => {
  const m = findAcross("  ", [total("Bone Chips")]);
  assert.equal(m.held.total + m.abilities.total + m.aas.total, 0);
});

test("held items match by name, and keep their best grade for the link", () => {
  const m = findAcross("gnoll", [total("Gnoll Slayer", 1, 3), total("Bone Chips", 643)]);
  assert.deepEqual(m.held.shown.map((t) => [t.baseName, t.bestGrade]), [["Gnoll Slayer", 3]]);
});

test("no inventory export: no held group, the rest still answer", () => {
  const m = findAcross("Berserker", null);
  assert.equal(m.held.total, 0);
  assert.ok(m.abilities.shown.some((a) => a.name === "Berserker" && a.kind === "stance"));
});

test("AAs match like the AAs section does, and a name match sorts first", () => {
  const m = findAcross("mesmerization", null);
  assert.equal(m.aas.total, filterAA(AA_LIST, { ...NO_AA_CRITERIA, text: "mesmerization" }).length);
  assert.ok(m.aas.shown.some((a) => a.name === "Adamant Will"), "found by its description");
  const alchemy = findAcross("alchemy", null).aas.shown;
  assert.equal(alchemy[0].name, "Alchemy Mastery");
});

test("each group shows at most the limit, and counts the rest", () => {
  const m = findAcross("mastery", null, 2);
  assert.equal(m.aas.shown.length, 2);
  assert.ok(m.aas.total > 2);
});
