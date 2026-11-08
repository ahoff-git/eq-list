/**
 * Black-box tests for reading the Inventory window's stats page back from OCR (`src/shared/items/stats-page.ts`).
 *
 * Two kinds of evidence. Small hand-built pages say what each rule is for — which label owns which number,
 * how a lost `/` is repaired, when a read is only a guess. And `fixtures/stats-page-words.json` is the real
 * thing: the word boxes Tesseract produced from a player's own screenshots of the page (two scroll positions
 * of one level-31 character, and a noisy copy), prepared the way the app prepares them. If the parser changes,
 * those are what must still come out right.
 *
 * Only need re-running if `stats-page.ts`, `ocr-rows.ts` or `fuzzy.ts` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { confidentValues, readStatsPage } from "../../src/shared/items/stats-page";
import type { OcrWord } from "../../src/shared/chrome/ocr-rows";
import fixtures from "./fixtures/stats-page-words.json";

// ── hand-built pages ──

/** One word, `row` lines down; wide enough per letter that a gap is a gap. */
const word = (text: string, x0: number, row: number, confidence = 95): OcrWord => ({ text, x0, x1: x0 + text.length * 14, y0: row * 48, y1: row * 48 + 30, confidence });

/** A page from rows of [text, x] words. Left column near x=0, right column near x=600. */
const page = (rows: [string, number][][]): OcrWord[] => rows.flatMap((cells, row) => cells.map(([text, x]) => word(text, x, row)));

/** The real page's shape: left column of vitals, right column of attributes and resists. */
const REAL_SHAPE: [string, number][][] = [
  [["HP", 0], ["1976/1976", 260], ["Strength", 600], ["74/510", 880], ["+", 990], ["0", 1040]],
  [["Mana", 0], ["2840/2840", 260], ["Stamina", 600], ["137/510", 880], ["+", 990], ["0", 1040]],
  [["End", 0], ["859/859", 260], ["Intelligence", 600], ["214/510", 880], ["+", 990], ["0", 1040]],
  [["AC", 0], ["242/368", 200], ["|280", 400], ["Wisdom", 600], ["139/510", 880], ["+", 990], ["0", 1040]],
  [["Attack", 0], ["149|426", 200], ["Agility", 600], ["147/510", 880]],
  [["Attack", 0], ["Speed", 90], ["%", 190], ["100", 330], ["Dexterity", 600], ["111/510", 880]],
  [["Velocity", 0], ["0", 330], ["Charisma", 600], ["71/510", 880]],
  [["HP", 0], ["Regen", 50], ["18", 330], ["SV.", 600], ["Magic", 660], ["37/1000", 880]],
  [["Mana", 0], ["Regen", 90], ["33", 330], ["SV.", 600], ["Fire", 660], ["19/1000", 880]],
  [["End", 0], ["Regen", 70], ["42", 330], ["SV.", 600], ["Cold", 660], ["34/1000", 880]],
  [["Primary", 0], ["DPS", 108], ["SV.", 600], ["Disease", 660], ["32/1000", 880]],
  [["Secondary", 0], ["DPS", 150], ["SV.", 600], ["Poison", 660], ["41/1000", 880]],
  [["Ranged", 0], ["DPS", 110], ["SV.", 600], ["Void", 660], ["82/1000", 880]],
];

const TRUTH = { hp: 1976, mana: 2840, end: 859, ac: 242, str: 74, sta: 137, int: 214, wis: 139, agi: 147, dex: 111, cha: 71, svMagic: 37, svFire: 19, svCold: 34, svDisease: 32, svPoison: 41, svVoid: 82 };

/** The real page with one row's value words swapped for `value` (the label stays). */
function withRow(label: string, column: "left" | "right", replacement: [string, number][]): [string, number][][] {
  const rows = REAL_SHAPE.map((r) => r.map((c) => [...c] as [string, number]));
  const target = rows.find((r) => r.some(([t, x]) => t === label && (column === "left" ? x < 300 : x >= 300)));
  assert.ok(target, `no row for ${label}`);
  const labelAt = target.findIndex(([t]) => t === label);
  const [ownStart, ownEnd] = column === "left" ? [labelAt + 1, target.findIndex(([, x]) => x >= 600)] : [labelAt + 1, target.length];
  const end = ownEnd < 0 ? target.length : ownEnd;
  target.splice(ownStart, end - ownStart, ...replacement);
  return rows;
}

test("a clean page reads every stat: a pool's max, an attribute's or resist's current, AC's mitigation", () => {
  const read = readStatsPage([page(REAL_SHAPE)]);
  assert.deepEqual(read.values, TRUTH);
  assert.deepEqual([read.repaired, read.doubtful, read.missing], [[], [], []]);
});

test("a pool is its max, not what it is now — a fight or a spell dips the current", () => {
  const read = readStatsPage([page(withRow("HP", "left", [["1500/1976", 260]]))]);
  assert.equal(read.values.hp, 1976);
});

test("two columns share a row, and a label with no number doesn't swallow its neighbour's", () => {
  // "Primary DPS" has no value beside "SV. Disease 32/1000": the old line-by-line read took them for one label.
  const read = readStatsPage([page(REAL_SHAPE)]);
  assert.equal(read.values.svDisease, 32);
  assert.equal(read.values.svPoison, 41);
});

test("a regen row is not the pool it is named after", () => {
  // "HP Regen 18" and "Mana Regen 33" sit in the same rows as resists; neither is HP or mana.
  const read = readStatsPage([page(REAL_SHAPE)]);
  assert.equal(read.values.hp, 1976);
  assert.equal(read.values.mana, 2840);
});

test("the heroic bonus after the + is not the stat", () => {
  const read = readStatsPage([page(withRow("Strength", "right", [["74/510", 880], ["+", 990], ["12", 1040]]))]);
  assert.equal(read.values.str, 74);
  const fused = readStatsPage([page(withRow("Strength", "right", [["74/510+", 880], ["12", 1040]]))]);
  assert.equal(fused.values.str, 74);
});

test("another skin's wording names the same stats", () => {
  const read = readStatsPage([
    page([
      [["Endurance", 0], ["859/859", 260], ["Magic", 600], ["37/1000", 880]],
      [["Hit", 0], ["Points", 60], ["1976/1976", 260], ["Corruption", 600], ["82/1000", 880]],
      [["Armor", 0], ["Class", 80], ["242/368", 260]],
    ]),
  ]);
  assert.deepEqual(read.values, { end: 859, svMagic: 37, hp: 1976, svVoid: 82, ac: 242 });
});

test("a label OCR garbled by a letter or two still lands; a short one never matches loosely", () => {
  const read = readStatsPage([
    page([
      [["Intelllgence", 0], ["214/510", 260]],
      [["Charlsma", 0], ["71/510", 260]],
      [["Wlsdom", 0], ["139/510", 260]],
      [["AG", 0], ["77/510", 260]], // "AC", "AGI" and "STA" are all within an edit — and none of them
    ]),
  ]);
  assert.deepEqual(read.values, { int: 214, cha: 71, wis: 139 });
});

test("something that isn't a number, or isn't a plausible one, is not a stat", () => {
  const read = readStatsPage([page([[["Strength", 0], ["9999/9999", 260]], [["Stamina", 0], ["abc", 260]], [["HP", 0], ["12,345,678,901/12,345,678,901", 260]]])]);
  assert.deepEqual(read.values, {});
  assert.ok(read.missing.includes("str") && read.missing.includes("sta") && read.missing.includes("hp"));
});

test("a crop that holds only part of the page reports what it lacks", () => {
  const read = readStatsPage([page(REAL_SHAPE.slice(0, 4))]);
  assert.deepEqual(Object.keys(read.values).sort(), ["ac", "end", "hp", "int", "mana", "sta", "str", "wis"].sort());
  assert.ok(read.missing.includes("svVoid") && read.missing.includes("cha"));
  assert.equal(read.missing.length, 17 - 8);
});

test("nothing recognised is an empty read, not an error", () => {
  const read = readStatsPage([]);
  assert.deepEqual(read.values, {});
  assert.equal(read.missing.length, 17);
  assert.deepEqual(readStatsPage([[]]).values, {});
});

// ── the lost slash ──

test("a / read as a 1 is put back where the structure says it was — an attribute's max is the cap its neighbours show", () => {
  const read = readStatsPage([page(withRow("Strength", "right", [["741510", 880], ["+", 990], ["0", 1040]]))]);
  assert.equal(read.values.str, 74);
  assert.deepEqual(read.repaired, ["str"], "it was repaired, so it says so");
  assert.deepEqual(read.doubtful, [], "but the cap anchors it, so it is not a guess");
});

test("the cap is the one the page shows, not a built-in — a different cap still anchors the repair", () => {
  const read = readStatsPage([
    page([
      [["Strength", 0], ["10/300", 260]],
      [["Stamina", 0], ["20/300", 260]],
      [["Wisdom", 0], ["301300", 260]],
    ]),
  ]);
  assert.equal(read.values.wis, 30, "301300 is 30/300 where 300 is what every other row says");
  assert.deepEqual(read.doubtful, []);
});

test("a pool's repaired cell is the split with equal halves — current and max agree unless it is damaged", () => {
  const read = readStatsPage([page(withRow("HP", "left", [["197611976", 260]]))]);
  assert.equal(read.values.hp, 1976);
  assert.deepEqual(read.repaired, ["hp"]);
  assert.deepEqual(read.doubtful, []);
  assert.equal(readStatsPage([page(withRow("End", "left", [["8591859", 260]]))]).values.end, 859);
});

test("a / dropped altogether is repaired as well as one read as a 1", () => {
  const read = readStatsPage([page(withRow("Stamina", "right", [["137510", 880]]))]);
  assert.equal(read.values.sta, 137);
});

test("when the lost / could be in two places, it is a guess and says so", () => {
  // 71510 is 71/510 with the slash dropped, or 7/510 with it read as a 1: nothing in the digits says which.
  const read = readStatsPage([page(withRow("Charisma", "right", [["71510", 880]]))]);
  assert.deepEqual(read.repaired, ["cha"]);
  assert.deepEqual(read.doubtful, ["cha"]);
});

test("a lone pool number is taken as the figure but not trusted — 1976 is not 19/76", () => {
  const read = readStatsPage([page(withRow("HP", "left", [["1976", 260]]))]);
  assert.equal(read.values.hp, 1976);
  assert.deepEqual(read.doubtful, ["hp"]);
});

test("a spent pool's lost / is guessed — a 1 where the slash was, the only place it could be — and says so", () => {
  // 555/2924 has no equal halves to anchor a split. Its max is still the right-hand part.
  const read = readStatsPage([page(withRow("Mana", "left", [["55512924", 260]]))]);
  assert.equal(read.values.mana, 2924);
  assert.deepEqual(read.repaired, ["mana"]);
  assert.deepEqual(read.doubtful, ["mana"], "a guess, so never applied");
});

test("a spent pool whose current was misread as bigger than its max is not guessed at", () => {
  // 556512924 is "5565" + 1 + "2924": a current above the max, which no pool has.
  const read = readStatsPage([page(withRow("Mana", "left", [["556512924", 260]]))]);
  assert.equal(read.values.mana, undefined);
  assert.ok(read.missing.includes("mana"));
});

test("a cell a drag clipped down to one number is that number, not a guess at two — 214 is not 2 and 4", () => {
  // The box stopped before the "/510": the figure is there, the cap isn't.
  const attribute = readStatsPage([page(withRow("Intelligence", "right", [["214", 880]]))]);
  assert.equal(attribute.values.int, 214);
  assert.deepEqual(attribute.doubtful, ["int"], "unconfirmed, because the cap that would confirm it was clipped");
  // And a five-digit pool is one figure, even with a 1 inside it.
  const pool = readStatsPage([page(withRow("HP", "left", [["12115", 260]]))]);
  assert.equal(pool.values.hp, 12115);
  assert.deepEqual(pool.doubtful, ["hp"]);
});

test("AC's fused mitigation/softcap is split, but with nothing to anchor it, it is only ever a guess", () => {
  const read = readStatsPage([page(withRow("AC", "left", [["2421368", 200], ["|280", 400]]))]);
  assert.equal(read.values.ac, 242);
  assert.deepEqual(read.repaired, ["ac"]);
  assert.deepEqual(read.doubtful, ["ac"]);
});

test("AC read with its / is fine whether or not the evasion beside it was read", () => {
  assert.equal(readStatsPage([page(withRow("AC", "left", [["242/368", 200]]))]).values.ac, 242);
  const withEvasion = readStatsPage([page(withRow("AC", "left", [["242/368", 200], ["|280", 400]]))]);
  assert.deepEqual([withEvasion.values.ac, withEvasion.repaired], [242, []]);
  assert.equal(readStatsPage([page(withRow("AC", "left", [["242|368|280", 200]]))]).values.ac, 242);
});

test("an AC of three digits is never mistaken for a fused pair", () => {
  const read = readStatsPage([page(withRow("AC", "left", [["242", 200]]))]);
  assert.equal(read.values.ac, 242);
  assert.deepEqual(read.doubtful, ["ac"], "lone, so unconfirmed — but not split into 24 and 2");
});

test("an I or l where a digit should be is a 1 at the front of a figure and a divider elsewhere", () => {
  assert.equal(readStatsPage([page(withRow("Stamina", "right", [["l37/510", 880]]))]).values.sta, 137);
  assert.equal(readStatsPage([page(withRow("Stamina", "right", [["137l510", 880]]))]).values.sta, 137);
  assert.equal(readStatsPage([page(withRow("Strength", "right", [["7O/510", 880]]))]).values.str, 70, "an O in a figure is a 0");
});

// ── several passes ──

const fusedAc = withRow("AC", "left", [["2421368", 200], ["|280", 400]]);

test("a pass that read a cell cleanly beats one that only inferred it, whichever came first", () => {
  const guessed = page(fusedAc);
  const clean = page(REAL_SHAPE);
  for (const passes of [[guessed, clean], [clean, guessed]]) {
    const read = readStatsPage(passes);
    assert.equal(read.values.ac, 242);
    assert.deepEqual([read.repaired, read.doubtful], [[], []], "the clean one wins, so nothing was inferred");
  }
});

test("between two guesses the one the recogniser was surer of wins", () => {
  const wrong = page(withRow("AC", "left", [["24271368", 200]])).map((w) => (w.text === "24271368" ? { ...w, confidence: 53 } : w));
  const right = page(withRow("AC", "left", [["2421363", 200]])).map((w) => (w.text === "2421363" ? { ...w, confidence: 67 } : w));
  assert.equal(readStatsPage([wrong, right]).values.ac, 242);
  assert.equal(readStatsPage([right, wrong]).values.ac, 242);
});

test("a stat only the second pass found still comes through", () => {
  const first = page(REAL_SHAPE.slice(0, 3));
  const read = readStatsPage([first, page(REAL_SHAPE)]);
  assert.deepEqual(read.values, TRUTH);
});

test("an unsure word makes a stat doubtful even when the number looks tidy", () => {
  const read = readStatsPage([page(REAL_SHAPE).map((w) => (w.text === "137/510" ? { ...w, confidence: 40 } : w))]);
  assert.equal(read.values.sta, 137);
  assert.deepEqual(read.doubtful, ["sta"]);
});

test("a doubtful figure is shown but never applied: confidentValues leaves it out", () => {
  const read = readStatsPage([page(fusedAc)]);
  assert.equal(read.values.ac, 242);
  const sure = confidentValues(read);
  assert.equal(sure.ac, undefined);
  assert.equal(Object.keys(sure).length, 16);
  assert.equal(sure.hp, 1976);
});

// ── the real thing ──

type Words = { soft: OcrWord[]; strict: OcrWord[] };
const real = fixtures as unknown as Record<string, Words>;
// A third real screenshot, level 32 and *damaged*: HP 946/2034, mana 555/2924 and endurance 259/885 are all below
// their maxes, so a pool's "equal halves" are no help and the wanted figure is the max, not the current.
const DAMAGED = "damaged, level 32 (tight drag)";
const TRUTH_DAMAGED = { ...TRUTH, hp: 2034, mana: 2924, end: 885, ac: 243 };
const SCROLL_POSITIONS = ["scrolled to the equipment (tight drag)", "scrolled to the vitals (tight drag)"];

for (const name of SCROLL_POSITIONS) {
  test(`real OCR, ${name}: both preparations together read all seventeen, none inferred`, () => {
    const read = readStatsPage([real[name].soft, real[name].strict]);
    assert.deepEqual(read.values, TRUTH);
    assert.deepEqual([read.repaired, read.doubtful, read.missing], [[], [], []]);
  });

  test(`real OCR, ${name}: the strict preparation alone reads it cleanly`, () => {
    const read = readStatsPage([real[name].strict]);
    assert.deepEqual(read.values, TRUTH);
    assert.deepEqual(read.repaired, []);
  });

  test(`real OCR, ${name}: the soft one alone fuses AC's slash — repaired, right, and flagged as unconfirmed`, () => {
    const read = readStatsPage([real[name].soft]);
    assert.deepEqual(read.values, TRUTH, "the repair gets 242 out of 2421368");
    assert.deepEqual(read.repaired, ["ac"]);
    assert.deepEqual(read.doubtful, ["ac"]);
    assert.equal(confidentValues(read).ac, undefined, "so it would not be applied on that alone");
  });
}

test("real OCR, noisy: the soft pass inserts a stray digit into AC and is wrong — and is flagged, so it would not be applied", () => {
  const noisy = real["noisy (sensor noise 30)"];
  const alone = readStatsPage([noisy.soft]);
  assert.equal(alone.values.ac, 2427, "a wrong figure…");
  assert.ok(alone.doubtful.includes("ac"), "…that says it is a guess");
  assert.equal(confidentValues(alone).ac, undefined);
  for (const [key, value] of Object.entries(TRUTH)) if (key !== "ac") assert.equal(alone.values[key as keyof typeof alone.values], value, key);
});

test("real OCR, noisy: with both preparations the surer one's AC wins, and it is still flagged", () => {
  const noisy = real["noisy (sensor noise 30)"];
  const read = readStatsPage([noisy.soft, noisy.strict]);
  assert.deepEqual(read.values, TRUTH);
  assert.ok(read.doubtful.includes("ac"));
});

test("real OCR, damaged: a pool below its max is read as the max — HP 946/2034 is 2034, not 946", () => {
  const read = readStatsPage([real[DAMAGED].soft, real[DAMAGED].strict]);
  assert.equal(read.values.hp, 2034);
  assert.equal(read.values.end, 885);
  assert.equal(read.values.ac, 243);
});

test("real OCR, damaged: every figure comes out right, and the spent mana's lost / is a flagged guess", () => {
  const read = readStatsPage([real[DAMAGED].soft, real[DAMAGED].strict]);
  assert.deepEqual(read.values, TRUTH_DAMAGED);
  assert.deepEqual(read.repaired, ["mana"], "55512924 is 555/2924 with its slash read as a 1");
  assert.deepEqual(read.doubtful, ["mana"], "and nothing anchors that split, so it is not applied");
  assert.equal(confidentValues(read).mana, undefined);
  assert.equal(Object.keys(confidentValues(read)).length, 16);
});

test("real OCR, damaged: the soft preparation misreads the current mana as bigger than the max and gives nothing, not a wrong figure", () => {
  const read = readStatsPage([real[DAMAGED].soft]);
  assert.equal(read.values.mana, undefined);
  assert.ok(read.missing.includes("mana"));
  assert.equal(read.values.ac, 243, "AC's fused slash is still repaired");
  assert.deepEqual(read.doubtful, ["ac"]);
  for (const [key, value] of Object.entries(TRUTH_DAMAGED)) if (key !== "mana") assert.equal(read.values[key as keyof typeof read.values], value, key);
});

test("real OCR, damaged: the strict preparation alone gets the mana, as a guess, and AC cleanly", () => {
  const read = readStatsPage([real[DAMAGED].strict]);
  assert.deepEqual(read.values, TRUTH_DAMAGED);
  assert.deepEqual(read.repaired, ["mana"]);
});
