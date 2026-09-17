/**
 * peer-respawns.ts — respawn intervals other players have learned at camps they sat at.
 *
 * The `respawns` share kind existed before this file did, but arriving `give`s were quietly
 * dropped: `fileContribution` (`ipc.ts`) knew what to do with `mobs` and `kills` and nothing about
 * `respawns`, so a peer's whole answer was read off the wire and then thrown away. This is the
 * missing half — the receiving store, on exactly the terms `peer-kills.ts` already keeps shared
 * kills on: keyed by contributor id, replaced per report, kept when someone stops sharing, vetted on
 * arrival, capped per contributor (`contributions.ts`'s five rules).
 *
 * A learned respawn is safe to pool for the same reason a shared kill is: it is a **conclusion**,
 * never the evidence behind it (`SharedRespawn` carries neither `gaps` nor `crossedDifficulty`), so
 * the worst a bad one can do is put a wrong number beside a camp — never move a rate the way a bad
 * *observation* could.
 */
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { classifyZoneLine, samePlace } from "../src/shared/zones/place";
import { isAdminAudit, type AdminAudit } from "../src/shared/admin";
import type { SharedRespawn } from "../src/shared/peer-share";
import type { Contributor } from "../src/shared/contributors";
import { createContributions } from "./contributions";
import { createArrayAdminStore, type AdminStore } from "./admin";

const log = createLogger("peer-respawns");

/** Per contributor — a camp's worth of intervals is a handful of rows, but a room has many camps. */
const MAX_RESPAWNS_PER_PEER = 2000;

/** A day is longer than any respawn in the game; a gap past it measured something else. */
const MAX_RESPAWN_SEC = 86_400;

const isFinNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Keep only respawns that could teach a camp something: named, placed, and honest about their
 * bounds. The same shortest-vs-longest check `readRespawn` makes on the way in, made again here for
 * the reason `sanitizeKills` gives: we cannot see how a peer made theirs, or whether they made one.
 *
 * `trustAdmin` is true only when re-reading our own saved file, never for a report a peer just sent —
 * see `contributions.ts`'s `sanitize` doc.
 */
export function sanitizeRespawns(input: unknown[], trustAdmin: boolean): SharedRespawn[] {
  const out: SharedRespawn[] = [];
  for (const r of input) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    if (typeof row.key !== "string" || !row.key.trim()) continue;
    if (typeof row.mob !== "string" || !row.mob.trim()) continue;
    // The same guard `sanitizeKills`/`sanitizeObservations` apply: an older build can still send the
    // client's zone-restriction notice mistaken for a place.
    if (typeof row.place === "string" && classifyZoneLine(row.place) === "blacklisted") continue;
    const shortest = seconds(row.shortestSeconds);
    const longest = seconds(row.longestSeconds);
    if (shortest !== undefined && longest !== undefined && shortest > longest) continue;
    const clean: SharedRespawn & { __admin?: AdminAudit } = {
      key: row.key,
      mob: row.mob,
      place: typeof row.place === "string" ? row.place : "",
      shortestSeconds: shortest,
      longestSeconds: longest,
      samples: isFinNum(row.samples) && row.samples >= 0 ? Math.min(row.samples, 100_000) : 0,
      lastKillAt: typeof row.lastKillAt === "string" ? row.lastKillAt : undefined,
    };
    if (trustAdmin && isAdminAudit(row.__admin)) clean.__admin = row.__admin;
    out.push(clean);
  }
  return out;
}

function seconds(v: unknown): number | undefined {
  return isFinNum(v) && v > 0 && v <= MAX_RESPAWN_SEC ? v : undefined;
}

export interface PeerRespawnStore {
  /** Everyone's shared respawns, each credited to whoever taught it to us. Filtered to a place if asked. */
  all(place?: string): SharedRespawn[];
  /** File a contributor's respawns, replacing whatever they shared before. */
  report(by: Contributor, respawns: unknown[]): void;
  /** Forget one contributor's respawns, or everybody's. */
  forget(id?: string): void;
  flush(): void;
  /** The hidden admin panel's view of every contributor's shared respawns — see `electron/admin.ts`. */
  admin: AdminStore;
}

export function createPeerRespawns(userDataDir: string): PeerRespawnStore {
  const store = createContributions<SharedRespawn>({
    file: path.join(userDataDir, "peer-respawns.json"),
    what: "peer respawns",
    concern: "peer-knowledge",
    cap: MAX_RESPAWNS_PER_PEER,
    sanitize: sanitizeRespawns,
    credit: (respawn, by) => ({ ...respawn, by: by.name, byId: by.id }),
  });

  return {
    all: (place) => {
      const respawns = store.pooled();
      return place ? respawns.filter((r) => samePlace(r.place, place)) : respawns;
    },

    report(by, respawns) {
      store.report(by, respawns);
      log.debug("peer respawns filed", { by: by.id, name: by.name });
    },

    forget: (id) => store.forget(id),

    flush: () => store.flush(),

    admin: createArrayAdminStore(
      "Peer respawns",
      () =>
        store.all().flatMap(({ by, data }) =>
          data.map((r, row) => Object.assign(r, { contributorId: by.id, contributorName: by.name, __row: row })),
        ),
      {
        idOf: (r) => `${r.contributorId}:${r.__row}`,
        summaryOf: (r) => `${r.mob} — ${r.place} (from ${r.contributorName})`,
        editable: ["mob", "place", "shortestSeconds", "longestSeconds", "samples"],
        remove: (r) => store.removeItem(r.contributorId, r.__row),
        save: () => store.flush(),
      },
    ),
  };
}
