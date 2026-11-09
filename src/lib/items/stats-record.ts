"use client";
import { api } from "@/lib/api";
import { holdUnconfirmed } from "@/lib/stats-read";
import { hasStamp, stampStats } from "@/lib/items/stats-stamp";
import { MAX_PLAYER_LEVEL } from "@/shared/items/item-levels";
import { basisOf, type Basis } from "@/shared/items/stats-drift";
import { answeredStatsRecord, nextStatsRecord, type StatsRecord, type StatsUpdate } from "@/shared/items/stats-record";

/**
 * stats-record.ts (client) — the renderer's half of keeping what a stats read said
 * ([ADR 0371](../../../specs/decisions/0371-a-stats-record-is-kept-and-shared.md)).
 *
 * The record itself lives in the main process (`electron/stats-record.ts`): that is what survives a restart whatever
 * origin the window loads from, and what the peer room is offered. This only asks for it, folds a read into it
 * (`nextStatsRecord`) and hands it back — the rules are `stats-record.ts`'s. Each is a quiet no-op where there is
 * no desktop app to keep it (a browser).
 */

/** A read was applied: fold it into the record kept. */
export async function keepRead(update: StatsUpdate): Promise<void> {
  const held = (await api()?.statsRecord.get()) ?? null;
  await api()?.statsRecord.set(nextStatsRecord(held, update));
}

/** The player said yes (keep the figures as the game's own) or no (leave them out) to what the read wasn't sure of. */
export async function answerHeld(yes: boolean): Promise<void> {
  const held = await api()?.statsRecord.get();
  if (held?.held) await api()?.statsRecord.set(answeredStatsRecord(held, yes));
}

/** The player cleared their calibration: the record describes a read they have taken back, so it is forgotten. */
export async function forgetRecord(): Promise<void> {
  await api()?.statsRecord.set(null);
}

/**
 * At launch: what the last read left behind. Figures awaiting a yes come back to be asked about; and a stamp the
 * window has lost (a different origin, cleared site data) is put back from the record, so the "re-read your stats"
 * reminder still knows how old the read is. A stamp that is there is the window's own and is left alone.
 */
export async function restoreStatsRecord(): Promise<StatsRecord | null> {
  const record = (await api()?.statsRecord.get()) ?? null;
  if (!record) return null;
  if (record.held) holdUnconfirmed(record.held);
  if (!hasStamp()) stampStats(basisOf(record.race, record.classes, record.level ?? MAX_PLAYER_LEVEL), Date.parse(record.asOf));
  return record;
}

/**
 * A calibration with no stamp — one from before the reminder existed, from a preset, or whose stamp the window lost.
 * It is dated from the record when there is one (what it was read as, and when), and only otherwise from now, as the
 * builder's own `basis`. Asked of the record first because the builder's first render still holds the defaults (no
 * classes, the level cap), and stamping *those* as "now" would show a "classes changed" reminder the moment the real
 * pickers loaded.
 */
export async function stampUnstamped(basis: Basis): Promise<void> {
  const record = (await api()?.statsRecord.get()) ?? null;
  if (hasStamp()) return; // something stamped it while we asked
  if (record) stampStats(basisOf(record.race, record.classes, record.level ?? MAX_PLAYER_LEVEL), Date.parse(record.asOf));
  else stampStats(basis);
}
