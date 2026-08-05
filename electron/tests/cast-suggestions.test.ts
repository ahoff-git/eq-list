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

test("a line suggestion says so, and reads as words rather than a spell name", () => {
  // These are the ones nobody can quote from memory ("invites you"), so the chip shows a plain
  // label and the substring stays short enough to survive EQ's wording of the sentence.
  const lines = CAST_SUGGESTIONS.flatMap((g) => g.suggestions).filter((s) => s.onLine);
  assert.ok(lines.length > 0, "at least one line suggestion is offered");
  for (const s of lines) {
    assert.ok(s.label?.trim(), `${s.spell} has a label for the chip`);
  }
  assert.ok(lines.some((s) => s.spell === "invites you"), "a party invite is one click away");
});

test("isWatched folds case and whitespace like a real watch", () => {
  const watches = [{ spell: "Root" }, { spell: " terror " }];
  assert.equal(isWatched(watches, { spell: "Root", note: "" }), true);
  assert.equal(isWatched(watches, { spell: "Terror", note: "" }), true); // case + trim folded
  assert.equal(isWatched(watches, { spell: "Instill", note: "" }), false);
  assert.equal(isWatched([], { spell: "Root", note: "" }), false);
});
