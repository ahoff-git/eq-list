/**
 * Tests for layering stated corrections onto the ledger's own standings. See
 * `src/shared/faction-correction.ts`'s header for why the offset shape is what it is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFactionCorrections } from "../../src/shared/faction-correction";
import type { FactionStanding } from "../../src/shared/types";

function standing(p: Partial<FactionStanding> & { faction: string; net: number }): FactionStanding {
  return { raises: 0, lowers: 0, floors: 0, ceilings: 0, firstAt: "a", lastAt: "a", causes: [], ...p };
}

test("with no corrections, standings pass through unchanged", () => {
  const standings = [standing({ faction: "Agents of Mistmoore", net: -20 })];
  assert.equal(applyFactionCorrections(standings, {}), standings);
});

test("a correction folds its offset onto the matching standing's net", () => {
  const standings = [standing({ faction: "Agents of Mistmoore", net: -20 })];
  const [corrected] = applyFactionCorrections(standings, {
    "Agents of Mistmoore": { offset: 520, statedAt: "2026-07-29T00:00:00Z" },
  });
  assert.equal(corrected.net, 500);
  assert.deepEqual(corrected.correction, { observedNet: -20, correctedAt: "2026-07-29T00:00:00Z" });
});

test("a faction never touched by the ledger still gets a row when corrected", () => {
  const [corrected] = applyFactionCorrections([], {
    "Rogues of the White Rose": { offset: 300, statedAt: "2026-07-29T00:00:00Z" },
  });
  assert.equal(corrected.faction, "Rogues of the White Rose");
  assert.equal(corrected.net, 300);
  assert.deepEqual([corrected.raises, corrected.lowers, corrected.floors, corrected.ceilings], [0, 0, 0, 0]);
});

test("an uncorrected faction beside a corrected one is untouched", () => {
  const standings = [standing({ faction: "Agents of Mistmoore", net: -20 }), standing({ faction: "Priests of Marr", net: 40 })];
  const corrected = applyFactionCorrections(standings, { "Agents of Mistmoore": { offset: 10, statedAt: "a" } });
  const marr = corrected.find((s) => s.faction === "Priests of Marr")!;
  assert.equal(marr.net, 40);
  assert.equal(marr.correction, undefined);
});
