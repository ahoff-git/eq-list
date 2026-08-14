/**
 * Black-box tests for completing a rule's text from the log's own words.
 *
 * The fixture is real log shapes, because the whole claim is "what the game actually printed": a
 * vocabulary built from sentences we invented to suit the parser would prove nothing about whether
 * "Mesm" finds "Mesmerization".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVocabulary, NO_VOCABULARY } from "../../src/shared/log-vocabulary";
import { parseLogText } from "../../src/shared/log-parser";

const LOG = [
  "[Wed Jul 29 20:58:01 2026] You have entered Lower Guk.",
  "[Wed Jul 29 20:59:10 2026] a dark elf priest begins casting Mesmerization.",
  "[Wed Jul 29 20:59:20 2026] a dark elf priest begins casting Mesmerization.",
  "[Wed Jul 29 20:59:30 2026] a froglok tad begins casting Mesmerize.",
  "[Wed Jul 29 21:00:02 2026] Bunnyslayer begins casting Complete Heal.",
  "[Wed Jul 29 21:00:40 2026] a wild tiger has been slain by Bunnyslayer!",
  "[Wed Jul 29 21:01:00 2026] Your Root spell has worn off of a wild tiger.",
  "[Wed Jul 29 21:02:00 2026] You have entered Befallen.",
  "[Wed Jul 29 21:03:00 2026] You begin casting Spirit of Wolf.",
].join("\n");

const vocab = buildVocabulary(parseLogText(LOG));

test("a prefix completes to what the log actually printed", () => {
  // The whole point: EQ says "Mesmerization", which is not what anyone would type from memory.
  assert.equal(vocab.complete("Mesm"), "Mesmerization");
  assert.equal(vocab.complete("compl"), "Complete Heal");
});

test("completion is case-insensitive but answers in the log's own casing", () => {
  assert.equal(vocab.complete("mesmeriz"), "Mesmerization");
  assert.equal(vocab.complete("MESM"), "Mesmerization");
});

test("the commonest term wins, which is what makes the first guess usually right", () => {
  // "Mesmerization" twice, "Mesmerize" once — both match "Mesm".
  assert.equal(vocab.complete("Mesm"), "Mesmerization");
});

test("each kind completes from its own words", () => {
  assert.equal(vocab.complete("a dark", "caster"), "a dark elf priest");
  assert.equal(vocab.complete("Lower", "zone"), "Lower Guk");
  assert.equal(vocab.complete("a wild", "target"), "a wild tiger");
  // …and a caster is not offered where a spell belongs.
  assert.equal(vocab.complete("a dark", "spell"), undefined);
});

test("a prefix nothing starts with completes to nothing", () => {
  assert.equal(vocab.complete("Xyzzy"), undefined);
  assert.equal(vocab.complete("zzz", "spell"), undefined);
});

test("a completion that adds nothing isn't one", () => {
  // Already the whole term: there is nothing to grey out, so nothing is offered.
  assert.equal(vocab.complete("Mesmerization"), undefined);
  assert.equal(vocab.complete(""), undefined);
  assert.equal(vocab.complete("   "), undefined);
});

test("your own casts don't teach a caster name", () => {
  // "You" is not something anybody types into a rule — `includeSelf` is how you say "me".
  assert.equal(vocab.complete("Yo", "caster"), undefined);
  // …but the spell you cast is still worth knowing.
  assert.equal(vocab.complete("Spirit", "spell"), "Spirit of Wolf");
});

test("a mob you killed is a term, since that's what a camp's rules are written around", () => {
  assert.equal(vocab.complete("a wild", "target"), "a wild tiger");
});

test("an empty log knows nothing, and says so rather than throwing", () => {
  const empty = buildVocabulary([]);
  assert.equal(empty.size, 0);
  assert.equal(empty.complete("Mesm"), undefined);
  assert.equal(NO_VOCABULARY.complete("Mesm"), undefined);
});

// ── the list: what the ghost can't say ─────────────────────────────────────────

test("a fragment from the middle finds the term — which no prefix ever will", () => {
  // "sme" is inside "Mesmerization" and starts nothing at all.
  assert.ok(vocab.suggest("sme").includes("Mesmerization"));
  assert.equal(vocab.complete("sme"), undefined);
});

test("a misspelling still finds it, because this game's spelling is hard", () => {
  assert.ok(vocab.suggest("mesmerisation").includes("Mesmerization"), "an s for a z");
  assert.ok(vocab.suggest("Mesmerizaton").includes("Mesmerization"), "a dropped letter");
});

test("prefixes come first, then contains, then near-misses", () => {
  // A prefix match is never pushed down the list by a cleverer one.
  const list = vocab.suggest("Mesm");
  assert.equal(list[0], "Mesmerization");
  assert.ok(list.includes("Mesmerize"));
});

test("the list is bounded and never repeats itself", () => {
  const list = vocab.suggest("e", undefined, 3);
  assert.ok(list.length <= 3);
  assert.equal(new Set(list).size, list.length);
});

test("one or two letters don't trigger the slower passes", () => {
  // "me" is inside half of everything; matching on it would offer noise as if it were an answer.
  assert.equal(vocab.suggest("me").includes("a dark elf priest"), false);
});

test("the list respects the kind, like the ghost does", () => {
  assert.ok(vocab.suggest("elf", "caster").includes("a dark elf priest")); // a contains-match
  assert.equal(vocab.suggest("elf", "spell").length, 0);
});

test("what's already exactly typed isn't offered back", () => {
  assert.equal(vocab.suggest("Mesmerization").includes("Mesmerization"), false);
  assert.deepEqual(vocab.suggest(""), []);
});

test("it counts what it learned, so 'no suggestion' can be told from 'nothing read'", () => {
  assert.ok(vocab.size >= 6, `learned only ${vocab.size} terms`);
});

test("a big log stays instant to query, which is the reason for the trie", () => {
  // 20k lines of distinct spell names: building is once, completing is per keystroke.
  const lines = Array.from(
    { length: 20_000 },
    (_, i) => `[Wed Jul 29 21:00:00 2026] a gnoll pup begins casting Fearsome Spell ${i}.`,
  ).join("\n");
  const big = buildVocabulary(parseLogText(lines));
  const started = process.hrtime.bigint();
  for (let i = 0; i < 1000; i++) big.complete("Fearsome Spell 1");
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(big.size > 10_000, `expected a big vocabulary, got ${big.size}`);
  // A thousand keystrokes' worth of lookups, well under a frame.
  assert.ok(ms < 50, `1000 completions took ${Math.round(ms)}ms`);
});
