/**
 * kill-log.ts — what died, where it happened, and how much to believe any of it.
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
 * The log reports every death in earshot, not just yours, so each record also carries
 * **who killed it**. Other people's kills are worth keeping — they are still evidence that
 * the thing spawns here — but they are marked, because counting them as yours would quietly
 * wreck every drop rate: you never looted those corpses.
 *
 * Deliberately generous: everything that went into the guess is recorded, so the display
 * can be reworked — plot only what's trustworthy, fade by confidence, or show the drift —
 * without having to collect it all again.
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createLogger } from "../src/shared/logging";
import { createNameRegistry } from "../src/shared/name-registry";
import { isYours } from "../src/shared/combat-parser";
import type { KillRecord, LocEvent, LootEvent } from "../src/shared/types";

const log = createLogger("kill-log");

/** A fix this fresh is treated as exact — you can't have gone far. */
const FRESH_SEC = 10;

/** Past this, the position isn't worth trusting: recorded, but not to be plotted as fact. */
const TRUST_HORIZON_SEC = 60;

/**
 * Movement below this between two fixes reads as standing still. `/loc` is only ever typed
 * by hand, so two fixes a few units apart mean a player who shuffled at their camp, not one
 * who travelled — and a camped player's position is exactly what a heatmap wants to trust.
 */
const STILL_UNITS = 5;

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
  /** Your character's name, so your own kills — and your pet's death — can be told apart. */
  setPlayer(name: string): void;
  /** A `/loc` line, and the zone it was taken in. */
  noteLoc(loc: LocEvent, zone: string | null): void;
  /** A kill, placed at the best guess available and scored for how good that guess is. */
  record(mob: string, killer: string, zone: string | null, at: string, logId: number): void;
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
  let player = "";
  /**
   * The last two position fixes, newest first, each tagged with the zone it was taken in —
   * a fix from the zone you just left says nothing about where you are now.
   */
  let fixes: { y: number; x: number; at: number; zone: string | null }[] = [];
  /**
   * One spelling per mob. Seeded from what's already stored so the canonical name survives
   * a restart — otherwise the spelling the file uses and the spelling this session picks
   * could differ, and the same mob would show up twice.
   */
  const { canon } = createNameRegistry(kills.map((k) => k.mob));

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

  function save(): void {
    if (!timer) timer = setTimeout(write, WRITE_DEBOUNCE_MS);
  }

  /** You or anything of yours, against the current `player` — `isYours` is shared with the
   *  damage meter so the two can't disagree about what counts as yours. */
  const isMine = (name: string): boolean => isYours(name, player);

  return {
    setPlayer(name) {
      player = name.trim();
      if (!player) return;
      // Now that we know who you are, records that were only ever your pet dying can go.
      // They were filed before the killer was captured and read as mobs you farm — one with
      // an observed drop rate of nothing, dragging down a camp report it was never part of.
      const kept = kills.filter((k) => !isMine(k.mob));
      if (kept.length === kills.length) return;
      log.debug("dropped", kills.length - kept.length, "of your own deaths from the kill log");
      kills = kept;
      save();
    },

    noteLoc(loc, zone) {
      const at = Date.parse(loc.at);
      if (Number.isNaN(at)) return;
      fixes = [{ y: loc.y, x: loc.x, at, zone }, ...fixes].slice(0, 2);
    },

    record(rawMob, killer, zone, atIso, logId) {
      const at = Date.parse(atIso);
      if (Number.isNaN(at)) return;
      const mob = canon(rawMob);
      // "Kainos`s warder has been slain by a kobold!" reads as a kill to the line parser,
      // but your own pet dying is not something you killed — and left in, it becomes a mob
      // you appear to farm, complete with an observed drop rate of nothing.
      if (isMine(mob)) return;

      // Only fixes from this zone can place this kill: zoning teleports you, so the last
      // `/loc` from the zone you left is not a stale position, it's a wrong one.
      const usable = fixes.filter((f) => f.zone === null || zone === null || f.zone === zone);
      const [fix, prev] = usable;

      // No fix at all: still worth recording that the kill happened, with no position.
      const ageSec = fix ? Math.max(0, Math.round((at - fix.at) / 1000)) : undefined;
      const movedSec = fix && prev ? Math.max(0, Math.round((fix.at - prev.at) / 1000)) : undefined;
      const movedUnits = fix && prev ? distance(fix, prev) : undefined;
      const speed = movedSec && movedUnits !== undefined ? Math.round(movedUnits / movedSec) : undefined;

      // Dead reckoning: same course and speed, carried on for as long as the fix is old.
      // Only offered when there's a course to extend and the player was actually moving.
      const moved = movedUnits !== undefined && movedUnits > STILL_UNITS;
      const guessed =
        fix && prev && ageSec !== undefined && movedSec && moved
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
        killer,
        mine: isMine(killer),
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
        confidence: confidenceFor(ageSec, moved, isMine(killer)),
      };

      kills.push(record);
      if (kills.length > MAX_KILLS) kills = kills.slice(-MAX_KILLS);
      save();
    },

    noteLoot(event) {
      const at = Date.parse(event.at);
      if (Number.isNaN(at) || !event.source) return;
      const source = event.source.toLowerCase();
      // Corpses linger and are looted in any order, so which one an item came from is a
      // guess whenever the same mob died more than once nearby. Prefer the newest corpse
      // that isn't already holding this item: two identical items and two corpses is far
      // more likely one each than both from one — and piling every drop onto the newest
      // kill would leave its neighbours looking like they dropped nothing, which is what
      // an observed drop rate is built from.
      let fallback: KillRecord | null = null;
      for (let i = kills.length - 1; i >= 0; i--) {
        const kill = kills[i];
        const killAt = Date.parse(kill.at);
        if (Number.isNaN(killAt)) continue; // a bad timestamp shouldn't end the search
        if (at - killAt > LOOT_WINDOW_MS) break; // older than the window: so is everything past it
        if (kill.mob.toLowerCase() !== source) continue;
        if (!fallback) fallback = kill;
        if (kill.drops?.includes(event.item)) continue;
        kill.drops = [...(kill.drops ?? []), event.item];
        save();
        return;
      }
      // Every candidate corpse already holds one: it really did drop two.
      if (fallback) {
        fallback.drops = [...(fallback.drops ?? []), event.item];
        save();
      }
    },

    kills: (zone) => (zone ? kills.filter((k) => k.zone === zone) : [...kills]).reverse(),

    clear() {
      kills = [];
      // The fixes describe where the cleared kills happened; keeping them would place the
      // next kill using evidence the player just asked us to forget.
      fixes = [];
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
 *
 * Someone else's kill is halved for the same reason: your `/loc` is evidence about where
 * *you* were standing, and the stranger who killed it was somewhere else in earshot. Still
 * worth plotting off a good fix — the mob was nearby — but never as well placed as your own.
 */
function confidenceFor(ageSec?: number, moved?: boolean, mine = true): number {
  if (ageSec === undefined) return 0;
  const byAge =
    ageSec <= FRESH_SEC
      ? 1
      : Math.max(0, 1 - (ageSec - FRESH_SEC) / (TRUST_HORIZON_SEC - FRESH_SEC));
  const penalty = (moved ? 0.5 : 1) * (mine ? 1 : 0.5);
  return Math.round(byAge * penalty * 100) / 100;
}
