/**
 * combat-history.ts — keeps finished fights so a past session can be dug into.
 *
 * The live tracker (`combat-stats.ts`) deliberately holds only "current fight" and
 * "session"; this is where fights go when they end. It's a **flat, bounded list of
 * fights**, each tagged with the session it belongs to — sessions are then *derived* by
 * grouping. One list means one size bound and no second thing to keep consistent: if a
 * fight is on disk, its session exists by definition.
 *
 * Persisted as JSON under the app's userData dir, written on a short debounce because
 * fights end in clusters (a pull every few seconds) and the file is small.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createLogger } from "../src/shared/logging";
import type { FightBest, FightStats, SessionSummary, StoredFight, ZoneReport } from "../src/shared/types";

const log = createLogger("combat-history");

/**
 * How many fights to keep, oldest dropped first. A busy evening is ~70 fights, so this
 * is a few weeks of play — enough to answer "how did last week go" without letting the
 * file grow without limit.
 */
const MAX_FIGHTS = 1000;

/** Fights arrive in bursts; coalesce the writes. */
const WRITE_DEBOUNCE_MS = 2000;

export interface CombatHistory {
  /**
   * File a finished fight under the current session, tagged with the zone it happened in
   * and the log file it came from (with `stats.logIds` and the timestamps, that's the way
   * back to the source lines — see ADR 0021).
   */
  add(fight: FightStats, zone?: string | null, logFile?: string | null): void;
  /** Per-zone totals across every recorded fight — which camp actually pays. */
  zones(): ZoneReport[];
  /** Your best recorded fight per opponent. */
  bests(): FightBest[];
  /** Past sessions, newest first. */
  sessions(): SessionSummary[];
  /** One session's fights, newest first. */
  fights(sessionId: string): StoredFight[];
  clear(): void;
  /** Write pending changes now (on quit). */
  flush(): void;
}

/**
 * The fight's headline opponent: the biggest damage dealer that isn't you or your pet,
 * else the biggest thing you hit. It's what makes a fight list readable ("Minotaur
 * Lord" rather than "fight at 00:42").
 */
function labelFor(fight: FightStats): string {
  const theirs = fight.byCombatant.filter((c) => !c.mine);
  const best = theirs.find((c) => c.dealt > 0) ?? [...theirs].sort((a, b) => b.taken - a.taken)[0];
  return best?.name ?? "unknown";
}

export function createCombatHistory(userDataDir: string, sessionId: string = randomUUID()): CombatHistory {
  const file = path.join(userDataDir, "combat-history.json");
  let fights: StoredFight[] = read();
  let timer: NodeJS.Timeout | null = null;

  function read(): StoredFight[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { fights?: StoredFight[] };
      return Array.isArray(parsed.fights) ? parsed.fights : [];
    } catch {
      return []; // absent or unreadable — history is a nicety, never a hard failure
    }
  }

  function write(): void {
    timer = null;
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ fights }), "utf8");
    } catch (e) {
      log.warn("could not save combat history:", (e as Error).message);
    }
  }

  function scheduleWrite(): void {
    if (!timer) timer = setTimeout(write, WRITE_DEBOUNCE_MS);
  }

  return {
    add(stats, zone, logFile) {
      fights.push({
        id: randomUUID(),
        sessionId,
        label: labelFor(stats),
        zone: zone ?? undefined,
        logFile: logFile ?? undefined,
        stats,
      });
      if (fights.length > MAX_FIGHTS) fights = fights.slice(-MAX_FIGHTS);
      log.debug("filed fight", { label: labelFor(stats), dealt: stats.totalDealt, kept: fights.length });
      scheduleWrite();
    },

    sessions() {
      const bySession = new Map<string, SessionSummary>();
      for (const f of fights) {
        const cur = bySession.get(f.sessionId) ?? {
          sessionId: f.sessionId,
          startedAt: f.stats.startedAt,
          endedAt: f.stats.endedAt,
          fights: 0,
          combatSec: 0,
          totalDealt: 0,
          yourDealt: 0,
          yourTaken: 0,
        };
        cur.fights += 1;
        cur.combatSec += f.stats.durationSec;
        cur.totalDealt += f.stats.totalDealt;
        cur.yourDealt += f.stats.yourDealt;
        cur.yourTaken += f.stats.yourTaken;
        // Fights are appended in order, so first/last seen bound the session.
        if (f.stats.startedAt && f.stats.startedAt < cur.startedAt) cur.startedAt = f.stats.startedAt;
        if (f.stats.endedAt > cur.endedAt) cur.endedAt = f.stats.endedAt;
        bySession.set(f.sessionId, cur);
      }
      return [...bySession.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
    },

    fights: (id) => fights.filter((f) => f.sessionId === id).reverse(),

    zones() {
      const byZone = new Map<string, ZoneReport>();
      for (const f of fights) {
        const zone = f.zone;
        if (!zone) continue; // a fight with no known zone can't be compared by zone
        const cur = byZone.get(zone) ?? {
          zone,
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
        cur.fights += 1;
        cur.kills += f.stats.kills;
        cur.combatSec += f.stats.durationSec;
        cur.xpPct += f.stats.xpPct;
        // Fights stored before coin was parsed have neither figure — nothing, not zero, so a
        // per-minute rate over a mixed history is honest about the fights it can account for.
        cur.copper += f.stats.copper ?? 0;
        cur.soldCopper += f.stats.soldCopper ?? 0;
        cur.yourDealt += f.stats.yourDealt;
        if (f.stats.endedAt > cur.lastAt) cur.lastAt = f.stats.endedAt;
        byZone.set(zone, cur);
      }
      // Rates are computed once at the end, from the summed parts.
      for (const z of byZone.values()) {
        z.xpPct = Math.round(z.xpPct * 1000) / 1000;
        z.xpPerMin = z.combatSec ? Math.round((z.xpPct / (z.combatSec / 60)) * 100) / 100 : 0;
        z.copperPerMin = z.combatSec
          ? Math.round(((z.copper + z.soldCopper) / (z.combatSec / 60)) * 10) / 10
          : 0;
        z.dps = z.combatSec ? Math.round((z.yourDealt / z.combatSec) * 10) / 10 : 0;
      }
      return [...byZone.values()].sort((a, b) => b.xpPerMin - a.xpPerMin || b.kills - a.kills);
    },

    bests() {
      const best = new Map<string, FightBest>();
      for (const f of fights) {
        // "Best" is your DPS in the fight, which is what a personal best means here.
        const dps = f.stats.durationSec ? Math.round((f.stats.yourDealt / f.stats.durationSec) * 10) / 10 : 0;
        const cur = best.get(f.label);
        if (!cur || dps > cur.dps) {
          best.set(f.label, { label: f.label, yourDealt: f.stats.yourDealt, dps, at: f.stats.endedAt });
        }
      }
      return [...best.values()].sort((a, b) => b.dps - a.dps);
    },

    clear() {
      fights = [];
      write();
    },

    flush() {
      if (timer) clearTimeout(timer);
      write();
    },
  };
}
