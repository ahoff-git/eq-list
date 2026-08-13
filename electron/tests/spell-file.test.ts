/**
 * Black-box tests for the `spells_us.txt` reader.
 *
 * The fixture (`fixtures/spells_us_sample.txt`) is **synthetic** — built to the layout documented
 * in eql-info's `SPELL_FORMAT.md` and cross-checked against eql-log-reader's independent reading
 * of the same columns — because no real spell file ships with this repo and one never will: it's
 * the player's own game data. That's the honest limit of these tests. They pin *our* reading of a
 * documented format; they cannot prove the format. Confirming that needs a real install, which is
 * why it's on the manual-QA list.
 *
 * What they do pin is everything that would silently produce a wrong number: which column is mana,
 * that the 255 sentinel means "can't cast" rather than "level 255", and that a name shared with an
 * out-of-era spell resolves to the one a player can actually hold.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  isObtainable,
  parseSpellFile,
  parseSpellLine,
  MAX_LEVEL,
} from "../../src/shared/spell-file";

const FIXTURE = path.join(__dirname, "../../../fixtures/spells_us_sample.txt");
const catalog = () => parseSpellFile(fs.readFileSync(FIXTURE, "utf8"));

test("a row yields the facts the log can't tell us", () => {
  const spells = catalog();
  const burst = spells.get("burst of fire");
  assert.ok(burst);
  assert.equal(burst.id, 1);
  assert.equal(burst.mana, 7);
  assert.equal(burst.castMs, 1500);
  assert.equal(burst.beneficial, false);
});

test("a heal is marked beneficial, a nuke isn't", () => {
  const spells = catalog();
  assert.equal(spells.get("minor healing")?.beneficial, true);
  assert.equal(spells.get("shock of lightning")?.beneficial, false);
});

test("zero mana is a fact, not a missing value", () => {
  // A bard song genuinely costs nothing; it must not read as "unknown".
  const song = catalog().get("chant of battle");
  assert.equal(song?.mana, 0);
});

test("only classes that can cast it get a level, and 255 is not a level", () => {
  const burst = catalog().get("burst of fire");
  assert.deepEqual(burst?.levels, { Magician: 1, Wizard: 2 });
  // Every other class was 255 in the fixture and must be absent rather than present-and-huge.
  assert.equal(Object.keys(burst!.levels).length, 2);
});

test("each rank is its own spell with its own cost", () => {
  // This is what makes an exact per-rank mana figure possible at all: the file lists them apart.
  const spells = catalog();
  assert.equal(spells.get("shock of lightning")?.mana, 20);
  assert.equal(spells.get("shock of lightning vi")?.mana, 110);
});

test("a spell nobody on this server can reach is not obtainable", () => {
  const spells = catalog();
  assert.equal(isObtainable(spells.get("chant of battle")!), true);
  assert.equal(isObtainable(spells.get("ancient doom")!), false, "no class can cast it");
});

test("a shared name resolves to the row a player can actually hold", () => {
  // The file carries out-of-era and NPC versions under names players also use. Taking the wrong
  // row means quoting a mana cost nobody ever pays.
  const flame = catalog().get("burst of flame");
  assert.equal(flame?.id, 7, "the level-110 version must lose to the level-2 one");
  assert.equal(flame?.mana, 9);
});

test("the level cap is what makes that choice, and it's the server's", () => {
  assert.equal(MAX_LEVEL, 50);
});

test("junk rows cost themselves, not the file", () => {
  assert.equal(parseSpellLine(""), null);
  assert.equal(parseSpellLine("# a comment"), null);
  assert.equal(parseSpellLine("1^Too Short^2^3"), null, "a truncated row is not a spell");
  assert.equal(parseSpellLine("^^^"), null);
  // A file with a broken row in the middle still yields the rows around it.
  const spells = parseSpellFile("not a spell\n" + fs.readFileSync(FIXTURE, "utf8"));
  assert.ok(spells.get("burst of fire"));
});

test("a non-numeric field reads as zero rather than NaN", () => {
  const fields = new Array(60).fill("0");
  fields[0] = "42";
  fields[1] = "Odd Spell";
  fields[14] = "not-a-number";
  for (let i = 0; i < 16; i++) fields[36 + i] = "255";
  const spell = parseSpellLine(fields.join("^"));
  assert.equal(spell?.mana, 0, "NaN must never reach a per-mana division");
});
