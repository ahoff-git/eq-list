/**
 * empty-values.ts — the zero-value seeds a panel renders before any real state has arrived.
 *
 * `src/lib/hooks.ts` (the Electron path) and `src/lib/web-api.ts` (the web build) each need one of
 * these for every live value they expose, and for a shape with no per-environment "now" or "not yet
 * known" field to fill in — a fight with nothing dealt, a harvest that has never run — the two used
 * to write out the same object by hand. Kept here once, so a field added to `FightStats` or
 * `HarvestProgress` can't be added to one seed and quietly forgotten in the other.
 *
 * A shape whose empty state legitimately differs between the two — `CombatStats.startedAt`, say,
 * blank in the app and "now" on the web so a relative-time display never reads as decades stale —
 * stays local to whichever file needs which value, built *from* the seeds here rather than beside
 * them.
 */
import type { FightStats, HarvestProgress } from "./types";

export const EMPTY_FIGHT: FightStats = {
  startedAt: "",
  endedAt: "",
  durationSec: 0,
  totalDealt: 0,
  yourDealt: 0,
  yourTaken: 0,
  spanSec: 0,
  byCombatant: [],
  spells: [],
  byMob: [],
  kills: 0,
  xpPct: 0,
  xpGains: 0,
  soloXp: 0,
  partyXp: 0,
  copper: 0,
  soldCopper: 0,
  yourPerSec: [],
  deaths: [],
  invocations: [],
};

/** A harvest is idle and has never run, never mind which build asks. */
export const EMPTY_HARVEST: HarvestProgress = {
  status: "idle",
  total: 0,
  at: 0,
  fetched: 0,
  fromPeers: 0,
  failed: 0,
  found: 0,
  shards: { present: 0, mine: 0, room: 0 },
};
