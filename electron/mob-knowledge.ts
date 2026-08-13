/**
 * mob-knowledge.ts — pooled knowledge about mobs: observed drop rates and roam areas.
 *
 * Your own share is **derived, never stored here**: it comes from the kill log every time it's
 * asked for, so there's exactly one record of what you killed and no second copy to drift
 * (the same reasoning as sessions being derived from stored fights, ADR 0016). It asks for
 * `observations()`, not `kills()` — the kill log bounds how many *records* it keeps, and folds
 * what the rest taught into observations of its own, so a rate here covers everything you've
 * killed rather than everything still on file
 * ([ADR 0056](../specs/decisions/0056-a-dropped-record-keeps-what-it-taught.md)).
 *
 * Peers' observations *are* stored, and deliberately **kept apart from yours**. Pooling makes
 * a drop rate far more useful — six players' kills of the same mob are one much better sample
 * — and simultaneously less verifiable, so provenance is preserved rather than blended away:
 * every merged figure still knows how much of it you saw yourself. Nothing a peer says can
 * change what your own log recorded.
 */
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { mergeObservations, observeMobs, type MobKnowledge, type MobObservation } from "../src/shared/mob-stats";
import { samePlace } from "../src/shared/zones/place";
import type { KillLog } from "./kill-log";

import { createSaver, readJson } from "./json-store";
const log = createLogger("mob-knowledge");

/** Reports arrive whenever a peer's tally changes; coalesce the writes. */
const WRITE_DEBOUNCE_MS = 4000;

/** Per peer, so one chatty client can't crowd out everyone else. */
const MAX_OBSERVATIONS_PER_PEER = 2000;

const isFinNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Keep only well-formed observations from a peer. Peer payloads are untrusted (see the IPC
 * trust boundary): a bad shape reaching the pool would poison rates — a non-numeric `kills`
 * makes every derived rate NaN — and would be written to disk. So each is checked and
 * coerced here, at the one point everything a peer sends passes through, and bad ones dropped.
 */
function sanitizeObservations(input: unknown[]): MobObservation[] {
  const out: MobObservation[] = [];
  for (const o of input) {
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    if (typeof r.mob !== "string" || !r.mob.trim()) continue;
    if (typeof r.zone !== "string" || !r.zone.trim()) continue;
    if (!isFinNum(r.kills) || r.kills < 0) continue;

    const drops: Record<string, number> = {};
    if (r.drops && typeof r.drops === "object" && !Array.isArray(r.drops)) {
      for (const [item, count] of Object.entries(r.drops as Record<string, unknown>)) {
        if (isFinNum(count) && count >= 0) drops[item] = count;
      }
    }

    const clean: MobObservation = {
      mob: r.mob,
      zone: r.zone,
      kills: r.kills,
      drops,
      copper: isFinNum(r.copper) && r.copper >= 0 ? r.copper : 0,
      lastAt: typeof r.lastAt === "string" ? r.lastAt : "",
    };
    const a = r.area as Record<string, unknown> | undefined;
    if (a && typeof a === "object" && isFinNum(a.y) && isFinNum(a.x) && isFinNum(a.spread) && isFinNum(a.samples)) {
      clean.area = { y: a.y, x: a.x, spread: a.spread, samples: a.samples };
    }
    if (typeof r.by === "string") clean.by = r.by;
    out.push(clean);
  }
  return out;
}

export interface MobKnowledgeStore {
  /** Your own observations, in the form peers receive them. */
  mine(zone?: string): MobObservation[];
  /** Yours pooled with everything peers have told us. */
  all(zone?: string): MobKnowledge[];
  /** File a peer's observations, replacing whatever they told us before. */
  report(by: string, observations: MobObservation[]): void;
  /** Forget peers' contributions. Your own are derived from the kill log and unaffected. */
  forgetPeers(): void;
  flush(): void;
}

export function createMobKnowledge(userDataDir: string, killLog: KillLog): MobKnowledgeStore {
  const file = path.join(userDataDir, "mob-knowledge.json");
  /** Peer name → their latest full set of observations. */
  let peers: Record<string, MobObservation[]> = read();
  const saver = createSaver(file, "mob knowledge", () => ({ peers }), WRITE_DEBOUNCE_MS);

  function read(): Record<string, MobObservation[]> {
    // Absent or unreadable is nothing pooled — a bonus, never load-bearing.
    const parsed = readJson<{ peers?: Record<string, MobObservation[]> }>(file, {});
    return parsed.peers && typeof parsed.peers === "object" ? parsed.peers : {};
  }

  // Asked by place, not by string (`samePlace`, ADR 0083): rows are stored with whatever the log — or
  // a peer's log — called the zone, so the question has to reach every difficulty variant (ADR 0059)
  // and every spelling of it (ADR 0075). A peer whose pack labels the zone a letter differently would
  // otherwise have their whole tally for the camp you're standing in filtered out of yours.
  const forZone = (obs: MobObservation[], zone?: string): MobObservation[] =>
    zone ? obs.filter((o) => samePlace(o.zone, zone)) : obs;

  return {
    mine: (zone) => forZone(killLog.observations(), zone),

    all(zone) {
      const theirs = Object.entries(peers).flatMap(([by, obs]) =>
        // Stamp the contributor on the way out, so the merge can credit them even if the
        // sender left it off.
        forZone(obs, zone).map((o) => ({ ...o, by: o.by ?? by })),
      );
      return mergeObservations(forZone(killLog.observations(), zone), theirs);
    },

    report(by, observations) {
      const name = by.trim();
      if (!name || !Array.isArray(observations)) return;
      // A peer's latest report *replaces* their previous one: they send their whole tally, so
      // adding would double-count everything they'd already told us. Untrusted, so validated.
      peers[name] = sanitizeObservations(observations as unknown[]).slice(0, MAX_OBSERVATIONS_PER_PEER);
      log.debug("peer observations filed", { by: name, mobs: peers[name].length });
      saver.save();
    },

    forgetPeers() {
      peers = {};
      saver.flush();
    },

    flush() {
      saver.flush();
    },
  };
}
