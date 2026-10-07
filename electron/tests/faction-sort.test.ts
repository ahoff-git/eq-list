/**
 * Tests for the Faction tab's two sort orders — same shape as `loot-filters.test.ts`'s sort half.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pooledCauseBadge, ratePerHour, sortFactionHits, sortFactionStandings } from "../../src/shared/faction-sort";
import type { FactionEvent, FactionStanding } from "../../src/shared/types";
import type { FactionCauseKnowledge } from "../../src/shared/faction-observation";

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
  { faction: "Agents of Mistmoore", net: -8, raises: 1, lowers: 2, floors: 1, ceilings: 0, firstAt: "a", lastAt: "2026-07-17T18:00:00", causes: [] },
  { faction: "Priests of Marr", net: 10, raises: 1, lowers: 0, floors: 0, ceilings: 1, firstAt: "a", lastAt: "2026-07-18T09:00:00", causes: [] },
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

test("standings sort by net/hour, derived rather than stored", () => {
  const fast: FactionStanding = { ...standings[1], faction: "Fast", net: 100, firstAt: "2026-07-18T08:00:00", lastAt: "2026-07-18T09:00:00" };
  const slow: FactionStanding = { ...standings[1], faction: "Slow", net: 100, firstAt: "2026-07-18T00:00:00", lastAt: "2026-07-18T09:00:00" };
  assert.deepEqual(sortFactionStandings([slow, fast], { key: "rate", desc: true }).map((s) => s.faction), ["Fast", "Slow"]);
  assert.ok(ratePerHour(fast) > ratePerHour(slow));
});

// ─── `pooledCauseBadge` — what the Faction tab's cause rows show for pooled evidence (ADR 0283) ──

const CAUSE = { kind: "kill" as const, source: "a dock worker", net: -4, hits: 2 };

test("a cause with no pooled evidence at all shows nothing — the common case today", () => {
  assert.equal(pooledCauseBadge("Wharf Rats", CAUSE, []), undefined);
});

test("a cause nobody else has reported for this faction shows nothing, even if the name matches elsewhere", () => {
  const knowledge: FactionCauseKnowledge[] = [
    { faction: "Coalition of Tradefolk", kind: "kill", source: "a dock worker", net: -4, hits: 2, myHits: 2, contributors: [] },
  ];
  assert.equal(pooledCauseBadge("Wharf Rats", CAUSE, knowledge), undefined);
});

test("a cause with only your own hits and no peers shows nothing — pooling has to add something to be worth a badge", () => {
  const knowledge: FactionCauseKnowledge[] = [
    { faction: "Wharf Rats", kind: "kill", source: "a dock worker", net: -4, hits: 2, myHits: 2, contributors: [] },
  ];
  assert.equal(pooledCauseBadge("Wharf Rats", CAUSE, knowledge), undefined);
});

test("a cause a peer also reported shows a real count and an explanatory tooltip", () => {
  const knowledge: FactionCauseKnowledge[] = [
    {
      faction: "Wharf Rats",
      kind: "kill",
      source: "a dock worker",
      net: -6,
      hits: 3,
      myHits: 2,
      contributors: [{ id: "c-1", name: "Bob" }],
    },
  ];
  const badge = pooledCauseBadge("Wharf Rats", CAUSE, knowledge);
  assert.ok(badge);
  assert.equal(badge.label, "+1 peer hit");
  assert.match(badge.title, /3 hits/);
});

test("a dialogue cause never borrows a kill cause's pooled count for the same name", () => {
  const knowledge: FactionCauseKnowledge[] = [
    { faction: "Wharf Rats", kind: "dialogue", source: "a dock worker", net: 2, hits: 5, myHits: 0, contributors: [{ id: "c-1", name: "Bob" }] },
  ];
  assert.equal(pooledCauseBadge("Wharf Rats", CAUSE, knowledge), undefined, "CAUSE is a kill; only the dialogue row matched by name");
});
