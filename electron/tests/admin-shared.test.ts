/**
 * `coerceAdminValue` is the one guard between a structured field editor and a raw JSON blob wearing
 * a form: it decides whether what got typed matches the field it's replacing.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminFieldType, coerceAdminValue, foldAdminEdit } from "../../src/shared/admin";

test("a number field accepts a number and refuses anything that isn't one", () => {
  assert.deepEqual(coerceAdminValue(5, "12"), { ok: true, value: 12 });
  assert.deepEqual(coerceAdminValue(5, "-3.5"), { ok: true, value: -3.5 });
  for (const bad of ["", "twelve", "12abc", "NaN", "Infinity"]) {
    assert.equal(coerceAdminValue(5, bad).ok, false, bad);
  }
});

test("a boolean field only accepts the two literal words", () => {
  assert.deepEqual(coerceAdminValue(true, "false"), { ok: true, value: false });
  assert.deepEqual(coerceAdminValue(false, "true"), { ok: true, value: true });
  for (const bad of ["", "1", "yes", "True"]) {
    assert.equal(coerceAdminValue(true, bad).ok, false, bad);
  }
});

test("a string (or null) field takes free text, and empty text clears it", () => {
  assert.deepEqual(coerceAdminValue("Blackburrow", "Qeynos Hills"), { ok: true, value: "Qeynos Hills" });
  assert.deepEqual(coerceAdminValue("Blackburrow", ""), { ok: true, value: null });
  assert.deepEqual(coerceAdminValue(null, "Blackburrow"), { ok: true, value: "Blackburrow" });
});

test("adminFieldType reads a field's type off its live value", () => {
  assert.equal(adminFieldType(5), "number");
  assert.equal(adminFieldType(true), "boolean");
  assert.equal(adminFieldType(null), "null");
  assert.equal(adminFieldType(undefined), "null");
  assert.equal(adminFieldType("x"), "string");
});

test("foldAdminEdit starts a trail from nothing, and appends to one already there", () => {
  const first = foldAdminEdit(undefined, { field: "zone", from: "bad", to: "Blackburrow", at: "t1" });
  assert.deepEqual(first, { edited: true, history: [{ field: "zone", from: "bad", to: "Blackburrow", at: "t1" }] });

  const second = foldAdminEdit(first, { field: "mob", from: "a gnoll", to: "a gnoll pup", at: "t2" });
  assert.equal(second.history.length, 2);
  assert.deepEqual(second.history[0], first.history[0], "the earlier edit is kept, not replaced");
});
