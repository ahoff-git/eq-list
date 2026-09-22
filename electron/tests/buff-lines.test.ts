/**
 * A review of the *committed* `buff-lines.generated.ts` data, the same role `race-unlocks.test.ts`
 * plays for the race-unlock guide: `scripts/fetch-buff-lines.mjs` already refuses to write a shape
 * that doesn't fit (see its own header), but this is what a re-supplied file has to pass too — a
 * hand edit, a merge conflict resolved wrong, or a script bug that still produced syntactically
 * valid TypeScript would all slip past the generator's own guard.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { BUFF_LINES, BUFF_LINES_SOURCE } from "../../src/shared/buff-lines.generated";
import { buffLinesFor, shareBuffLine } from "../../src/shared/buff-lines";

test("at least the lines the guide is known to cover are present, each named once", () => {
  assert.ok(BUFF_LINES.length >= 100, `only ${BUFF_LINES.length} buff lines`);
  const ids = BUFF_LINES.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, "a buff line id is listed twice");
});

test("every buff line and every member is well-formed", () => {
  for (const line of BUFF_LINES) {
    assert.ok(line.id.trim().length > 0, "a buff line with no id");
    assert.ok(line.category.trim().length > 0, `${line.id}: no category`);
    assert.ok(line.stat.trim().length > 0, `${line.id}: no stat`);
    assert.ok(line.label.trim().length > 0, `${line.id}: no label`);
    assert.ok(line.members.length > 0, `${line.id}: no members`);
    for (const m of line.members) {
      assert.ok(m.spell.trim().length > 0, `${line.id}: a member with no spell name`);
      assert.ok(Number.isInteger(m.bonus) && m.bonus !== 0, `${line.id}/${m.spell}: bonus ${m.bonus}`);
    }
  }
});

test("the source is stamped with where this came from", () => {
  assert.match(BUFF_LINES_SOURCE.title, /Buff Lines/);
  assert.ok(!Number.isNaN(Date.parse(BUFF_LINES_SOURCE.scrapedAt)));
});

test("buffLinesFor finds a known line by name, rank suffix and case included", () => {
  const lines = buffLinesFor("nimble");
  assert.ok(lines.some((l) => l.id === "agility--primary"), "\"Nimble\" should be in Agility (Primary)");
  // buffKey() strips a trailing Roman-numeral rank the same way the Buffs tab's own casts do.
  assert.deepEqual(buffLinesFor("Nimble IV").map((l) => l.id), buffLinesFor("Nimble").map((l) => l.id));
});

test("buffLinesFor is empty for a spell the guide doesn't cover", () => {
  assert.deepEqual(buffLinesFor("Not A Real Spell Name"), []);
});

test("shareBuffLine agrees with the raw data", () => {
  // Two different members of the same real line.
  assert.ok(shareBuffLine("Nimble", "Deliriously Nimble"));
  // A spell never shares a line with itself.
  assert.equal(shareBuffLine("Nimble", "Nimble"), false);
  // Two spells from unrelated lines don't conflict.
  assert.equal(shareBuffLine("Nimble", "Not A Real Spell Name"), false);
});
