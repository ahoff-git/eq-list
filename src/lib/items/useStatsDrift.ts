"use client";
import { useEffect, useMemo, useRef } from "react";
import { useBuffs, useSpellCatalog, useStatChanges } from "@/lib/hooks";
import { recordBuffMoves, useStatsStore } from "@/lib/items/stats-stamp";
import { ON_YOU } from "@/shared/buffs/buff-tracking";
import { movesStats } from "@/shared/buffs/stat-buffs";
import { driftReasons, movesBetween, type BoardEntry, type Reason, type StatsStamp } from "@/shared/items/stats-drift";
import type { BuffView } from "@/shared/buffs/buff-tracking";
import type { SpellRow } from "@/shared/spells/spell-search";

/** The titles of every spell the game files under a stat-moving category, lower-cased — one pass per catalogue. */
function statBuffTitles(rows: readonly SpellRow[]): Set<string> {
  const titles = new Set<string>();
  for (const row of rows) if (movesStats(row.category)) titles.add(row.spell.title.toLowerCase());
  return titles;
}

/** The stat buffs on you, up or lapsed, as `movesBetween` compares them. */
function boardOf(view: BuffView, statTitles: ReadonlySet<string>): BoardEntry[] {
  return [...view.active, ...view.lapsed]
    .filter((b) => b.target === ON_YOU && statTitles.has(b.spell.toLowerCase()))
    .map((b) => ({ key: b.key, spell: b.spell, up: b.up, at: b.at }));
}

/**
 * Watch the buff board for stat buffs coming and going, and keep the moves
 * ([ADR 0369](../../../specs/decisions/0369-a-stale-stats-read-says-so.md)). Mounted once, in the window that
 * is always there, so every move is seen and none is a reload's fiction: **the first look after a launch is
 * a baseline, not news** — the board starts empty on every launch and fills from the log, and diffing against
 * nothing would call every buff you have a new one.
 */
export function useRecordStatBuffMoves(): void {
  const view = useBuffs();
  const { rows } = useSpellCatalog();
  const statTitles = useMemo(() => statBuffTitles(rows), [rows]);
  const previous = useRef<BoardEntry[] | null>(null);
  useEffect(() => {
    // Without the catalogue nothing can be classified, and a baseline taken now would miss every buff.
    if (!statTitles.size) return;
    const now = boardOf(view, statTitles);
    if (previous.current) {
      const moves = movesBetween(previous.current, now);
      if (moves.length) recordBuffMoves(moves);
    }
    previous.current = now;
  }, [view, statTitles]);
}

/**
 * Whether the last read (or typed) stats can still be trusted, and if not, why: the stamp, with the log's
 * levels and abilities, the buffs that moved since, and the plan's own inputs set against it.
 * Empty `reasons` is "nothing the app can see has changed" — also what no stamp at all gives.
 */
export function useStatsDrift(): { stamp: StatsStamp | undefined; reasons: Reason[] } {
  const { stamp, moves, basisNow, calibrated } = useStatsStore();
  const changes = useStatChanges();
  // A calibration the builder says is gone has nothing left to go stale, whatever stamp it left behind.
  const reasons = useMemo(() => (stamp && calibrated !== false ? driftReasons({ stamp, changes, moves, basisNow }) : []), [stamp, changes, moves, basisNow, calibrated]);
  return { stamp, reasons };
}
