/**
 * Black-box tests for reading who the Inventory window says you are (`src/shared/items/stats-identity.ts`):
 * the name, level and classes in its top-right corner.
 *
 * Small hand-built corners say what each rule is for; `fixtures/stats-window-words.json` is the real thing —
 * the word boxes Tesseract produced from a player's own screenshots of the whole window (the name swapped for
 * a stand-in). The recogniser's failure here is the `/` between class codes: read as an `I`
 * (`WIZIDRUMAG`) in one preparation and dropped (`WIZDRUMAG`) in the other, on every real shot.
 *
 * Only need re-running if `stats-identity.ts`, `ocr-rows.ts` or `class-names.ts` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeClasses, readIdentity, sameCharacter } from "../../src/shared/items/stats-identity";
import type { OcrWord } from "../../src/shared/chrome/ocr-rows";
import windows from "./fixtures/stats-window-words.json";

const word = (text: string, x0: number, row: number, confidence = 95): OcrWord => ({ text, x0, x1: x0 + text.length * 14, y0: row * 48, y1: row * 48 + 30, confidence });

/** The corner as the recogniser might give it: a name, then a level and a run of codes below it. */
const corner = (level: string | null, run: string, over: Partial<{ name: string; levelConfidence: number; runConfidence: number }> = {}): OcrWord[] => [
  word(over.name ?? "Kainos", 600, 1),
  ...(level ? [word(level, 600, 2, over.levelConfidence ?? 96)] : []),
  word(run, level ? 600 + level.length * 14 + 40 : 600, 2, over.runConfidence ?? 70),
  word("NEXT", 600, 3),
  word("LEVEL", 700, 3),
];

const WIZ_DRU_MAG = ["Wizard", "Druid", "Magician"];

// ── the vocabulary ──

test("the codes decode however the / between them was read — as itself, an I, a 1, a l, a |, a !, or nothing", () => {
  for (const run of ["WIZ/DRU/MAG", "WIZIDRUMAG", "WIZ1DRU1MAG", "WIZlDRUlMAG", "WIZ|DRU|MAG", "WIZ!DRU!MAG", "WIZDRUMAG", "wiz/dru/mag", "WIZ / DRU / MAG"]) {
    assert.deepEqual(decodeClasses(run), { classes: WIZ_DRU_MAG, exact: true }, run);
  }
});

test("a character may have fewer than three classes, and none is not a class run", () => {
  assert.deepEqual(decodeClasses("BRD")?.classes, ["Bard"]);
  assert.deepEqual(decodeClasses("WAR/CLR")?.classes, ["Warrior", "Cleric"]);
  assert.equal(decodeClasses(""), undefined);
  assert.equal(decodeClasses("///"), undefined);
});

test("more than three, or the same one twice, is a misread, not a character", () => {
  assert.equal(decodeClasses("WIZ/DRU/MAG/ENC"), undefined);
  assert.equal(decodeClasses("WIZ/WIZ/MAG"), undefined);
});

test("a code with one letter wrong is decoded only when exactly one code is that close — and never as exact", () => {
  assert.deepEqual(decodeClasses("WlZ/DRU/MAG"), { classes: WIZ_DRU_MAG, exact: false });
  // SHx is one letter from both SHD and SHM: nothing says which, so it is not guessed.
  assert.equal(decodeClasses("SHX/DRU/MAG"), undefined);
});

test("a run that is not made of codes is not decoded — and a word that starts like one is never believed", () => {
  assert.equal(decodeClasses("Weight"), undefined);
  assert.equal(decodeClasses("WIZ/DRU/MA"), undefined, "a code cut short");
  // "ARD" is a letter from BRD, so WIZARD decodes — as a guess, which is never applied.
  assert.equal(decodeClasses("WIZARD")?.exact, false);
});

// ── the corner ──

test("a level and a run of codes under a name is who you are", () => {
  assert.deepEqual(readIdentity([corner("31", "WIZ/DRU/MAG")]), { name: "Kainos", level: 31, classes: WIZ_DRU_MAG, unsure: [] });
});

test("the codes are found when the recogniser split the run in two words, or fused the level to it", () => {
  const split = [word("Kainos", 600, 1), word("31", 600, 2), word("WIZIDRU", 660, 2), word("MAG", 800, 2)];
  assert.deepEqual(readIdentity([split])?.classes, WIZ_DRU_MAG);
  const fused = [word("Kainos", 600, 1), word("31WIZIDRUMAG", 600, 2)];
  const who = readIdentity([fused]);
  assert.deepEqual([who?.level, who?.classes], [31, WIZ_DRU_MAG]);
});

test("a crop without the corner says nothing — a drag over the stats alone is not a failure", () => {
  assert.equal(readIdentity([[word("Strength", 0, 0), word("74/510", 200, 0)]]), undefined);
  assert.equal(readIdentity([]), undefined);
  assert.equal(readIdentity([[]]), undefined);
});

test("three letters that merely look like a code, with no level beside them, are not a class", () => {
  // "MAG" alone on a row — a stray word, or an item named for one — isn't a character.
  assert.equal(readIdentity([[word("Hat", 0, 0), word("MAG", 100, 0)]]), undefined);
  assert.equal(readIdentity([[word("WIZ/DRU/MAG", 0, 0)]]), undefined);
  // And a number far from the run is some other number.
  assert.equal(readIdentity([[word("26", 0, 0), word("WIZ/DRU/MAG", 900, 0)]]), undefined);
});

test("a code guessed by a letter is shown but never believed — unsure, with what was seen", () => {
  const who = readIdentity([corner("31", "WlZ/DRU/MAG")]);
  assert.deepEqual(who?.classes, []);
  assert.deepEqual(who?.unsure, ["classes"]);
  assert.equal(who?.saw, "WlZ/DRU/MAG");
  assert.equal(who?.level, 31, "the level is its own question");
});

test("two preparations that decode to different classes are not believed", () => {
  const who = readIdentity([corner("31", "WIZ/DRU/MAG"), corner("31", "WIZ/DRU/MNK")]);
  assert.deepEqual(who?.classes, []);
  assert.deepEqual(who?.unsure, ["classes"]);
});

test("a pass that could not decode the run does not spoil one that could", () => {
  const who = readIdentity([corner("31", "W1ZDRUMAG!!!X"), corner("31", "WIZDRUMAG")]);
  assert.deepEqual(who?.classes, WIZ_DRU_MAG);
});

test("a level that is not a level is unsure — 0 and 99 are not on any character", () => {
  assert.deepEqual(readIdentity([corner("99", "WIZ/DRU/MAG")])?.unsure, ["level"]);
  assert.deepEqual(readIdentity([corner("0", "WIZ/DRU/MAG")])?.unsure, ["level"]);
  assert.equal(readIdentity([corner("60", "WIZ/DRU/MAG")])?.level, 60);
});

test("a level the recogniser was unsure of is believed only when a second preparation agrees", () => {
  const shaky = corner("31", "WIZ/DRU/MAG", { levelConfidence: 30 });
  assert.deepEqual(readIdentity([shaky])?.unsure, ["level"]);
  assert.equal(readIdentity([shaky])?.level, undefined);
  assert.equal(readIdentity([shaky, shaky])?.level, 31);
  assert.deepEqual(readIdentity([corner("31", "WIZ/DRU/MAG"), corner("32", "WIZ/DRU/MAG")])?.unsure, ["level"], "two reads, two answers");
});

test("a level the recogniser dropped takes the classes with it — the number is what makes the run a class line", () => {
  assert.equal(readIdentity([corner(null, "WIZ/DRU/MAG")]), undefined);
});

test("the name is the confident letters above the level — not a scrap, not another column", () => {
  assert.equal(readIdentity([corner("31", "WIZ/DRU/MAG", { name: "Kainos" })])?.name, "Kainos");
  assert.equal(readIdentity([corner("31", "WIZ/DRU/MAG", { name: "K4inos" })])?.name, undefined, "digits aren't a name");
  const faint = corner("31", "WIZ/DRU/MAG").map((w) => (w.text === "Kainos" ? { ...w, confidence: 30 } : w));
  assert.equal(readIdentity([faint])?.name, undefined);
  const elsewhere = corner("31", "WIZ/DRU/MAG").map((w) => (w.text === "Kainos" ? { ...w, x0: 5, x1: 90 } : w));
  assert.equal(readIdentity([elsewhere])?.name, undefined, "a word far to the side is not the one over the level");
});

// ── the real thing ──

type Words = { soft: OcrWord[]; strict: OcrWord[] };
const real = windows as unknown as Record<string, Words>;
const LEVELS: Record<string, number> = { "level 31, whole window (shot 1)": 31, "level 31, whole window (shot 2)": 31, "level 32, damaged, whole window": 32 };

for (const [name, level] of Object.entries(LEVELS)) {
  for (const [label, passes] of [
    ["soft alone (the / read as an I)", (w: Words) => [w.soft]],
    ["strict alone (the / dropped)", (w: Words) => [w.strict]],
    ["both preparations", (w: Words) => [w.soft, w.strict]],
  ] as const) {
    test(`real OCR, ${name}, ${label}: ${level}, Wizard / Druid / Magician`, () => {
      assert.deepEqual(readIdentity(passes(real[name])), { name: "Testix", level, classes: WIZ_DRU_MAG, unsure: [] });
    });
  }
}

// ── your window or an alt's ──

test("the same character, allowing a letter the recogniser got wrong — but not a different short name", () => {
  assert.ok(sameCharacter("Kainos", "Kainos"));
  assert.ok(sameCharacter("kainos", "Kainos"));
  assert.ok(sameCharacter("Kalnos", "Kainos"), "an i read as an l");
  assert.ok(sameCharacter("Kainoss", "Kainos"), "a stray letter");
  assert.ok(!sameCharacter("Kaznas", "Kainos"), "two letters off is another name");
  assert.ok(!sameCharacter("Xanthe", "Kainos"));
  assert.ok(!sameCharacter("Bob", "Bab"), "short names have no room for a misread");
});
