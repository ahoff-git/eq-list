/**
 * kill-observations.ts — the row shapes behind `kill_records`/`mob_observations_frozen`, and the
 * from-scratch computation `kill-log.ts`'s `observations()` answers with.
 *
 * Split out of `kill-log.ts` for one reason: `computeObservations` needs to run against a
 * `Database` handle from *anywhere* — the main process (the one-time seed at startup, and the
 * synchronous fallback) or `background-cache-worker.ts`'s own read-only connection to the same file
 * (`kill-log.ts` points a `createBackgroundCache` — ADR 0247 — at this module's compiled output by
 * name) — and a worker loaded that way can't pull in `kill-log.ts` itself without dragging
 * `createKillLog` and everything it closes over along with it. This file has no side effects and
 * opens no connection of its own; every caller hands it the `Database` (and rows) to read.
 */
import type { Database } from "better-sqlite3";
import { observeMobs, sumObservations, type MobObservation } from "../src/shared/mob-stats";
import type { KillRecord } from "../src/shared/types";

/** A `kill_records` row, before it's shaped into a `KillRecord` (`rowToRecord`). */
export interface KillRow {
  id: string;
  key: string;
  logId: number;
  at: string;
  mob: string;
  killer: string | null;
  mine: number | null;
  sharedBy: string | null;
  named: number | null;
  killerNamed: number | null;
  zone: string | null;
  y: number | null;
  x: number | null;
  fixAgeSec: number | null;
  prevY: number | null;
  prevX: number | null;
  movedUnits: number | null;
  movedSec: number | null;
  speed: number | null;
  guessedY: number | null;
  guessedX: number | null;
  confidence: number;
  dropsJson: string | null;
  dropsKeyed: number;
  coin: number | null;
  adminAudit: string | null;
}

/** `undefined` for a nullable column an absent `KillRecord` field maps to — never `null`, so a
 *  round trip through `rowToRecord` matches what the original JSON-backed record shaped. */
const tri = (v: number | null): boolean | undefined => (v === null ? undefined : !!v);
const num = (v: number | null): number | undefined => v ?? undefined;
const str = (v: string | null): string | undefined => v ?? undefined;

export function rowToRecord(r: KillRow): KillRecord {
  const drops: string[] | undefined = r.dropsJson ? JSON.parse(r.dropsJson) : undefined;
  return {
    id: r.id,
    key: r.key,
    logId: r.logId,
    at: r.at,
    mob: r.mob,
    killer: str(r.killer),
    mine: tri(r.mine),
    sharedBy: str(r.sharedBy),
    named: tri(r.named),
    killerNamed: tri(r.killerNamed),
    zone: str(r.zone),
    y: num(r.y),
    x: num(r.x),
    fixAgeSec: num(r.fixAgeSec),
    prevY: num(r.prevY),
    prevX: num(r.prevX),
    movedUnits: num(r.movedUnits),
    movedSec: num(r.movedSec),
    speed: num(r.speed),
    guessedY: num(r.guessedY),
    guessedX: num(r.guessedX),
    confidence: r.confidence,
    ...(drops ? { drops } : {}),
    coin: num(r.coin),
  };
}

/** A `mob_observations_frozen` row, before it's shaped into a `MobObservation`. */
export interface FrozenObservationRow {
  mob: string;
  zone: string;
  kills: number;
  dropsJson: string;
  copper: number | null;
  areasJson: string;
  lastAt: string;
  by: string | null;
  byId: string | null;
}

export function rowToFrozenObservation(r: FrozenObservationRow): MobObservation {
  return {
    mob: r.mob,
    zone: r.zone,
    kills: r.kills,
    drops: JSON.parse(r.dropsJson),
    copper: r.copper ?? undefined,
    lastAt: r.lastAt,
    by: r.by ?? undefined,
    byId: r.byId ?? undefined,
    areas: JSON.parse(r.areasJson),
  };
}

/**
 * Every kill still held, folded with whatever a past `clear("records")` already retired —
 * `kill-log.ts`'s own `observations()` answers with exactly this, just from its live connection
 * instead of a passed-in one.
 *
 * `.reverse()`: the query reads `rowid DESC` (newest-inserted first), but `observeMobs`'s `points`
 * array — and `clusterAreas` after it — builds up in whatever order it's handed, and a near-tie in
 * `clusterAreas`'s greedy nearest-pair merge can round to a different integer centroid depending on
 * which of two equidistant pairs it meets first. The old array-backed store fed this oldest-first
 * (`push`-order); reversing here keeps a roam-area centroid from shifting by a stray EQ unit for a
 * player whose kill history hasn't actually changed.
 */
export function computeObservations(db: Database): MobObservation[] {
  const held = (db.prepare(`SELECT * FROM kill_records ORDER BY rowid DESC`).all() as KillRow[])
    .reverse()
    .map(rowToRecord);
  const frozen = (db.prepare(`SELECT * FROM mob_observations_frozen`).all() as FrozenObservationRow[]).map(
    rowToFrozenObservation,
  );
  return sumObservations(observeMobs(held), frozen);
}
