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
import { createCombatStats, MAX_RECENT_HEALS, MAX_RECENT_HITS } from "./combat-stats";
import { HIT_MATCH_TOLERANCE_MS } from "../src/shared/peer-share";
import type { DamageEvent, FightHeal, FightHit, FightStats, HealEvent } from "../src/shared/types";

/** One source's own hits and heals for the fight, already named for real (never "You"). */
export interface MergeSource {
  name: string;
  hits: readonly FightHit[];
  heals: readonly FightHeal[];
}

/**
 * `hits`/`heals` are a sliding window (`MAX_RECENT_HITS`/`MAX_RECENT_HEALS`, `combat-stats.ts`) —
 * generous, but not unbounded. A source at the cap has had its *earliest* entries dropped, so a
 * merge built from it would silently omit damage or healing that genuinely happened but wasn't
 * kept long enough to pool — misreporting a fight this long as smaller than it was. That's worse
 * than not merging: `local`'s own unbounded tally already has the true total.
 */
export function isTruncated(source: MergeSource): boolean {
  return source.hits.length >= MAX_RECENT_HITS || source.heals.length >= MAX_RECENT_HEALS;
}

/**
 * The fields a merge actually replaces — everything else on a `FightStats` stays your own.
 *
 * **`startedAt`/`endedAt` deliberately stay out of this list**, even though the replay recomputes
 * them too. `electron/combat-history.ts`'s `fightKey` — the identity a fight is deduped and
 * re-derived by — is built from exactly those two fields plus the log file, on the assumption that
 * reading the *same log* always reproduces the *same* boundary. A peer's earlier or later hit can
 * genuinely shift the replay's own span past what your own log alone ever recorded — and that log
 * is all a later re-read (ADR 0129) or re-import ever has to go on, since a peer's data is live-only
 * and never written to it. Pooling these two fields would mean the very next re-read keys this
 * fight differently than history already has it filed under, filing a second, duplicate row for
 * the same real fight instead of recognizing the one already there.
 */
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
  | "unsettled"
>;

/** Two hits (or two heals) are the same logged event when their identifying fields agree and their
 *  timestamps are within `HIT_MATCH_TOLERANCE_MS` — never on amount and timing alone (see ADR 0276). */
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
  return !Number.isNaN(dt) && Math.abs(dt) <= HIT_MATCH_TOLERANCE_MS;
}

/**
 * The union of every source's events, first occurrence wins — so a hit two peers both report
 * lands once, not twice, and one only *you* saw or only *they* saw is added in rather than
 * dropped. `mine` goes first deliberately: on a tie, your own copy of an event you both saw is the
 * one kept, which is never observable (the dropped copy is identical by definition) but keeps the
 * rule simple to state.
 *
 * Only cross-source matches are collapsed: a candidate event is checked against what *earlier*
 * sources contributed, never against its own source's other entries. A single log is one person's
 * real, already-distinct swings — two of your own hits landing on the same target for the same
 * fixed-damage amount within the tolerance window are two real swings, not a duplicate — so
 * deduping within a source would silently drop legitimate repeats instead of only agreeing copies.
 */
function union<T>(sources: readonly (readonly T[])[], same: (a: T, b: T) => boolean): T[] {
  const kept: T[] = [];
  for (const events of sources) {
    // A snapshot of everything kept from *earlier* sources, taken before this source adds
    // anything of its own — so this source's entries are never checked against each other.
    const fromEarlierSources = kept.slice();
    for (const event of events) {
      if (!fromEarlierSources.some((k) => same(k, event))) kept.push(event);
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
 * `FightStats` that pooling actually changes — or `null` when `mine` or any `peer` is truncated
 * (`isTruncated`) and pooling from it can't be trusted; the caller falls back to what it already had.
 *
 * Nothing here decides *whether* to merge — that's `matchingHits`/party membership, upstream. This
 * only ever runs once that's already settled, over data already agreed to be the same encounter.
 *
 * **Known gap: misses aren't pooled.** Only landed hits/heals are kept (`combat-stats.ts`'s own
 * `recentHits`/`recentHeals`), so a merged row's accuracy/hit-rate figures reflect only what your
 * own log saw swing, not what a party-mate's log also missed. Worth closing the day someone
 * actually wants an accurate merged accuracy figure; today's ask was the damage and healing totals.
 */
export function mergeFight(mine: MergeSource, peers: readonly MergeSource[]): MergedFight | null {
  if (isTruncated(mine) || peers.some(isTruncated)) return null;
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
    // `local`'s own `unsettled` is built from names its *own* window ever doubted — but misses
    // aren't replayed here (the gap above), so a name doubted only by a miss never re-enters the
    // merge at all and would otherwise go on being flagged "provisional" for a row that no longer
    // exists in `byCombatant`. The replay's own `unsettled` is recomputed fresh from what it
    // actually doubts, so it's what a reader of the merged breakdown should see instead.
    unsettled: merged.unsettled,
  };
}
