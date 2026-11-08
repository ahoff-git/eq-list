/**
 * Black-box tests for rebuilding rows from OCR word boxes (`src/shared/chrome/ocr-rows.ts`).
 * Only need re-running if that module changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { rowsOf, typicalHeight, type OcrWord } from "../../src/shared/chrome/ocr-rows";

const word = (text: string, x0: number, y0: number, height = 30): OcrWord => ({ text, x0, x1: x0 + text.length * 14, y0, y1: y0 + height, confidence: 90 });

test("words on one line are one row, read left to right — whatever order they arrived in", () => {
  const rows = rowsOf([word("1976/1976", 300, 0), word("HP", 0, 2), word("74/510", 900, 1), word("Strength", 600, 0)]);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].words.map((w) => w.text), ["HP", "1976/1976", "Strength", "74/510"]);
});

test("rows run top to bottom", () => {
  const rows = rowsOf([word("Mana", 0, 96), word("HP", 0, 48), word("End", 0, 144), word("Title", 0, 0)]);
  assert.deepEqual(rows.map((r) => r.words[0].text), ["Title", "HP", "Mana", "End"]);
});

test("a descender or a tall glyph does not split a row — tolerance is half a word's height", () => {
  // "Regen" has a descender and sits a few pixels lower than "HP" on the same line.
  const rows = rowsOf([word("HP", 0, 0), word("Regen", 40, 6), word("18", 300, 0)]);
  assert.equal(rows.length, 1);
});

test("neighbouring lines stay apart when they are a line's spacing from each other", () => {
  const rows = rowsOf([word("HP", 0, 0), word("Mana", 0, 48)]);
  assert.equal(rows.length, 2);
});

test("it is the same at any enlargement — everything is relative to the words' own height", () => {
  const at = (k: number) => rowsOf([word("HP", 0, 0 * k, 30 * k), word("Mana", 0, 48 * k, 30 * k), word("1976", 200 * k, 3 * k, 30 * k)]).map((r) => r.words.map((w) => w.text));
  assert.deepEqual(at(1), at(3));
  assert.deepEqual(at(1), [["HP", "1976"], ["Mana"]]);
});

test("a row's position is the middle of its words", () => {
  const [row] = rowsOf([word("HP", 0, 10, 30), word("1976", 100, 10, 30)]);
  assert.equal(row.y, 25);
});

test("no words, no rows", () => {
  assert.deepEqual(rowsOf([]), []);
  assert.equal(typicalHeight([]), 0);
});

test("the typical height is the middle one, so one tall stray doesn't set the scale", () => {
  assert.equal(typicalHeight([word("a", 0, 0, 30), word("b", 0, 0, 31), word("c", 0, 0, 90)]), 31);
});
