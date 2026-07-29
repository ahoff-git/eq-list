/**
 * mob-knowledge.ts — pooled knowledge about mobs: observed drop rates and roam areas.
 *
 * Your own share is **derived, never stored**: it comes from the kill log every time it's
 * asked for, so there's exactly one record of what you killed and no second copy to drift
 * (the same reasoning as sessions being derived from stored fights, ADR 0016).
 *
 * Peers' observations *are* stored, and deliberately **kept apart from yours**. Pooling makes
 * a drop rate far more useful — six players' kills of the same mob are one much better sample
 * — and simultaneously less verifiable, so provenance is preserved rather than blended away:
 * every merged figure still knows how much of it you saw yourself. Nothing a peer says can
 * change what your own log recorded.
 */
import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { mergeObservations, observeMobs, type MobKnowledge, type MobObservation } from "../src/shared/mob-stats";
import type { KillLog } from "./kill-log";

const log = createLogger("mob-knowledge");

/** Reports arrive whenever a peer's tally changes; coalesce the writes. */
const WRITE_DEBOUNCE_MS = 4000;

/** Per peer, so one chatty client can't crowd out everyone else. */
const MAX_OBSERVATIONS_PER_PEER = 2000;

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
  let timer: NodeJS.Timeout | null = null;

  function read(): Record<string, MobObservation[]> {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { peers?: Record<string, MobObservation[]> };
      return parsed.peers && typeof parsed.peers === "object" ? parsed.peers : {};
    } catch {
      return {}; // absent or unreadable — pooled knowledge is a bonus, never load-bearing
    }
  }

  function write(): void {
    timer = null;
    try {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ peers }), "utf8");
    } catch (e) {
      log.warn("could not save mob knowledge:", (e as Error).message);
    }
  }

  const forZone = (obs: MobObservation[], zone?: string): MobObservation[] =>
    zone ? obs.filter((o) => o.zone === zone) : obs;

  return {
    mine: (zone) => forZone(observeMobs(killLog.kills()), zone),

    all(zone) {
      const theirs = Object.entries(peers).flatMap(([by, obs]) =>
        // Stamp the contributor on the way out, so the merge can credit them even if the
        // sender left it off.
        forZone(obs, zone).map((o) => ({ ...o, by: o.by ?? by })),
      );
      return mergeObservations(forZone(observeMobs(killLog.kills()), zone), theirs);
    },

    report(by, observations) {
      const name = by.trim();
      if (!name || !Array.isArray(observations)) return;
      // A peer's latest report *replaces* their previous one: they send their whole tally, so
      // adding would double-count everything they'd already told us.
      peers[name] = observations.slice(0, MAX_OBSERVATIONS_PER_PEER);
      log.debug("peer observations filed", { by: name, mobs: peers[name].length });
      if (!timer) timer = setTimeout(write, WRITE_DEBOUNCE_MS);
    },

    forgetPeers() {
      peers = {};
      write();
    },

    flush() {
      if (timer) clearTimeout(timer);
      write();
    },
  };
}
