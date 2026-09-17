/**
 * combat-history-reports.ts — the row shape behind `combat_fights`, and the from-scratch
 * computation `combat-history.ts`'s `zones()`/`bests()`/`sessions()` all answer with.
 *
 * Bundled into **one** computation rather than three: every one of them folds the same fetched
 * rows, so computing them together means the table — uncapped since ADR 0243, and each row a
 * fight's whole breakdown (`FightStats`: every combatant, spell, damage cell, per-second sample) —
 * gets scanned and JSON-parsed once per refresh instead of three times.
 *
 * Split out of `combat-history.ts` for the same reason `kill-observations.ts` was split from
 * `kill-log.ts`: `computeCombatReports` needs to run against a `Database` handle from anywhere —
 * the main process (the one-time seed, and the synchronous fallback) or `background-cache-worker.ts`'s
 * own read-only connection to the same file (`combat-history.ts` points a `createBackgroundCache`
 * at this module's compiled output by name — ADR 0247). This file has no side effects and opens no
 * connection of its own.
 */
import type { Database } from "better-sqlite3";
import { opponentOf } from "../src/shared/damage-tree";
import { placeKey, placeName } from "../src/shared/zones/place";
import { ratio, round } from "../src/shared/numbers";
import type { FightBest, FightStats, SessionSummary, StoredFight, ZoneReport } from "../src/shared/types";

export interface FightRow {
  id: string;
  key: string;
  sessionId: string;
  label: string;
  zone: string | null;
  logFile: string | null;
  startedAt: string;
  endedAt: string;
  unsourced: number | null;
  statsJson: string;
  adminAudit: string | null;
}

export function rowToFight(r: FightRow): StoredFight {
  return {
    id: r.id,
    key: r.key,
    sessionId: r.sessionId,
    label: r.label,
    zone: r.zone ?? undefined,
    logFile: r.logFile ?? undefined,
    unsourced: r.unsourced ? true : undefined,
    stats: JSON.parse(r.statsJson) as FightStats,
  };
}

/**
 * What the fight is called in the list: whatever your side damaged most (`opponentOf`).
 *
 * Recomputed on **read**, not trusted from the file, so fights already on disk get today's rule
 * rather than the one that named a group-mate — the stored `label` column is a cache, and this is
 * the cheapest form of the "re-derive stored fights" ADR 0021 left open.
 */
export function labelFor(fight: FightStats): string {
  return opponentOf(fight) ?? "unknown";
}

export interface CombatReports {
  zones: ZoneReport[];
  bests: FightBest[];
  sessions: SessionSummary[];
  /**
   * Every fight, label recomputed fresh (`labelFor`) rather than trusted from the stored column —
   * same as `zones`/`bests`/`sessions`, so `combat-history.ts`'s `search()` can filter this instead
   * of running its own full table scan + JSON parse on every keystroke.
   */
  searchIndex: StoredFight[];
}

export function computeCombatReports(db: Database): CombatReports {
  const fights = (db.prepare(`SELECT * FROM combat_fights`).all() as FightRow[]).map(rowToFight);

  // -- zones: grouped by **place**, not by the string each fight stored (ADR 0083) --
  const byZone = new Map<string, ZoneReport>();
  // -- bests: your top DPS per opponent, keyed by the label the list shows (`labelFor`, above) --
  const best = new Map<string, FightBest>();
  // -- sessions: one row per sitting, bounded by its first and last fight --
  const bySession = new Map<string, SessionSummary>();
  // -- searchIndex: same fights, label refreshed once here rather than trusted from the row --
  const searchIndex: StoredFight[] = [];

  for (const f of fights) {
    if (f.zone) {
      const key = placeKey(f.zone);
      const zone = byZone.get(key) ?? {
        zone: placeName(f.zone),
        fights: 0,
        kills: 0,
        combatSec: 0,
        xpPct: 0,
        xpPerMin: 0,
        copper: 0,
        soldCopper: 0,
        copperPerMin: 0,
        yourDealt: 0,
        dps: 0,
        lastAt: f.stats.endedAt,
      };
      zone.fights += 1;
      zone.kills += f.stats.kills;
      zone.combatSec += f.stats.durationSec;
      zone.xpPct += f.stats.xpPct;
      // Fights stored before coin was parsed have neither figure — nothing, not zero, so a
      // per-minute rate over a mixed history is honest about the fights it can account for.
      zone.copper += f.stats.copper ?? 0;
      zone.soldCopper += f.stats.soldCopper ?? 0;
      zone.yourDealt += f.stats.yourDealt;
      if (f.stats.unsettled?.length) zone.unsettled = true; // the camp inherits it too
      if (f.stats.endedAt > zone.lastAt) zone.lastAt = f.stats.endedAt;
      byZone.set(key, zone);
    }

    // "Best" is your DPS in the fight, which is what a personal best means here.
    const dps = ratio(f.stats.yourDealt, f.stats.durationSec, 1);
    const label = labelFor(f.stats);
    const cur = best.get(label);
    if (!cur || dps > cur.dps) best.set(label, { label, yourDealt: f.stats.yourDealt, dps, at: f.stats.endedAt });
    // The label just computed for `best`, reused rather than a second `labelFor` call — only a new
    // object when the fresh label actually differs from the stored one.
    searchIndex.push(label === f.label ? f : { ...f, label });

    const session = bySession.get(f.sessionId) ?? {
      sessionId: f.sessionId,
      startedAt: f.stats.startedAt,
      endedAt: f.stats.endedAt,
      fights: 0,
      combatSec: 0,
      totalDealt: 0,
      yourDealt: 0,
      yourTaken: 0,
    };
    session.fights += 1;
    session.combatSec += f.stats.durationSec;
    session.totalDealt += f.stats.totalDealt;
    session.yourDealt += f.stats.yourDealt;
    session.yourTaken += f.stats.yourTaken;
    // One doubtful fight makes the sitting's totals doubtful — a sum inherits its parts (ADR 0130).
    if (f.stats.unsettled?.length) session.unsettled = true;
    // Fights are appended in order, so first/last seen bound the session.
    if (f.stats.startedAt && f.stats.startedAt < session.startedAt) session.startedAt = f.stats.startedAt;
    if (f.stats.endedAt > session.endedAt) session.endedAt = f.stats.endedAt;
    bySession.set(f.sessionId, session);
  }

  // Rates are computed once at the end, from the summed parts.
  for (const z of byZone.values()) {
    z.xpPct = round(z.xpPct, 3);
    z.xpPerMin = ratio(z.xpPct, z.combatSec / 60, 2);
    z.copperPerMin = ratio(z.copper + z.soldCopper, z.combatSec / 60, 1);
    z.dps = ratio(z.yourDealt, z.combatSec, 1);
  }

  return {
    zones: [...byZone.values()].sort((a, b) => b.xpPerMin - a.xpPerMin || b.kills - a.kills),
    bests: [...best.values()].sort((a, b) => b.dps - a.dps),
    sessions: [...bySession.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    // Newest first, by the log's own clock — the same order `combat-history.ts`'s `byNewest` sorts
    // `fights()`/the old `search()` in, duplicated here rather than imported to avoid a dependency
    // back onto that file (see this module's own header on why the direction only ever runs one way).
    searchIndex: searchIndex.sort((a, b) => b.stats.startedAt.localeCompare(a.stats.startedAt)),
  };
}
