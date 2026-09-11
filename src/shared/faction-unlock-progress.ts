/**
 * faction-unlock-progress.ts — joining the race-unlock requirements against what the ledger has
 * actually seen, and deciding when that's worth an alert.
 *
 * **`FactionStanding.net` is not the character's total faction — it's what this app has observed
 * change since it started watching this character's logs** (`electron/faction-log.ts`). The guide's
 * "+2000 personal faction" target is the character's *lifetime* total, which nothing here can see: a
 * character could have started well above or below zero with a given faction, from race/class/deity
 * modifiers alone (the guide's own Introduction section). So `remaining` below is informational —
 * "how much movement has this app watched toward the goal" — never a claim that a race is or isn't
 * unlocked. Presenting a guess as settled is exactly what [ADR 0219](../../specs/decisions/0219-a-faction-cause-is-a-guess-from-timing.md)
 * exists to prevent for a hit's *cause*; the same caution applies here to a hit's *sum*.
 *
 * Pure and DOM-free, like `faction-sort.ts` and `faction-feed.ts`, so the join and the alert-worthy
 * diff can be pinned by tests rather than reasoned about inside a hook.
 */
import type { FactionStanding } from "./types";
import { RACE_UNLOCKS, type RaceUnlockRequirement } from "./race-unlocks";

/** "+2000 personal faction" — the guide's own stated target, the same for every required faction. */
export const RACE_UNLOCK_TARGET = 2000;

export interface FactionUnlockProgress {
  faction: string;
  /** Net change this app has observed for this faction — not the character's total. */
  net: number;
  target: number;
  /** `max(0, target - net)` — how much further *observed* movement is needed. Informational only. */
  remaining: number;
}

export interface RaceUnlockProgress {
  race: string;
  requirement: RaceUnlockRequirement;
  /** One entry per required faction, in the requirement's own order. Empty for a race unlocked some
   *  other way (`requirement.kind !== "factions"`). */
  factions: FactionUnlockProgress[];
}

/** Every race joined against the ledger's current standings, in `RACE_UNLOCKS`' own order. */
export function computeRaceUnlockProgress(standings: readonly FactionStanding[]): RaceUnlockProgress[] {
  const byFaction = new Map(standings.map((s) => [s.faction, s]));
  return RACE_UNLOCKS.map((requirement) => ({
    race: requirement.race,
    requirement,
    factions:
      requirement.kind === "factions"
        ? requirement.factions.map((faction) => {
            const net = byFaction.get(faction)?.net ?? 0;
            return { faction, net, target: RACE_UNLOCK_TARGET, remaining: Math.max(0, RACE_UNLOCK_TARGET - net) };
          })
        : [],
  }));
}

/** A watched race's faction moved between two progress snapshots. */
export interface RaceUnlockAlert {
  race: string;
  faction: string;
  net: number;
  delta: number;
}

/**
 * Which watched races changed between `prev` and `next` — an informational nudge ("this faction you
 * care about just moved"), never a threshold or "unlocked" claim, per the module header's caveat.
 * `watched` is the race names the reader opted into; a race nobody asked about produces no alert no
 * matter how much its factions moved.
 */
export function diffRaceUnlockProgress(
  prev: readonly RaceUnlockProgress[],
  next: readonly RaceUnlockProgress[],
  watched: ReadonlySet<string>,
): RaceUnlockAlert[] {
  if (watched.size === 0) return [];
  const before = new Map(prev.map((p) => [p.race, p]));
  const alerts: RaceUnlockAlert[] = [];
  for (const p of next) {
    if (!watched.has(p.race)) continue;
    const priorFactions = before.get(p.race)?.factions;
    for (const f of p.factions) {
      const prior = priorFactions?.find((b) => b.faction === f.faction)?.net;
      if (prior !== undefined && prior !== f.net) alerts.push({ race: p.race, faction: f.faction, net: f.net, delta: f.net - prior });
    }
  }
  return alerts;
}
