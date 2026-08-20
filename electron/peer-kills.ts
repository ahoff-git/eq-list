/**
 * peer-kills.ts — where other people killed things.
 *
 * A shared kill is the smallest useful thing one player can tell another: a mob, a zone, a position,
 * and how much to believe that position. Pooled, they are a camp's heatmap drawn by everyone who has
 * ever sat at it rather than by whoever happens to be looking.
 *
 * **These used to live nowhere.** They arrived over the room, sat in the map window's React state,
 * and were dropped when the connection blinked or the window closed — so an evening beside someone
 * who had been camping a spot for a month taught the map nothing that outlived the session, and the
 * peers' half of the heatmap disappeared the moment you went offline. Keeping them is the whole
 * point of pooling: this is the only record of that camp we will ever have, because we were not the
 * ones who took the measurements.
 *
 * What that costs, and why it's accepted: their positions are **not evidence about drops** and never
 * become any. A shared kill carries no time and no loot (see `sharedAsKill`), so it can only ever
 * put a dot on a map. That is what makes storing a stranger's claims safe — the worst a bad one can
 * do is draw a marker in the wrong place, where a bad *observation* would move a rate.
 *
 * Everything about how they're filed — keyed by contributor id, replaced per report, kept when
 * someone stops sharing, vetted on arrival, capped per contributor — is
 * [contributions.ts](./contributions.ts). Here: what a kill has to look like to be worth a dot.
 */
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { samePlace } from "../src/shared/zones/place";
import type { SharedKill } from "../src/shared/kill-filters";
import type { Contributor } from "../src/shared/contributors";
import { createContributions } from "./contributions";

const log = createLogger("peer-kills");

/**
 * Per contributor. Larger than the observation cap because these are one row per *kill* rather than
 * per mob-in-a-zone, and a heatmap is exactly the feature that wants the long tail — but bounded all
 * the same, since a peer decides how many they send and we decide how many we keep.
 */
const MAX_KILLS_PER_PEER = 5000;

/**
 * Below this, a position is a guess about a guess and draws nothing.
 *
 * Senders already filter to what they consider plottable, so this is not a duplicate of their check —
 * it is the receiving half of the same rule, applied because we cannot see how they made theirs. A
 * confidence outside 0–1 isn't a weak claim, it's a malformed one, and it's dropped rather than
 * clamped for the reason in `estimates.ts` rule 2.
 */
const MIN_CONFIDENCE = 0.2;

const isFinNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** Keep only kills that could be drawn: named, placed, in a zone, and honest about how sure they are. */
export function sanitizeKills(input: unknown[]): SharedKill[] {
  const out: SharedKill[] = [];
  for (const k of input) {
    if (!k || typeof k !== "object") continue;
    const r = k as Record<string, unknown>;
    if (typeof r.mob !== "string" || !r.mob.trim()) continue;
    if (typeof r.zone !== "string" || !r.zone.trim()) continue;
    if (!isFinNum(r.y) || !isFinNum(r.x)) continue;
    if (!isFinNum(r.confidence) || r.confidence < MIN_CONFIDENCE || r.confidence > 1) continue;
    out.push({ mob: r.mob, zone: r.zone, y: r.y, x: r.x, confidence: r.confidence });
  }
  return out;
}

export interface PeerKillStore {
  /** Everyone's shared kills, each credited to whoever shared it. Filtered to a place if asked. */
  all(zone?: string): SharedKill[];
  /** File a contributor's kills, replacing whatever they shared before. */
  report(by: Contributor, kills: unknown[]): void;
  /** Forget one contributor's kills, or everybody's. */
  forget(id?: string): void;
  flush(): void;
}

export function createPeerKills(userDataDir: string): PeerKillStore {
  const store = createContributions<SharedKill>({
    file: path.join(userDataDir, "peer-kills.json"),
    what: "peer kills",
    concern: "peer-kills",
    cap: MAX_KILLS_PER_PEER,
    sanitize: sanitizeKills,
    credit: (kill, by) => ({ ...kill, by: by.name, byId: by.id }),
  });

  return {
    // Grouped by place like every other reader (ADR 0083): a peer whose pack spells the zone
    // differently, or who was at a different difficulty, is still at this camp.
    all: (zone) => {
      const kills = store.pooled();
      return zone ? kills.filter((k) => samePlace(k.zone, zone)) : kills;
    },

    report(by, kills) {
      store.report(by, kills);
      log.debug("peer kills filed", { by: by.id, name: by.name });
    },

    forget: (id) => store.forget(id),

    flush: () => store.flush(),
  };
}
