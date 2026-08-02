/**
 * Black-box tests for the cast-alert matcher: which "<caster> begins casting <spell>"
 * events raise a dispel-prep alert, given the user's watch list.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIVE_WITHIN_MS, matchCast } from "../../src/shared/cast-alerts";
import type { CastAlertSettings } from "../../src/shared/types";

/** A cast that just happened — the timing rule has its own tests below. */
const NOW = Date.parse("2026-07-29T21:00:00");
const cast = (caster: string, spell: string, at = "2026-07-29T21:00:00") => ({ caster, spell, at });

function settings(over: Partial<CastAlertSettings> = {}): CastAlertSettings {
  return {
    enabled: true,
    sound: false,
    flash: false,
    includeSelf: false,
    watches: [
      { id: "fear", spell: "Fear", enabled: true },
      { id: "mez", spell: "Mesmeri", enabled: true },
    ],
    ...over,
  };
}

test("matches a watched spell case-insensitively, by substring", () => {
  // "Mesmeri" catches "Mesmerize" and "Mesmerization" alike.
  const m = matchCast(cast("a dark elf", "Mesmerization"), settings(), NOW);
  assert.equal(m?.id, "mez");
  assert.equal(matchCast(cast("a goblin", "word of FEAR"), settings(), NOW)?.id, "fear");
});

test("no match when nothing in the watch list is contained in the spell", () => {
  assert.equal(matchCast(cast("a bat", "Minor Healing"), settings(), NOW), null);
});

test("disabled overall, or a disabled watch, never matches", () => {
  assert.equal(matchCast(cast("a mob", "Fear"), settings({ enabled: false }), NOW), null);
  const oneOff = settings({ watches: [{ id: "fear", spell: "Fear", enabled: false }] });
  assert.equal(matchCast(cast("a mob", "Fear"), oneOff, NOW), null);
});

test("your own casts are skipped unless includeSelf", () => {
  assert.equal(matchCast(cast("You", "Fear"), settings(), NOW), null);
  assert.equal(matchCast(cast("You", "Fear"), settings({ includeSelf: true }), NOW)?.id, "fear");
});

test("blank / whitespace watches are ignored (don't match everything)", () => {
  const blank = settings({ watches: [{ id: "empty", spell: "  ", enabled: true }] });
  assert.equal(matchCast(cast("a mob", "Anything"), blank, NOW), null);
});

// An alert says "dispel, now". Lines can arrive long after they were written — a log read
// from the top, a replay — and a barrage of warnings about fights that ended hours ago is
// worse than silence.
test("a cast that already finished raises no alert", () => {
  const stale = new Date(NOW + LIVE_WITHIN_MS + 1000).toISOString();
  assert.equal(matchCast({ caster: "a mob", spell: "Fear", at: "2026-07-29T21:00:00" }, settings(), Date.parse(stale)), null);
});

test("a cast within the live window still alerts", () => {
  const soonAfter = NOW + LIVE_WITHIN_MS - 1000;
  assert.equal(matchCast(cast("a mob", "Fear"), settings(), soonAfter)?.id, "fear");
});

test("an unreadable timestamp is allowed through — a missed alert is the worse failure", () => {
  assert.equal(matchCast({ caster: "a mob", spell: "Fear", at: "not a date" }, settings(), NOW)?.id, "fear");
});
