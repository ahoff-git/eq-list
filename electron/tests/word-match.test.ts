/**
 * `word-match.ts` — the shared literal word-matcher `stances-invocations.ts` and `aa-list.ts` both
 * narrow their text filter with. Covered here directly since it's a standalone module now rather
 * than a private helper of either one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesWords } from "../../src/shared/word-match";

test("a blank query matches everything", () => {
  assert.ok(matchesWords("Offensive Stance", ""));
  assert.ok(matchesWords("Offensive Stance", "   "));
});

test("every typed word must be found somewhere in the haystack", () => {
  assert.ok(matchesWords("Outgoing melee damage is increased", "melee damage"));
  assert.ok(!matchesWords("Outgoing melee damage is increased", "melee healing"));
});

test("case-insensitive on both sides", () => {
  assert.ok(matchesWords("Direct Damage bonus", "direct damage"));
  assert.ok(matchesWords("direct damage bonus", "DIRECT"));
});

test("a word only has to appear as a substring, not a whole token", () => {
  assert.ok(matchesWords("Spellblade", "spell"));
});
