/**
 * Black-box tests for reading `spells_us_str.txt` and reading a sentence back to its spell.
 *
 * The fixture rows are **synthetic**, built to the layout the file's own header states — the same
 * rule `spells_us_sample.txt` follows and for the same reason (the file is Daybreak's, not ours to
 * commit). Their *content* is real, though: every sentence below was read off a live install, so the
 * shapes being asserted are the shapes the game actually prints. `spell-strings.live.test.ts` closes
 * the remaining gap by asserting the same things against an install when there is one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBuffLexicon,
  normalizeSentence,
  parseSpellStringFile,
  parseSpellStringLine,
  NO_LEXICON,
} from "../../src/shared/spell-strings";
import type { SpellFacts } from "../../src/shared/spell-file";

/** A spell as the facts file yields one. Obtainable and beneficial unless a test says otherwise. */
function spell(id: number, name: string, over: Partial<SpellFacts> = {}): SpellFacts {
  return {
    id,
    name,
    mana: 10,
    castMs: 1000,
    recoveryMs: 1500,
    recastMs: 0,
    levels: { Druid: 7 },
    beneficial: true,
    permanent: false,
    ...over,
  };
}

/** The header, and five rows copied in shape (and wording) from a real file. */
const FIXTURE = [
  "#SPELLINDEX^CASTERMETXT^CASTEROTHERTXT^CASTEDMETXT^CASTEDOTHERTXT^SPELLGONE^",
  "278^^^You feel the spirit of wolf enter you.^ is surrounded by a brief lupine aura.^The spirit of wolf leaves you.^",
  "254^^^Your fist bursts into flame.^'s fist bursts into flame.^Your hand is extinguished.^",
  "256^^^Your skin sprouts brambles.^ is surrounded by a thorny barrier.^The brambles fall away.^",
  "356^^^Your skin sprouts brambles.^ is surrounded by a thorny barrier.^The brambles fall away.^",
  // Burnout: a pet buff that lands with a sentence and fades in total silence.
  "327^^^^ goes berserk.^^",
].join("\n");

test("a row becomes its three sentences, and the header is not a row", () => {
  assert.equal(parseSpellStringLine(FIXTURE.split("\n")[0]), null);
  const sow = parseSpellStringLine(FIXTURE.split("\n")[1]);
  assert.deepEqual(sow, {
    id: 278,
    onYou: "You feel the spirit of wolf enter you.",
    onOther: " is surrounded by a brief lupine aura.",
    gone: "The spirit of wolf leaves you.",
  });
});

test("the leading space and the possessive are kept — they are how a name is read back", () => {
  const firefist = parseSpellStringLine(FIXTURE.split("\n")[2]);
  // Trimming this would silently make "Bloop's fist bursts into flame." unparseable.
  assert.equal(firefist?.onOther, "'s fist bursts into flame.");
});

test("a row with nothing to say is not kept, and junk costs only itself", () => {
  assert.equal(parseSpellStringLine("999^^^^^^"), null);
  assert.equal(parseSpellStringLine(""), null);
  assert.equal(parseSpellStringLine("not-a-number^^^x^^^"), null);
  assert.equal(parseSpellStringLine("12^too^short"), null);
  // A whole file survives a bad row.
  const map = parseSpellStringFile(`${FIXTURE}\nbroken\n`);
  assert.equal(map.size, 5);
});

test("normalizing is length-preserving, which is what lets a name be sliced off the front", () => {
  const raw = "  The Brambles Fall Away.  ";
  assert.equal(normalizeSentence(raw), "the brambles fall away");
  // The invariant `nameInFront` depends on: fold the trimmed line and it does not change length.
  assert.equal(normalizeSentence(raw).length, raw.trim().length - 1); // only the period goes
});

/** The lexicon under test, with the five fixture spells behind it. */
function lexicon() {
  const strings = parseSpellStringFile(FIXTURE);
  const byId = new Map<number, SpellFacts>([
    [278, spell(278, "Spirit of Wolf")],
    [254, spell(254, "Firefist")],
    [256, spell(256, "Shield of Thistles")],
    [356, spell(356, "Shield of Thorns", { levels: { Druid: 47 } })],
    [327, spell(327, "Burnout")],
  ]);
  return buildBuffLexicon(strings, byId);
}

test("a fade sentence reads back to its spell", () => {
  const found = lexicon().fadedBy("The spirit of wolf leaves you.");
  assert.deepEqual(
    found.map((s) => s.name),
    ["Spirit of Wolf"],
  );
});

test("a sentence two spells share returns both, in the file's order", () => {
  // The case the whole design turns on: 358 obtainable fade sentences are shared, and these two are
  // a real pair. Returning one of them would be a coin toss dressed as an answer.
  const found = lexicon().fadedBy("The brambles fall away.");
  assert.deepEqual(
    found.map((s) => s.name),
    ["Shield of Thistles", "Shield of Thorns"],
  );
});

test("a sentence nobody writes finds nothing, and that is not an error", () => {
  assert.deepEqual(lexicon().fadedBy("Your legs itch."), []);
  // Burnout's SPELLGONE is empty, so nothing indexes it — a spell can fade in silence.
  assert.deepEqual(lexicon().fadedBy(""), []);
});

test("a landing on you reads back to its spell", () => {
  const found = lexicon().landedOnYou("You feel the spirit of wolf enter you.");
  assert.deepEqual(
    found.map((s) => s.name),
    ["Spirit of Wolf"],
  );
});

test("a landing on somebody else yields the name off the front, spelled as the log spelled it", () => {
  const spaced = lexicon().landedOnOther("Bloop is surrounded by a brief lupine aura.");
  assert.equal(spaced?.target, "Bloop");
  assert.deepEqual(
    spaced?.spells.map((s) => s.name),
    ["Spirit of Wolf"],
  );
  // The possessive form: the apostrophe belongs to the suffix, so the name comes back clean.
  const possessive = lexicon().landedOnOther("Kainos's fist bursts into flame.");
  assert.equal(possessive?.target, "Kainos");
});

test("a mob with an article, and a pet, keep their own spelling", () => {
  assert.equal(lexicon().landedOnOther("a pledge familiar goes berserk.")?.target, "a pledge familiar");
  assert.equal(lexicon().landedOnOther("Kainos`s warder goes berserk.")?.target, "Kainos`s warder");
});

test("the same sentence with nobody in front of it is not a landing on somebody else", () => {
  // "Your skin sprouts brambles." is the on-*you* wording; the on-other suffix must not match it
  // with an empty name and file the buff on nobody.
  assert.equal(lexicon().landedOnOther(" is surrounded by a thorny barrier."), null);
  assert.equal(lexicon().landedOnOther("Your fist bursts into flame."), null);
});

test("a line that merely ends the same way is not a landing", () => {
  assert.equal(lexicon().landedOnOther("You have entered The Lake of Ill Omen."), null);
  assert.equal(lexicon().landedOnOther("Bloop tells you, 'goes berserk.'"), null);
});

test("landsQuietly is the wait-or-not question, asked of the spell", () => {
  const lex = lexicon();
  // Spirit of Wolf announces itself, so a caller watching a cast should wait for the target.
  assert.equal(lex.landsQuietly("Spirit of Wolf"), false);
  // Burnout has a landing sentence too (for the pet), so it also announces.
  assert.equal(lex.landsQuietly("Burnout"), false);
  // A spell the file says nothing about at all.
  assert.equal(lex.landsQuietly("Complete Heal"), true);
  // Rank-insensitive: the answer is a property of the spell, not of the tier.
  assert.equal(lex.landsQuietly("Spirit of Wolf II"), false);
});

test("out-of-era and detrimental spells never claim a sentence", () => {
  const strings = parseSpellStringFile(FIXTURE);
  const byId = new Map<number, SpellFacts>([
    // A level-70 version of the same name: obtainable nowhere on this server.
    [278, spell(278, "Spirit of Wolf", { levels: { Druid: 70 } })],
    // Beneficial-looking sentence on a detrimental spell: a debuff landing is not our business.
    [254, spell(254, "Firefist", { beneficial: false })],
  ]);
  const lex = buildBuffLexicon(strings, byId);
  assert.deepEqual(lex.fadedBy("The spirit of wolf leaves you."), []);
  assert.deepEqual(lex.landedOnYou("Your fist bursts into flame."), []);
  assert.equal(lex.size, 0);
});

test("an id the facts file never yielded is simply unknown", () => {
  // A row too short to parse in `spells_us.txt` leaves no facts, so there is nothing to gate on and
  // nothing to index — better silent than indexed on a guess.
  const lex = buildBuffLexicon(parseSpellStringFile(FIXTURE), new Map());
  assert.equal(lex.size, 0);
  assert.deepEqual(lex.fadedBy("The spirit of wolf leaves you."), []);
});

test("with no install at all, every question has an answer", () => {
  assert.deepEqual(NO_LEXICON.fadedBy("anything"), []);
  assert.deepEqual(NO_LEXICON.landedOnYou("anything"), []);
  assert.equal(NO_LEXICON.landedOnOther("anything"), null);
  // True, not false: with no landing lines to wait for, a cast is the only evidence there will be.
  assert.equal(NO_LEXICON.landsQuietly("Spirit of Wolf"), true);
  assert.equal(NO_LEXICON.size, 0);
});
