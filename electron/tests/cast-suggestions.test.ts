/**
 * Black-box test for the crowd-control suggestions catalog: the menu is well-formed (every
 * entry is a usable substring with a note, nothing offered twice) and `isWatched` folds case
 * and whitespace the same way a real watch match does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAST_SUGGESTIONS, isWatched } from "../../src/shared/cast-suggestions";

test("every suggestion is a non-empty substring with a note, and none repeats", () => {
  const seen = new Set<string>();
  for (const group of CAST_SUGGESTIONS) {
    assert.ok(group.category.trim().length > 0, "a group has a category");
    assert.ok(group.suggestions.length > 0, `${group.category} offers something`);
    for (const s of group.suggestions) {
      assert.ok(s.spell.trim().length > 0, "a suggestion has a substring");
      assert.ok(s.note.trim().length > 0, `${s.spell} explains what it catches`);
      const key = s.spell.trim().toLowerCase();
      assert.ok(!seen.has(key), `no duplicate suggestion: ${s.spell}`);
      seen.add(key);
    }
  }
});

test("isWatched folds case and whitespace like a real watch", () => {
  const watches = [{ spell: "Root" }, { spell: " terror " }];
  assert.equal(isWatched(watches, { spell: "Root", note: "" }), true);
  assert.equal(isWatched(watches, { spell: "Terror", note: "" }), true); // case + trim folded
  assert.equal(isWatched(watches, { spell: "Instill", note: "" }), false);
  assert.equal(isWatched([], { spell: "Root", note: "" }), false);
});
