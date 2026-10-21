/**
 * Tests for layering stated corrections onto the ledger's own standings. See
 * `src/shared/faction-correction.ts`'s header for why the offset shape is what it is.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFactionCorrections, factionDumpCorrections, newestCorrections } from "../../src/shared/faction/faction-correction";
import { logStamp } from "../../src/shared/log-clock";
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

test("a faction dump states every faction's total as of the dump, so later hits still count", () => {
  // The ledger had seen +213 by the dump and +5 since; the game said 1551 at the dump.
  const corrections = factionDumpCorrections(
    [{ name: "Antonius Bayle", standing: 1551 }, { name: "Craftkeepers", standing: 2000 }],
    "2026-10-20T17:16:42.000Z",
    (f) => (f === "Antonius Bayle" ? 213 : 0),
  );
  assert.deepEqual(corrections["Antonius Bayle"], { offset: 1338, statedAt: "2026-10-20T17:16:42.000Z", source: "dump" });
  const [bayle, craft] = applyFactionCorrections([standing({ faction: "Antonius Bayle", net: 218 })], corrections);
  assert.equal(bayle.net, 1556, "the dump's 1551 plus the 5 logged since");
  assert.equal(bayle.correction?.source, "dump");
  assert.equal(craft.faction, "Craftkeepers", "a faction the log never saw still gets its row");
  assert.equal(craft.net, 2000);
});

test("per faction, the newer statement wins, compared as instants whatever their spelling", () => {
  const typed = { "Antonius Bayle": { offset: 100, statedAt: "2026-10-20T18:00:00.000Z" }, Other: { offset: 1, statedAt: "2026-10-19T00:00:00.000Z" } };
  const dump = { "Antonius Bayle": { offset: 1338, statedAt: "2026-10-20T17:16:42.000Z", source: "dump" as const } };
  assert.equal(newestCorrections(typed, dump)["Antonius Bayle"].offset, 100, "typed after the dump");
  const laterDump = { "Antonius Bayle": { ...dump["Antonius Bayle"], statedAt: "2026-10-20T19:00:00.000Z" } };
  assert.equal(newestCorrections(typed, laterDump)["Antonius Bayle"].offset, 1338, "dumped after the typing");
  assert.equal(newestCorrections(typed, laterDump).Other.offset, 1, "a faction only one side states is kept");
});

test("logStamp writes an instant the way the log does: local time, no zone", () => {
  const at = new Date(2026, 9, 20, 9, 57, 17).getTime();
  assert.equal(logStamp(at), "2026-10-20T09:57:17");
  assert.equal(logStamp(new Date(at).toISOString()), "2026-10-20T09:57:17");
  assert.equal(logStamp("not a time"), "not a time");
});

test("a corrected-only faction's row is stamped in the ledger's local time, so it sorts among real hits", () => {
  // The ledger's firstAt/lastAt are log stamps (local, no zone) and the Standings table sorts them as
  // text; a UTC `...Z` stamp there sorts hours off — a whole dump's untouched factions jumping above
  // every faction actually hit since.
  const statedAt = "2026-10-20T17:16:42.000Z";
  const [row] = applyFactionCorrections([], { Craftkeepers: { offset: 2000, statedAt, source: "dump" } });
  assert.equal(row.lastAt, logStamp(statedAt));
  assert.equal(row.firstAt, logStamp(statedAt));
  assert.equal(row.correction?.correctedAt, statedAt, "the correction itself keeps its instant");
});
