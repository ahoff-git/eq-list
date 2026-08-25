/**
 * Live checks of the sentence reader against a **real** EverQuest Legends install.
 *
 * These skip unless one is configured — see `game-data.ts` for how, and for why nothing about your
 * machine ends up in the repo. `spell-strings.test.ts` next door is the everyday suite and runs
 * against a synthetic fixture; this is the one that can catch the fixture being *wrong about the
 * world*, which is the failure a synthetic fixture is structurally blind to. It caught exactly that
 * for `spells_us.txt`, where the live file had 173 columns against a reference documenting 171
 * ([ADR 0080](../../specs/decisions/0080-the-game-s-own-spell-file.md)).
 *
 * Everything asserted here is **Daybreak's game data** — spell ids, names and the sentences the game
 * prints — identical for every player and safe to write down. Nothing asserts, prints or names the
 * install path, a character, or anything out of a log.
 *
 * The figures were read off a real install on 2026-08-25. A failure means the game changed a sentence
 * (worth knowing) or **a column moved and we are decoding the wrong field** — which is otherwise a
 * confidently wrong spell name on a recast reminder.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gameFile, liveOnly } from "./game-data";
import { parseSpellCatalog } from "../../src/shared/spell-file";
import { buildBuffLexicon, parseSpellStringFile, type BuffLexicon } from "../../src/shared/spell-strings";

/** Parsed once — between them the two files are ~43 MB, and every test below wants the same result. */
let cachedLexicon: BuffLexicon | null = null;
let cachedStrings: ReturnType<typeof parseSpellStringFile> | null = null;

function strings() {
  if (!cachedStrings) cachedStrings = parseSpellStringFile(fs.readFileSync(gameFile("spells_us_str.txt"), "utf8"));
  return cachedStrings;
}

function lexicon() {
  if (!cachedLexicon) {
    const { byId } = parseSpellCatalog(fs.readFileSync(gameFile("spells_us.txt"), "utf8"));
    cachedLexicon = buildBuffLexicon(strings(), byId);
  }
  return cachedLexicon;
}

test("the real string file parses into a plausible set of sentences", liveOnly(), () => {
  const all = strings();
  // Tens of thousands of rows have something to say. A few hundred would mean we're mis-splitting.
  assert.ok(all.size > 20_000, `expected tens of thousands of sentence rows, got ${all.size}`);
  // Every row is the same width, so a truncated-row count of zero is the signal that the layout holds.
  const withFade = [...all.values()].filter((s) => s.gone).length;
  assert.ok(withFade > 10_000, `expected many fade sentences, got ${withFade}`);
});

test("the gate cuts ~74k spells down to the few thousand a character here can hold", liveOnly(), () => {
  const indexed = lexicon().size;
  // Measured on the install this was written against: 7,076 obtainable beneficial spells, of which
  // 3,851 carry a fade sentence and 4,633 a landing-on-other — 422 *distinct* fade sentences, 272 of
  // them shared by more than one spell. The bounds are loose because a patch may move any of those.
  assert.ok(indexed > 1_000, `expected thousands of obtainable buffs indexed, got ${indexed}`);
  // If the gate were doing nothing this would be in the tens of thousands — which is the failure that
  // hands a player's own sentence to an out-of-era spell of the same name.
  assert.ok(indexed < strings().size / 3, `the obtainable/beneficial gate looks inert (${indexed})`);
});

test("the sentence cast-alerts called unmappable maps", liveOnly(), () => {
  // The exact line `cast-alerts.ts` records as an honest limit. Spell 278 is Spirit of Wolf.
  const found = lexicon().fadedBy("The spirit of wolf leaves you.");
  assert.ok(
    found.some((s) => s.name === "Spirit of Wolf"),
    `expected Spirit of Wolf, got ${found.map((s) => s.name).join(", ") || "nothing"}`,
  );
  assert.equal(strings().get(278)?.gone, "The spirit of wolf leaves you.");
});

test("the three self-fade shapes the log-watching spec measured all resolve", liveOnly(), () => {
  const lex = lexicon();
  // One real sentence per grammatical family the spec counted on a live log — `X fades.`,
  // `X leaves you.`, `Your X returns to normal.` — so a change to any one family fails on its own
  // rather than being averaged away by the other two. All three were confirmed against the install
  // and all three belong to spells a character here can hold.
  for (const sentence of [
    "The Hand of Tunare fades.",
    "The spirit of wolf leaves you.",
    "Your skin returns to normal.",
  ]) {
    assert.ok(lex.fadedBy(sentence).length > 0, `nothing claims “${sentence}”`);
  }
});

test("a sentence belonging only to an out-of-era spell is deliberately not claimed", liveOnly(), () => {
  // `The thorns fall away.` is spell 12720's, which no class here can cast — the druid line uses
  // Thistlecoat and Thorncoat instead. So this must find *nothing*: the gate exists precisely to stop
  // an unreachable spell claiming a sentence, and a player seeing "Thorns is down" would be told about
  // a spell they cannot cast. It is asserted rather than assumed because it is the gate's whole job.
  assert.deepEqual(lexicon().fadedBy("The thorns fall away."), []);
});

test("a shared fade sentence really is shared — the reason a lookup returns a list", liveOnly(), () => {
  // Shield of Thistles (Druid 7) and Shield of Thorns (Druid 47) word their fade identically. If this
  // ever returns one spell, the candidate-list design is over-engineering; while it returns two,
  // picking one would be a coin toss.
  const found = lexicon().fadedBy("The brambles fall away.");
  assert.ok(found.length > 1, `expected a shared sentence, got ${found.map((s) => s.name).join(", ")}`);
});

test("a landing on somebody else yields both the name and the spell", liveOnly(), () => {
  const spaced = lexicon().landedOnOther("Bloop is surrounded by a brief lupine aura.");
  assert.equal(spaced?.target, "Bloop");
  assert.ok(spaced?.spells.some((s) => s.name === "Spirit of Wolf"));
  // The possessive form, which is the one the leading-space trim would have broken.
  const possessive = lexicon().landedOnOther("Bloop's fist bursts into flame.");
  assert.equal(possessive?.target, "Bloop");
  assert.ok(possessive?.spells.some((s) => s.name === "Firefist"));
});

test("a spell can fade in silence, and that is not a parse failure", liveOnly(), () => {
  // Burnout (327) has a landing sentence for the pet and no SPELLGONE at all. A delay cue is the
  // honest tool for one of these (ADR 0082), which is why nothing here treats it as missing data.
  assert.equal(strings().get(327)?.gone, "");
  assert.ok(strings().get(327)?.onOther, "Burnout should still announce its landing");
  assert.equal(lexicon().landsQuietly("Burnout"), false);
});

test("permanence is readable from the file, and matches the list eql-alerts hand-built", liveOnly(), () => {
  const { byId } = parseSpellCatalog(fs.readFileSync(gameFile("spells_us.txt"), "utf8"));
  // The split that list calls out by name: I–III never expire on EQL, IV lasts four ticks. Getting
  // this from the game's own file is what makes the borrowed list unnecessary.
  assert.equal(byId.get(210)?.permanent, true, "Yaulp");
  assert.equal(byId.get(43)?.permanent, true, "Yaulp II");
  assert.equal(byId.get(44)?.permanent, true, "Yaulp III");
  assert.equal(byId.get(1534)?.permanent, false, "Yaulp IV");
  // And the rest of the names on it.
  for (const [id, name] of [
    [254, "Firefist"],
    [309, "Shielding"],
    [346, "Grim Aura"],
    [352, "Deadeye"],
    [426, "Greater Wolf Form"],
    [644, "Lich"],
    [693, "Divine Might"],
    [1453, "Divine Purpose"],
    [109, "Elemental Armor"],
  ] as const) {
    assert.equal(byId.get(id)?.permanent, true, `${name} should be permanent on EQL`);
  }
  // A timed buff for contrast, so a bug that marked everything permanent would fail here.
  assert.equal(byId.get(278)?.permanent, false, "Spirit of Wolf is timed");
});
