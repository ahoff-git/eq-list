/**
 * session-stats.ts — live per-session XP/kill tracking from the log.
 *
 * EQ logs no XP amount, so "XP" here is a count of experience-gain messages. EQ
 * also doesn't say which mob an XP gain came from, so we attribute each gain to
 * the most recent kill within a short window — the log emits the "slain" line
 * immediately before the "you gain experience" line. Heuristic, but good enough
 * for "what am I getting XP from." Emits `change` (with a fresh snapshot) so main
 * can broadcast to the windows.
 */
import { EventEmitter } from "node:events";
import type { XpEvent, SessionStats } from "../src/shared/types";

/** How long after a kill an XP gain is still attributed to it. */
const ATTRIBUTION_WINDOW_MS = 15_000;

export interface SessionTracker {
  recordKill(target: string, at: string): void;
  recordXp(event: XpEvent): void;
  snapshot(): SessionStats;
  reset(): void;
  onChange(cb: (stats: SessionStats) => void): void;
}

/** Parse a naive-local (or ISO) timestamp to ms; NaN-safe. */
function ms(at: string): number {
  const t = Date.parse(at);
  return Number.isNaN(t) ? 0 : t;
}

export function createSessionStats(nowIso: () => string = () => new Date().toISOString()): SessionTracker {
  const bus = new EventEmitter();
  const byMob = new Map<string, { kills: number; xp: number }>();
  let startedAt = nowIso();
  let totalXp = 0;
  let partyXp = 0;
  let soloXp = 0;
  let totalPct = 0;
  let kills = 0;
  let lastKill: { target: string; at: number } | null = null;

  const mobEntry = (mob: string) => {
    let e = byMob.get(mob);
    if (!e) byMob.set(mob, (e = { kills: 0, xp: 0 }));
    return e;
  };

  const snapshot = (): SessionStats => ({
    startedAt,
    totalXp,
    partyXp,
    soloXp,
    totalPct: Math.round(totalPct * 1000) / 1000,
    kills,
    byMob: [...byMob.entries()]
      .map(([mob, v]) => ({ mob, kills: v.kills, xp: v.xp }))
      .sort((a, b) => b.xp - a.xp || b.kills - a.kills || a.mob.localeCompare(b.mob)),
  });

  const emit = () => bus.emit("change", snapshot());

  return {
    recordKill(target, at) {
      const mob = target || "Unknown";
      mobEntry(mob).kills += 1;
      kills += 1;
      lastKill = { target: mob, at: ms(at) };
      emit();
    },
    recordXp(event) {
      totalXp += 1;
      if (event.party) partyXp += 1;
      else soloXp += 1;
      if (event.pct) totalPct += event.pct;
      if (lastKill) {
        const delta = ms(event.at) - lastKill.at;
        if (delta >= -2000 && delta < ATTRIBUTION_WINDOW_MS) mobEntry(lastKill.target).xp += 1;
      }
      emit();
    },
    snapshot,
    reset() {
      byMob.clear();
      startedAt = nowIso();
      totalXp = partyXp = soloXp = totalPct = kills = 0;
      lastKill = null;
      emit();
    },
    onChange: (cb) => void bus.on("change", cb),
  };
}
