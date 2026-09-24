/**
 * fight-merge.ts — pooling two or more provably-overlapping fights into one truer picture.
 *
 * `peer-share.ts`'s `matchingHits` proves two peers are in the same fight: the log writes the same
 * swing to everyone in earshot, so an overlapping (attacker, target, amount, moment) is the same
 * line seen twice. This is what actually acts on that proof — dedupe the union of everyone's
 * recent hits and heals, replay them **in order** through a fresh tracker (the same one
 * `main.ts`/`log-import.ts` already trust for every other fight), and read back only the parts that
 * describe the encounter itself. What that leaves out on purpose: kills, experience, loot and spell
 * efficiency are personal rewards and references, not facts about the fight, and merging them would
 * misreport what you actually earned — they stay exactly what your own log says, every time.
 *
 * See [ADR 0276](../specs/decisions/0276-overlapping-fights-are-pooled-not-only-proven.md).
 */
import { createCombatStats } from "./combat-stats";
import type { DamageEvent, FightHeal, FightHit, FightStats, HealEvent } from "../src/shared/types";

/**
 * How close two timestamps have to be to count as the same logged moment — the same slack
 * `peer-share.ts`'s `matchingHits` allows, for the same reason: EQ logs to the second, and two
 * installs' clocks can disagree by a beat.
 */
const MERGE_TOLERANCE_MS = 1500;

/** One source's own hits and heals for the fight, already named for real (never "You"). */
export interface MergeSource {
  name: string;
  hits: readonly FightHit[];
  heals: readonly FightHeal[];
}

/** The fields a merge actually replaces — everything else on a `FightStats` stays your own. */
export type MergedFight = Pick<
  FightStats,
  | "byCombatant"
  | "damageCells"
  | "healCells"
  | "totalDealt"
  | "yourDealt"
  | "yourTaken"
  | "totalHealed"
  | "yourHealed"
  | "yourHealReceived"
  | "yourPerSec"
  | "durationSec"
  | "spanSec"
  | "startedAt"
  | "endedAt"
>;

/** Two hits (or two heals) are the same logged event when their identifying fields agree and their
 *  timestamps are within `MERGE_TOLERANCE_MS` — never on amount and timing alone (see ADR 0276). */
function sameHit(a: FightHit, b: FightHit): boolean {
  if (a.attacker !== b.attacker || a.target !== b.target || a.amount !== b.amount) return false;
  return closeEnough(a.at, b.at);
}
function sameHeal(a: FightHeal, b: FightHeal): boolean {
  if (a.healer !== b.healer || a.target !== b.target || a.amount !== b.amount) return false;
  return closeEnough(a.at, b.at);
}
function closeEnough(a: string, b: string): boolean {
  const dt = Date.parse(a) - Date.parse(b);
  return !Number.isNaN(dt) && Math.abs(dt) <= MERGE_TOLERANCE_MS;
}

/**
 * The union of every source's events, first occurrence wins — so a hit two peers both report
 * lands once, not twice, and one only *you* saw or only *they* saw is added in rather than
 * dropped. `mine` goes first deliberately: on a tie, your own copy of an event you both saw is the
 * one kept, which is never observable (the dropped copy is identical by definition) but keeps the
 * rule simple to state.
 */
function union<T>(sources: readonly (readonly T[])[], same: (a: T, b: T) => boolean): T[] {
  const kept: T[] = [];
  for (const events of sources) {
    for (const event of events) {
      if (!kept.some((k) => same(k, event))) kept.push(event);
    }
  }
  return kept;
}

/** A `FightHit` as the tracker's own `record()` wants it — everything a fresh line would carry. */
function asDamageEvent(hit: FightHit, logId: number): DamageEvent {
  return {
    kind: "damage",
    attacker: hit.attacker,
    target: hit.target,
    amount: hit.amount,
    verb: hit.verb,
    spell: hit.spell,
    shield: hit.shield,
    qualifier: hit.qualifier,
    melee: !!hit.melee,
    tick: hit.tick,
    damageType: hit.damageType,
    logId,
    raw: "",
    at: hit.at,
  };
}

function asHealEvent(heal: FightHeal, logId: number): HealEvent {
  return {
    kind: "heal",
    healer: heal.healer,
    target: heal.target,
    amount: heal.amount,
    attempted: heal.attempted,
    spell: heal.spell,
    qualifier: heal.qualifier,
    logId,
    raw: "",
    at: heal.at,
  };
}

/**
 * Pool `mine`'s fight with every confirmed `peers`' own copy of it, and return the parts of a
 * `FightStats` that pooling actually changes.
 *
 * Nothing here decides *whether* to merge — that's `matchingHits`/party membership, upstream. This
 * only ever runs once that's already settled, over data already agreed to be the same encounter.
 *
 * **Known gap: misses aren't pooled.** Only landed hits/heals are kept (`combat-stats.ts`'s own
 * `recentHits`/`recentHeals`), so a merged row's accuracy/hit-rate figures reflect only what your
 * own log saw swing, not what a party-mate's log also missed. Worth closing the day someone
 * actually wants an accurate merged accuracy figure; today's ask was the damage and healing totals.
 */
export function mergeFight(mine: MergeSource, peers: readonly MergeSource[]): MergedFight {
  const hitSources = [mine.hits, ...peers.map((p) => p.hits)];
  const healSources = [mine.heals, ...peers.map((p) => p.heals)];
  const hits = union(hitSources, sameHit).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const heals = union(healSources, sameHeal).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  // Any timestamp works here — `recordParty` only needs one to satisfy `LogEventBase`, and nothing
  // reads it back; `party.has(name)` cares only that the join happened, never when.
  const joinedAt = hits[0]?.at ?? heals[0]?.at ?? new Date().toISOString();
  const replay = createCombatStats();
  replay.setPlayer(mine.name);
  for (const peer of peers) {
    replay.recordParty({ kind: "party", change: "joined", who: peer.name, logId: 0, raw: "", at: joinedAt });
  }

  // One combined, chronological stream — a hit and a heal replayed out of true time order would
  // corrupt the tracker's own gap/active-time bookkeeping (`ACTIVE_GAP_MS`, the fight-end timers),
  // the same reason `main.ts`'s live watcher and `log-import.ts`'s replay both feed a single
  // in-order stream rather than one per event kind.
  let logId = 0;
  const stream: { at: number; feed: () => void }[] = [
    ...hits.map((hit) => ({ at: Date.parse(hit.at), feed: () => replay.record(asDamageEvent(hit, --logId)) })),
    ...heals.map((heal) => ({ at: Date.parse(heal.at), feed: () => replay.record(asHealEvent(heal, --logId)) })),
  ].sort((a, b) => a.at - b.at);
  for (const event of stream) event.feed();

  const merged = replay.snapshot().fight;
  return {
    byCombatant: merged.byCombatant,
    damageCells: merged.damageCells,
    healCells: merged.healCells,
    totalDealt: merged.totalDealt,
    yourDealt: merged.yourDealt,
    yourTaken: merged.yourTaken,
    totalHealed: merged.totalHealed,
    yourHealed: merged.yourHealed,
    yourHealReceived: merged.yourHealReceived,
    yourPerSec: merged.yourPerSec,
    durationSec: merged.durationSec,
    spanSec: merged.spanSec,
    startedAt: merged.startedAt,
    endedAt: merged.endedAt,
  };
}
