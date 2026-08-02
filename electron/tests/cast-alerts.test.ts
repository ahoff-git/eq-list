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

test("a named caster (player / pet / named NPC) is skipped unless the watch includes players", () => {
  // BunnySlayer is a person; a groupmate's Charm isn't a threat to prep against.
  const charm = settings({ watches: [{ id: "charm", spell: "Charm", enabled: true }] });
  assert.equal(matchCast(cast("BunnySlayer", "Charm"), charm, NOW), null);
  // A plain mob (article-led) with the same spell still alerts.
  assert.equal(matchCast(cast("a spectre", "Charm"), charm, NOW)?.id, "charm");
});

test("a watch that includes players fires on named casters (and still on mobs)", () => {
  const withPlayers = settings({ watches: [{ id: "charm", spell: "Charm", enabled: true, includePlayers: true }] });
  assert.equal(matchCast(cast("BunnySlayer", "Charm"), withPlayers, NOW)?.id, "charm");
  assert.equal(matchCast(cast("Kainos`s warder", "Charm"), withPlayers, NOW)?.id, "charm"); // a pet is "named" too
  assert.equal(matchCast(cast("a spectre", "Charm"), withPlayers, NOW)?.id, "charm");
});

test("include-players is per watch — one spell can allow players while another doesn't", () => {
  const mixed = settings({
    watches: [
      { id: "fear", spell: "Fear", enabled: true }, // mobs only
      { id: "charm", spell: "Charm", enabled: true, includePlayers: true }, // players too
    ],
  });
  assert.equal(matchCast(cast("BunnySlayer", "Fear"), mixed, NOW), null); // a player's Fear: not opted in
  assert.equal(matchCast(cast("BunnySlayer", "Charm"), mixed, NOW)?.id, "charm"); // a player's Charm: opted in
  assert.equal(matchCast(cast("a gnoll", "Fear"), mixed, NOW)?.id, "fear"); // a mob's Fear: still alerts
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
