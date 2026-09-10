/**
 * Tests for the Faction tab's two sort orders — same shape as `loot-filters.test.ts`'s sort half.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sortFactionHits, sortFactionStandings } from "../../src/shared/faction-sort";
import type { FactionEvent, FactionStanding } from "../../src/shared/types";

function hit(p: Partial<FactionEvent> & { faction: string }): FactionEvent {
  return {
    kind: "faction",
    delta: -3,
    direction: "lowered",
    logId: 1,
    raw: "",
    at: "2026-07-17T18:00:00",
    ...p,
  };
}

const hits: FactionEvent[] = [
  hit({ faction: "Circle of Unseen Hands", at: "2026-07-17T19:00:00", delta: 5, direction: "raised" }),
  hit({ faction: "Agents of Mistmoore", at: "2026-07-17T18:50:00", delta: -3, direction: "lowered" }),
  hit({ faction: "Priests of Marr", at: "2026-07-17T18:00:00", delta: null, direction: "floor" }),
];

test("hits sort by time, faction, or the stated delta — a floor/ceiling hit sorts last by delta", () => {
  assert.deepEqual(
    sortFactionHits(hits, { key: "at", desc: true }).map((h) => h.faction),
    ["Circle of Unseen Hands", "Agents of Mistmoore", "Priests of Marr"],
  );
  assert.deepEqual(
    sortFactionHits(hits, { key: "faction", desc: false }).map((h) => h.faction),
    ["Agents of Mistmoore", "Circle of Unseen Hands", "Priests of Marr"],
  );
  const byDelta = sortFactionHits(hits, { key: "delta", desc: true }).map((h) => h.faction);
  assert.deepEqual(byDelta, ["Circle of Unseen Hands", "Agents of Mistmoore", "Priests of Marr"]);
});

const standings: FactionStanding[] = [
  { faction: "Agents of Mistmoore", net: -8, raises: 1, lowers: 2, floors: 1, ceilings: 0, firstAt: "a", lastAt: "2026-07-17T18:00:00" },
  { faction: "Priests of Marr", net: 10, raises: 1, lowers: 0, floors: 0, ceilings: 1, firstAt: "a", lastAt: "2026-07-18T09:00:00" },
];

test("standings sort by any column, biggest net gain first by default", () => {
  assert.deepEqual(sortFactionStandings(standings, { key: "net", desc: true }).map((s) => s.faction), [
    "Priests of Marr",
    "Agents of Mistmoore",
  ]);
  assert.deepEqual(sortFactionStandings(standings, { key: "lastAt", desc: true }).map((s) => s.faction), [
    "Priests of Marr",
    "Agents of Mistmoore",
  ]);
  assert.deepEqual(sortFactionStandings(standings, { key: "faction", desc: false }).map((s) => s.faction), [
    "Agents of Mistmoore",
    "Priests of Marr",
  ]);
});
