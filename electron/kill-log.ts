/**
 * kill-log.ts — where each kill happened, and how much to believe it.
 *
 * A heatmap can only be as accurate as the player is: EQ logs a position **only when you
 * type `/loc`**, so a kill's location is always inferred from the last fix. That's exact at
 * a static camp and a guess the moment you move — so rather than pretend, every kill is
 * stored with the evidence behind it and a confidence figure derived from it:
 *
 *   - the fix used, and **how old it was** when the kill landed;
 *   - the fix before it, giving distance, elapsed time and an **implied speed** — a player
 *     who was demonstrably moving was probably not where the last fix said;
 *   - a **dead-reckoned** guess when both fixes are known: the same course and speed,
 *     carried forward for the age of the fix. Flagged as a guess, because it is one.
 *
 * Deliberately generous: everything that went into the guess is recorded, so the display
 * can be reworked — plot only what's trustworthy, fade by confidence, or show the drift —
 * without having to collect it all again.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createLogger } from "../src/shared/logging";
import type { KillRecord, LocEvent, LootEvent } from "../src/shared/types";

const log = createLogger("kill-log");

/** A fix this fresh is treated as exact — you can't have gone far. */
const FRESH_SEC = 10;

/** Past this, the position isn't worth trusting: recorded, but not to be plotted as fact. */
const TRUST_HORIZON_SEC = 60;

/**
 * How long after a kill a drop is still taken to have come from that corpse. The log puts
 * the loot lines immediately after, and looting a corpse you killed a minute ago is normal,
 * so this is generous — but it's matched by name too, which does the real work.
 */
const LOOT_WINDOW_MS = 120_000;

/** Kills arrive in bursts; coalesce the writes. */
const WRITE_DEBOUNCE_MS = 3000;

/** Keep a generous but bounded history — enough for a heatmap of many evenings. */
const MAX_KILLS = 5000;

export interface KillLog {
  /** A `/loc` line: the new fix, and the one it replaces. */
  noteLoc(loc: LocEvent): void;
  /** A kill, placed at the best guess available and scored for how good that guess is. */
  record(mob: string, zone: string | null, at: string, logId: number): void;
  /** A drop, attached to the kill it most likely came from (matched by corpse and time). */
  noteLoot(event: LootEvent): void;
  /** Every kill recorded, newest first. */
  kills(zone?: string): KillRecord[];
  clear(): void;
  flush(): void;
}

/** Distance in EQ units between two points (the map's own coordinate space). */
function distance(a: { y: number; x: number }, b: { y: number; x: number }): number {
  return Math.round(Math.hypot(a.y - b.y, a.x - b.x));
}

export function createKillLog(userDataDir: string): KillLog {
  const file = path.join(userDataDir, "kill-log.json");
  let kills: KillRecord[] = read();
  let timer: NodeJS.Timeout | null = null;
  /** The last two position fixes, newest first. */
  let fixes: { y: number; x: number; at: number }[] = [];

  function read(): KillRecord[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { kills?: KillRecord[] };
      return Array.isArray(parsed.kills) ? parsed.kills : [];
    } catch {
      return []; // absent or unreadable — a heatmap is a nicety, never a hard failure
    }
  }

  function write(): void {
    timer = null;
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ kills }), "utf8");
    } catch (e) {
      log.warn("could not save kill log:", (e as Error).message);
    }
  }

  return {
    noteLoc(loc) {
      const at = Date.parse(loc.at);
      if (Number.isNaN(at)) return;
      fixes = [{ y: loc.y, x: loc.x, at }, ...fixes].slice(0, 2);
    },

    record(mob, zone, atIso, logId) {
      const at = Date.parse(atIso);
      if (Number.isNaN(at)) return;
      const [fix, prev] = fixes;

      // No fix at all: still worth recording that the kill happened, with no position.
      const ageSec = fix ? Math.max(0, Math.round((at - fix.at) / 1000)) : undefined;
      const movedSec = fix && prev ? Math.max(0, Math.round((fix.at - prev.at) / 1000)) : undefined;
      const movedUnits = fix && prev ? distance(fix, prev) : undefined;
      const speed = movedSec && movedUnits !== undefined ? Math.round(movedUnits / movedSec) : undefined;

      // Dead reckoning: same course and speed, carried on for as long as the fix is old.
      // Only offered when there's a course to extend and the player was actually moving.
      const guessed =
        fix && prev && ageSec !== undefined && movedSec && speed
          ? {
              y: Math.round(fix.y + ((fix.y - prev.y) / movedSec) * ageSec),
              x: Math.round(fix.x + ((fix.x - prev.x) / movedSec) * ageSec),
            }
          : undefined;

      const record: KillRecord = {
        id: randomUUID(),
        logId,
        at: atIso,
        mob,
        zone: zone ?? undefined,
        y: fix?.y,
        x: fix?.x,
        fixAgeSec: ageSec,
        prevY: prev?.y,
        prevX: prev?.x,
        movedUnits,
        movedSec,
        speed,
        guessedY: guessed?.y,
        guessedX: guessed?.x,
        confidence: confidenceFor(ageSec, speed),
      };

      kills.push(record);
      if (kills.length > MAX_KILLS) kills = kills.slice(-MAX_KILLS);
      if (!timer) timer = setTimeout(write, WRITE_DEBOUNCE_MS);
    },

    noteLoot(event) {
      const at = Date.parse(event.at);
      if (Number.isNaN(at) || !event.source) return;
      const source = event.source.toLowerCase();
      // Newest first: a corpse is looted right after it dies, and if the same kind of mob
      // has died twice the most recent one is the one being looted.
      for (let i = kills.length - 1; i >= 0; i--) {
        const kill = kills[i];
        const killAt = Date.parse(kill.at);
        if (Number.isNaN(killAt) || at - killAt > LOOT_WINDOW_MS) break; // too old to match
        if (kill.mob.toLowerCase() !== source) continue;
        kill.drops = [...(kill.drops ?? []), event.item];
        if (!timer) timer = setTimeout(write, WRITE_DEBOUNCE_MS);
        return;
      }
    },

    kills: (zone) => (zone ? kills.filter((k) => k.zone === zone) : [...kills]).reverse(),

    clear() {
      kills = [];
      write();
    },

    flush() {
      if (timer) clearTimeout(timer);
      write();
    },
  };
}

/**
 * How much to believe a kill's position, 0–1.
 *
 * Age is the main term: exact while the fix is fresh, sliding to nothing by the trust
 * horizon. Movement is the second: a player who covered ground between their last two
 * fixes was probably not standing where the newer one says, so the score is halved —
 * whereas one who hadn't moved at all is credible even with an older fix, which is exactly
 * the camp case a heatmap is for.
 */
function confidenceFor(ageSec?: number, speed?: number): number {
  if (ageSec === undefined) return 0;
  const byAge =
    ageSec <= FRESH_SEC
      ? 1
      : Math.max(0, 1 - (ageSec - FRESH_SEC) / (TRUST_HORIZON_SEC - FRESH_SEC));
  const moving = speed !== undefined && speed > 0;
  return Math.round(byAge * (moving ? 0.5 : 1) * 100) / 100;
}
