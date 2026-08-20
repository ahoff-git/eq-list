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
 * Peers' observations *are* stored, **keyed by contributor id** and deliberately **kept apart from
 * yours**. Pooling makes a drop rate far more useful — six players' kills of the same mob are one
 * much better sample — and simultaneously less verifiable, so provenance is preserved rather than
 * blended away: every merged figure still knows how much of it you saw yourself, and which
 * contributors the rest came from. Nothing a peer says can change what your own log recorded.
 *
 * The storage rules — keyed by id, replace on report, keep what an un-share taught, vet on arrival,
 * bounded per contributor — are not this module's to invent: they are the same five rules the shared
 * kill positions want, and they live in [contributions.ts](./contributions.ts). What's left here is
 * the only part that is really about mobs: **what makes an observation possible**, which is the
 * vetting below.
 */
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { mergeObservations, type MobKnowledge, type MobObservation } from "../src/shared/mob-stats";
import { samePlace } from "../src/shared/zones/place";
import { plausible } from "../src/shared/estimates";
import type { Contributor, KnowledgeContributor } from "../src/shared/contributors";
import { createContributions, type Contributed } from "./contributions";
import type { KillLog } from "./kill-log";

const log = createLogger("mob-knowledge");

/** Per contributor, so one chatty client can't crowd out everyone else. */
const MAX_OBSERVATIONS_PER_PEER = 2000;

/**
 * What a kill count may be before it stops being a claim about an evening's play.
 *
 * A bound rather than a guess at a real ceiling: the point is to reject a number that could only be
 * a bug or a lie — one that would swamp every honest sample it is pooled with — not to police how
 * much anybody plays. Discarded, never clamped: against a figure that is only ever added to, a
 * clamped value is a wrong answer nobody can take back (`estimates.ts` rule 2).
 */
const KILLS_PLAUSIBLE = { min: 0, max: 1_000_000 };

const isFinNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Keep only well-formed, *possible* observations from a peer.
 *
 * Peer payloads are untrusted (see the IPC trust boundary), and there are two different ways one can
 * be wrong. A bad **shape** would poison rates outright — a non-numeric `kills` makes every derived
 * rate NaN — and would be written to disk. An impossible **value** is subtler and worse: it is
 * well-formed, so it survives every later check, and it silently distorts the pool. The one that
 * matters is a drop counted more often than the mob was killed, because `observeMobs` counts a drop
 * per kill rather than per loot line precisely so a rate stays a probability; a peer reporting
 * otherwise is describing something that cannot have happened, and pooling it would push a rate over
 * 100%.
 *
 * Both are checked at the one point everything a peer sends passes through, and bad ones dropped.
 */
export function sanitizeObservations(input: unknown[]): MobObservation[] {
  const out: MobObservation[] = [];
  for (const o of input) {
    if (!o || typeof o !== "object") continue;
    const r = o as Record<string, unknown>;
    if (typeof r.mob !== "string" || !r.mob.trim()) continue;
    if (typeof r.zone !== "string" || !r.zone.trim()) continue;
    if (!isFinNum(r.kills) || !plausible(r.kills, KILLS_PLAUSIBLE)) continue;
    const kills = r.kills;

    const drops: Record<string, number> = {};
    if (r.drops && typeof r.drops === "object" && !Array.isArray(r.drops)) {
      for (const [item, count] of Object.entries(r.drops as Record<string, unknown>)) {
        // A drop is counted once per kill, so it can never outnumber the kills it came from.
        if (isFinNum(count) && count >= 0 && count <= kills) drops[item] = count;
      }
    }

    const clean: MobObservation = {
      mob: r.mob,
      zone: r.zone,
      kills,
      drops,
      copper: isFinNum(r.copper) && r.copper >= 0 ? r.copper : 0,
      lastAt: typeof r.lastAt === "string" ? r.lastAt : "",
    };
    const a = r.area as Record<string, unknown> | undefined;
    if (a && typeof a === "object" && isFinNum(a.y) && isFinNum(a.x) && isFinNum(a.spread) && isFinNum(a.samples)) {
      clean.area = { y: a.y, x: a.x, spread: a.spread, samples: a.samples };
    }
    out.push(clean);
  }
  return out;
}

export interface MobKnowledgeStore {
  /** Your own observations, in the form peers receive them. */
  mine(zone?: string): MobObservation[];
  /** Yours pooled with everything peers have told us. */
  all(zone?: string): MobKnowledge[];
  /** File a contributor's observations, replacing whatever they told us before. */
  report(by: Contributor, observations: unknown[]): void;
  /** Who has told us what, newest report first. */
  contributors(): KnowledgeContributor[];
  /** Forget one contributor's contributions, or everybody's. Your own are derived and unaffected. */
  forgetPeers(id?: string): void;
  flush(): void;
}

export function createMobKnowledge(userDataDir: string, killLog: KillLog): MobKnowledgeStore {
  const store = createContributions<MobObservation>({
    file: path.join(userDataDir, "mob-knowledge.json"),
    what: "mob knowledge",
    concern: "peer-knowledge",
    cap: MAX_OBSERVATIONS_PER_PEER,
    sanitize: sanitizeObservations,
    // Stamped on the way out rather than on the way in: the id is the key the row is filed under, so
    // storing it inside the row as well would be a second copy of the same fact, free to drift.
    credit: (obs, by) => ({ ...obs, by: by.name, byId: by.id }),
  });

  // Asked by place, not by string (`samePlace`, ADR 0083): rows are stored with whatever the log — or
  // a peer's log — called the zone, so the question has to reach every difficulty variant (ADR 0059)
  // and every spelling of it (ADR 0075). A peer whose pack labels the zone a letter differently would
  // otherwise have their whole tally for the camp you're standing in filtered out of yours.
  const forZone = (obs: MobObservation[], zone?: string): MobObservation[] =>
    zone ? obs.filter((o) => samePlace(o.zone, zone)) : obs;

  return {
    mine: (zone) => forZone(killLog.observations(), zone),

    all: (zone) => mergeObservations(forZone(killLog.observations(), zone), forZone(store.pooled(), zone)),

    report(by, observations) {
      store.report(by, observations);
      log.debug("peer observations filed", { by: by.id, name: by.name });
    },

    contributors: () =>
      store.all().map(
        ({ by, seenAt, data }: Contributed<MobObservation>): KnowledgeContributor => ({
          by,
          seenAt,
          observations: data.length,
          kills: data.reduce((n, o) => n + o.kills, 0),
        }),
      ),

    forgetPeers: (id) => store.forget(id),

    flush: () => store.flush(),
  };
}
