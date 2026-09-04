/**
 * `parsePastedLoc`: reading a location someone typed or pasted into the map's "paste a location"
 * field, or the location field of an existing pin's editor. Guards the one rule that makes both
 * work off a single parser — the first two numbers in the text are `y, x` — and that it's tolerant
 * of a whole `/loc` line being pasted rather than just the pair.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePastedLoc } from "../../src/shared/map/pins";

test("parsePastedLoc reads a bare y, x pair", () => {
  assert.deepEqual(parsePastedLoc("5125, -1030"), { y: 5125, x: -1030 });
});

test("parsePastedLoc tolerates loose spacing", () => {
  assert.deepEqual(parsePastedLoc("5125,-1030"), { y: 5125, x: -1030 });
  assert.deepEqual(parsePastedLoc("  5125 ,   -1030  "), { y: 5125, x: -1030 });
});

test("parsePastedLoc reads a whole /loc line, ignoring the height and the words around it", () => {
  assert.deepEqual(parsePastedLoc("Your Location is 5125.34, -1030.12, 3.50"), { y: 5125.34, x: -1030.12 });
});

test("parsePastedLoc rejects text with no number pair", () => {
  assert.equal(parsePastedLoc(""), null);
  assert.equal(parsePastedLoc("Blackburrow"), null);
  assert.equal(parsePastedLoc("5125"), null);
});
