/**
 * faction-correction.ts — layering the player's own stated faction totals onto the ledger's
 * observed standings.
 *
 * `faction-log.ts`'s `net` is what this app has *observed* change since it started watching this
 * character's logs — never the character's lifetime total, since EQ's faction line states no
 * starting point and no absolute value, ever (see its own header, and
 * `faction-unlock-progress.ts`'s). A character who already had standing with a faction before this
 * app existed — race/class/deity modifiers, or simply having played before installing it — has no
 * way for the ledger to ever learn that gap on its own.
 *
 * Generalizes the same gap `xp-progress.ts` fills — [ADR 0017](../../specs/decisions/0017-camp-efficiency-and-asking-the-player.md)'s
 * "what the log can't say, the app asks for". The player states the real number once, and it's kept
 * as an **offset** rather than a replacement: unlike XP, the ledger keeps folding in new hits
 * underneath it, so `net + offset` has to keep tracking the true total as those hits land — the same
 * way a corrected altimeter keeps reading true altitude after being set once at a known runway. A
 * faction has no "level up" to reset it at, so — unlike `xp-progress.ts` — this is asked for whenever
 * the player wants to (re)state it, not just once.
 *
 * `electron/faction-corrections.ts` derives and persists a correction from what the player typed;
 * this module only merges an already-derived one onto a standing. Pure and DOM-free, like
 * `faction-unlock-progress.ts`, so the merge can be pinned by a test independent of persistence.
 */
import type { FactionCorrection, FactionStanding } from "../types";

/**
 * A faction dump (`/outputfile faction`) as corrections: the game's own total for each faction, as
 * of the moment the dump was written. `observedNetAt(faction)` is what the ledger had seen for it
 * **by then**, so hits logged after the dump keep adding on top — the same offset a typed
 * correction is, stated for every faction at once and by the game rather than the player.
 */
export function factionDumpCorrections(
  rows: readonly { name: string; standing: number }[],
  dumpedAt: string,
  observedNetAt: (faction: string) => number,
): Record<string, FactionCorrection> {
  const out: Record<string, FactionCorrection> = {};
  for (const r of rows) out[r.name] = { offset: r.standing - observedNetAt(r.name), statedAt: dumpedAt, source: "dump" };
  return out;
}

/**
 * Per faction, whichever statement is newer — a dump taken after you typed a number supersedes it,
 * and a number typed after the dump supersedes that. Compared as instants, not strings.
 */
export function newestCorrections(
  ...sets: readonly Readonly<Record<string, FactionCorrection>>[]
): Record<string, FactionCorrection> {
  const out: Record<string, FactionCorrection> = {};
  for (const set of sets) {
    for (const [faction, c] of Object.entries(set)) {
      const held = out[faction];
      if (!held || Date.parse(c.statedAt) > Date.parse(held.statedAt)) out[faction] = c;
    }
  }
  return out;
}

/** A faction the player corrected but the ledger never saw a hit for still needs a row to correct —
 *  covering exactly the history the ledger couldn't have seen is the whole point. */
function blankStanding(faction: string, at: string): FactionStanding {
  return { faction, net: 0, raises: 0, lowers: 0, floors: 0, ceilings: 0, firstAt: at, lastAt: at, causes: [] };
}

/**
 * Fold every stated correction onto the ledger's own standings, keyed by faction name. A correction
 * for a faction the ledger has a row for adds its offset onto that row's `net`; one for a faction the
 * ledger has never touched gets a blank row to carry it. Returns `standings` itself, unchanged, when
 * there is nothing to correct.
 */
export function applyFactionCorrections(
  standings: readonly FactionStanding[],
  corrections: Readonly<Record<string, FactionCorrection>>,
): FactionStanding[] {
  const entries = Object.entries(corrections);
  if (entries.length === 0) return standings as FactionStanding[];
  const byFaction = new Map(standings.map((s) => [s.faction, s]));
  for (const [faction, c] of entries) {
    const base = byFaction.get(faction) ?? blankStanding(faction, c.statedAt);
    byFaction.set(faction, {
      ...base,
      net: base.net + c.offset,
      correction: { observedNet: base.net, correctedAt: c.statedAt, ...(c.source ? { source: c.source } : {}) },
    });
  }
  return [...byFaction.values()];
}
