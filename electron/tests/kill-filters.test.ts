/**
 * Black-box tests for the kill filters and the confidence vocabulary. The map and the kill
 * list share both, so these pin the thing that keeps the two views telling the same story.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_KILL_FILTERS, filterKills, type KillFilters } from "../../src/shared/kill-filters";
import { confidenceTier, CONFIDENCE_TIERS, PLOTTABLE_CONFIDENCE } from "../../src/shared/kill-confidence";
import type { KillRecord } from "../../src/shared/types";

const NOW = Date.parse("2026-07-29T12:00:00.000Z");

function kill(p: Partial<KillRecord> & { mob: string }): KillRecord {
  return {
    id: p.mob + (p.at ?? ""),
    logId: 1,
    at: p.at ?? new Date(NOW).toISOString(),
    confidence: p.confidence ?? 1,
    ...p,
  };
}

/** Minutes before `NOW`, as an ISO timestamp. */
const agoMin = (m: number) => new Date(NOW - m * 60_000).toISOString();

const filters = (over: Partial<KillFilters> = {}): KillFilters => ({ ...DEFAULT_KILL_FILTERS, ...over });

test("the defaults keep everything from a play session", () => {
  const kills = [kill({ mob: "a coyote", at: agoMin(1) }), kill({ mob: "a rat", at: agoMin(200) })];
  assert.equal(filterKills(kills, filters(), NOW).length, 2);
});

test("the time window cuts off older kills", () => {
  const kills = [
    kill({ mob: "recent", at: agoMin(5) }),
    kill({ mob: "older", at: agoMin(30) }),
    kill({ mob: "ancient", at: agoMin(600) }),
  ];
  assert.deepEqual(
    filterKills(kills, filters({ window: "10m" }), NOW).map((k) => k.mob),
    ["recent"],
  );
  assert.deepEqual(
    filterKills(kills, filters({ window: "1h" }), NOW).map((k) => k.mob),
    ["recent", "older"],
  );
  assert.equal(filterKills(kills, filters({ window: "all" }), NOW).length, 3);
});

test("mob and drop filters match on a substring, case-insensitively", () => {
  const kills = [
    kill({ mob: "a giant rat", drops: ["Giant Rat Ear"] }),
    kill({ mob: "a coyote", drops: ["Chunk of Meat"] }),
    kill({ mob: "a rock spider" }),
  ];
  assert.deepEqual(
    filterKills(kills, filters({ mob: "RAT" }), NOW).map((k) => k.mob),
    ["a giant rat"],
  );
  assert.deepEqual(
    filterKills(kills, filters({ drop: "meat" }), NOW).map((k) => k.mob),
    ["a coyote"],
  );
});

test("'dropped' keeps only kills that gave something up", () => {
  const kills = [kill({ mob: "gave", drops: ["Bone Chips"] }), kill({ mob: "gave nothing" })];
  assert.deepEqual(
    filterKills(kills, filters({ droppedOnly: true }), NOW).map((k) => k.mob),
    ["gave"],
  );
});

test("the confidence floor hides positions that aren't worth believing", () => {
  const kills = [
    kill({ mob: "measured", confidence: 1 }),
    kill({ mob: "vague", confidence: 0.3 }),
    kill({ mob: "unplaced", confidence: 0 }),
  ];
  assert.deepEqual(
    filterKills(kills, filters({ minConfidence: PLOTTABLE_CONFIDENCE }), NOW).map((k) => k.mob),
    ["measured", "vague"],
  );
  // With no floor, even an unplaced kill is listed — it happened, after all.
  assert.equal(filterKills(kills, filters(), NOW).length, 3);
});

test("a kill with an unreadable timestamp is kept rather than lost", () => {
  const kills = [kill({ mob: "odd clock", at: "not a date" })];
  assert.equal(filterKills(kills, filters({ window: "10m" }), NOW).length, 1);
});

test("confidence tiers run from measured to unplaced, and never fall through", () => {
  assert.equal(confidenceTier(1).label, "measured");
  assert.equal(confidenceTier(0.6).label, "close");
  assert.equal(confidenceTier(0.3).label, "approximate");
  assert.equal(confidenceTier(0.05).label, "guess");
  assert.equal(confidenceTier(0).label, "unplaced");
  // Every tier has a distinct glyph, so the map reads without relying on color.
  const glyphs = CONFIDENCE_TIERS.map((t) => t.glyph);
  assert.equal(new Set(glyphs).size, glyphs.length);
});
