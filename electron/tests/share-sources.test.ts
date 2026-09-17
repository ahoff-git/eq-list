/**
 * `shareSources` — the app's own data, as the share hub reads it (`peer-share-hub.ts`).
 *
 * `mobs`/`kills`/`respawns` used to read one store apiece: the kill log, or the spawn tracker's own
 * learning. Since [ADR 0242](../../specs/decisions/0242-a-pooled-row-keeps-its-own-origin.md) each
 * also reads the *pooled* half — what a peer once taught this install, kept after they left — so
 * this is the one place that composition is worth testing on its own, independent of both the hub's
 * behaviour (`peer-hub.test.ts`) and the pure wire rules (`peer-share.test.ts`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { shareSources } from "../../src/shared/peer-share-hub";
import type { KillRecord, KnownSpawn, Settings } from "../../src/shared/types";
import type { SharedRespawn } from "../../src/shared/peer-share";
import type { SharedKill } from "../../src/shared/kill-filters";
import type { MobObservation } from "../../src/shared/mob-stats";

const SETTINGS = {} as Settings;

function rig(over: {
  ownObservations?: MobObservation[];
  ownKillVersion?: number;
  pooledMobs?: MobObservation[];
  pooledMobVersion?: number;
  ownKills?: KillRecord[];
  pooledKills?: SharedKill[];
  pooledKillVersion?: number;
  knownRespawns?: KnownSpawn[];
  pooledRespawns?: SharedRespawn[];
  factionRows?: unknown[];
} = {}) {
  return shareSources({
    getList: () => ({ entries: [] }),
    getSettings: () => SETTINGS,
    killLog: {
      kills: () => over.ownKills ?? [],
      observations: () => over.ownObservations ?? [],
      version: () => over.ownKillVersion ?? 0,
    },
    mobKnowledge: {
      pooled: () => over.pooledMobs ?? [],
      version: () => over.pooledMobVersion ?? 0,
    },
    peerKills: {
      all: () => over.pooledKills ?? [],
      version: () => over.pooledKillVersion ?? 0,
    },
    peerRespawns: { all: () => over.pooledRespawns ?? [] },
    factions: { rows: () => over.factionRows ?? [] },
    spawns: { view: () => ({ running: [], known: over.knownRespawns ?? [] }) },
    buffs: { view: () => ({ active: [] }) },
    scores: { board: () => ({ scores: [] }) },
    gameClock: { reading: () => null },
  });
}

const obs = (mob: string, byId?: string): MobObservation => ({
  mob,
  zone: "Blackburrow",
  kills: 3,
  drops: {},
  lastAt: "2026-01-01T00:00:00Z",
  ...(byId ? { byId, by: "Bran" } : {}),
});

test("mobs offers what we saw and what the room once taught us, together", () => {
  const ours = obs("a gnoll");
  const theirs = obs("a gnoll pup", "c-11111111-1111-1111-1111-111111111111");
  const sources = rig({ ownObservations: [ours], pooledMobs: [theirs] });
  assert.deepEqual(sources.mobs.rows(), [ours, theirs]);
});

test("mobs' version moves when either half does, and only then", () => {
  const a = rig({ ownKillVersion: 1, pooledMobVersion: 1 });
  const b = rig({ ownKillVersion: 1, pooledMobVersion: 2 }); // only the pool moved
  const c = rig({ ownKillVersion: 2, pooledMobVersion: 1 }); // only our own log moved
  assert.notEqual(a.mobs.version?.(), b.mobs.version?.());
  assert.notEqual(a.mobs.version?.(), c.mobs.version?.());
  assert.equal(a.mobs.version?.(), rig({ ownKillVersion: 1, pooledMobVersion: 1 }).mobs.version?.());
});

test("kills reduces our own to what a peer may draw, and adds the pool as-is", () => {
  const own = { id: "k1", logId: 1, at: "2026-01-01T00:00:00Z", mob: "a gnoll", zone: "Blackburrow", y: 10, x: 20, confidence: 0.9 } as KillRecord;
  const pooled: SharedKill = { zone: "Befallen", mob: "a rat", y: 1, x: 2, confidence: 0.5, by: "Bran", byId: "c-1" };
  const sources = rig({ ownKills: [own], pooledKills: [pooled] });
  assert.deepEqual(sources.kills.rows(), [{ zone: "Blackburrow", mob: "a gnoll", y: 10, x: 20, confidence: 0.9 }, pooled]);
});

test("kills' version moves when either half does, and only then", () => {
  const a = rig({ ownKillVersion: 1, pooledKillVersion: 1 });
  const b = rig({ ownKillVersion: 1, pooledKillVersion: 2 });
  assert.notEqual(a.kills.version?.(), b.kills.version?.());
});

test("respawns reduces our own learning to its conclusion, and adds the pool as-is", () => {
  const known = {
    key: "k",
    mob: "a named",
    place: "Blackburrow",
    samples: 2,
    shortestSeconds: 300,
    longestSeconds: 900,
    lastKillAt: "2026-01-01T00:00:00Z",
    gaps: [],
    crossedDifficulty: 0,
    notify: true,
  } as unknown as KnownSpawn;
  const pooled: SharedRespawn = { key: "k2", mob: "a rat king", place: "Befallen", samples: 4, by: "Bran", byId: "c-1" };
  const sources = rig({ knownRespawns: [known], pooledRespawns: [pooled] });
  const rows = sources.respawns.rows() as (SharedRespawn & { notify?: boolean })[];
  assert.equal(rows.length, 2);
  assert.equal(rows[0].notify, undefined, "the settings half of a KnownSpawn never leaves");
  assert.deepEqual(rows[1], pooled);
});

test("a room with nothing pooled behaves exactly as it always did", () => {
  const sources = rig();
  assert.deepEqual(sources.mobs.rows(), []);
  assert.deepEqual(sources.kills.rows(), []);
  assert.deepEqual(sources.respawns.rows(), []);
});

test("factions reads straight off the wiki's own held pages — no reduction, no version", () => {
  const page = { kind: "faction", title: "Wharf Rats", wikiPath: "/Wharf_Rats", sources: [], components: [], rewards: [], fetchedAt: "2026-01-01T00:00:00Z" };
  const sources = rig({ factionRows: [page] });
  assert.deepEqual(sources.factions.rows(), [page]);
  assert.equal(sources.factions.version, undefined, "unversioned, like the other small kinds");
});
