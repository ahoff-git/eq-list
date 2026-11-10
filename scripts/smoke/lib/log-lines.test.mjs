import { test } from "node:test";
import assert from "node:assert/strict";

import { eqStamp, factionHitTexts, sampleTexts, stampLines, unstamped } from "./log-lines.mjs";

test("a stamp is the game's own shape, in local time", () => {
  assert.equal(eqStamp(new Date(2026, 10, 9, 13, 5, 11)), "[Mon Nov 09 13:05:11 2026]");
  assert.equal(eqStamp(new Date(2026, 0, 3, 0, 0, 0)), "[Sat Jan 03 00:00:00 2026]");
});

test("lines are stamped one second apart", () => {
  const lines = stampLines(["a", "b", "c"], new Date(2026, 10, 9, 13, 59, 58));
  assert.deepEqual(lines, ["[Mon Nov 09 13:59:58 2026] a", "[Mon Nov 09 13:59:59 2026] b", "[Mon Nov 09 14:00:00 2026] c"]);
});

test("removing a stamp leaves the text, and leaves an unstamped line alone", () => {
  assert.equal(unstamped("[Mon Nov 09 13:05:11 2026] You gain experience!!"), "You gain experience!!");
  assert.equal(unstamped("no stamp here"), "no stamp here");
});

test("faction hits use the game's wording and no two neighbours are the same row", () => {
  const texts = factionHitTexts(60);
  assert.equal(texts.length, 60);
  for (const text of texts) assert.match(text, /^Your faction standing with .+ has been adjusted by -?\d+\.$/);
  for (let i = 1; i < texts.length; i++) assert.notEqual(texts[i], texts[i - 1]);
  assert.notEqual(texts[0], texts[26], "page 1's first row must differ from page 2's");
});

test("the sample log reads as bare texts without blank lines", () => {
  const texts = sampleTexts("[Mon Jul 20 19:02:11 2026] Welcome to EverQuest!\r\n\r\n[Mon Jul 20 19:02:14 2026] You have entered Everfrost Peaks.\n");
  assert.deepEqual(texts, ["Welcome to EverQuest!", "You have entered Everfrost Peaks."]);
});
