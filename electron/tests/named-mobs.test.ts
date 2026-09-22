/**
 * A review of the *committed* `named-mobs.generated.ts` data, the same role `aa-list.test.ts` and
 * `buff-lines.test.ts` play for theirs: `scripts/fetch-named-mobs.mjs` walks a live category, so
 * a stale or hand-edited file is the one thing nothing else here re-checks. Also covers
 * `isNamedMob`, the pure lookup beside the data (`named-mobs.ts`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { NAMED_MOBS, NAMED_MOBS_SOURCE } from "../../src/shared/named-mobs.generated";
import { isNamedMob } from "../../src/shared/named-mobs";

// Pinned against a real run (6586, 2026-09-21) with margin — the floor below which something
// clearly broke (the same role `aa-list.test.ts`'s `MIN_TOTAL` plays for its own list).
const MIN_TOTAL = 3000;

test("at least the named mobs the wiki is known to carry are present", () => {
  assert.ok(NAMED_MOBS.length >= MIN_TOTAL, `only ${NAMED_MOBS.length} named mobs`);
});

test("every entry is a real, non-empty title", () => {
  for (const name of NAMED_MOBS) assert.ok(name.trim().length > 0, "a blank title");
});

test("no title is listed twice", () => {
  const seen = new Set<string>();
  for (const name of NAMED_MOBS) {
    assert.ok(!seen.has(name), `"${name}" is listed twice`);
    seen.add(name);
  }
});

test("the source is stamped with where this came from", () => {
  assert.match(NAMED_MOBS_SOURCE.title, /Named Mobs/);
  assert.ok(!Number.isNaN(Date.parse(NAMED_MOBS_SOURCE.scrapedAt)));
});

test("isNamedMob: a real category member matches, case and whitespace aside", () => {
  assert.ok(isNamedMob("Lord Nagafen"));
  assert.ok(isNamedMob("lord nagafen"));
  assert.ok(isNamedMob("  Lord Nagafen  "));
});

test("isNamedMob: a leading article is folded away, both directions", () => {
  // The category carries "A bandit (Eastern Karana)" — a kill log or a zone roster names the same
  // mob with its article and without the wiki's disambiguating zone parenthetical.
  assert.ok(isNamedMob("a bandit (Eastern Karana)"));
  assert.ok(isNamedMob("a bandit"));
  assert.ok(isNamedMob("bandit"));
});

test("isNamedMob: a mob nowhere in the category does not match", () => {
  // Not a real mob name at all — the category is broad enough (6,500+ members) that almost any
  // genuine EQ mob risks being a member, which is itself the caveat this feature carries.
  assert.ok(!isNamedMob("a completely fictitious test mob"));
  assert.ok(!isNamedMob("definitely not a real mob name"));
});
