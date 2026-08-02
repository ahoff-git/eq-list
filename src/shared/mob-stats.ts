/**
 * mob-stats.ts — what we've learned about a mob by killing it repeatedly.
 *
 * The kill log records each kill with what it dropped and roughly where it happened
 * ([ADR 0022](../../specs/decisions/0022-invocation-effects-and-kill-locations.md)). Rolled
 * up per mob that becomes the three things a player actually wants to know and the wiki only
 * partly answers:
 *
 *   - **how often it drops what** — an observed rate, from your own kills;
 *   - **where it is** — the middle of where you've killed it, and how far that spreads;
 *   - **how much to believe both** — every figure carries its sample count, because "1 for 1"
 *     and "40 for 120" are not the same claim.
 *
 * The unit of sharing is the **observation** (`MobObservation`): counts, not raw kills. Counts
 * merge by addition, which is what makes a pooled rate across a group meaningful — six players'
 * observations of the same mob are one much better sample. It's also far smaller than the kills
 * behind it, and carries none of the observer's movements.
 *
 * Pure and DOM-free: main derives observations from the kill log, the renderer merges them for
 * display, and both use exactly this code.
 */
import { stripArticle } from "./log-parser";
import type { KillRecord } from "./types";

/** Positions this poor are ignored when working out where a mob lives. */
const AREA_MIN_CONFIDENCE = 0.2;

/**
 * The key to look mob knowledge up by. Kills arrive article-stripped ("a gnoll" → "gnoll",
 * via `parseKill`) but the wiki keeps the article ("a gnoll"), so a lookup has to fold the
 * article — and case — away for the two to meet. Idempotent on already-stripped names.
 */
export function mobKey(name: string): string {
  return stripArticle(name).toLowerCase().trim();
}

/** A mob's tally in one zone — the shareable unit. Counts, never raw kills. */
export interface MobObservation {
  mob: string;
  zone: string;
  /** Kills seen. The denominator for every rate below. */
  kills: number;
  /** How many of those kills dropped each item. */
  drops: Record<string, number>;
  /** The middle of where it was killed, and how far that spreads (EQ units). */
  area?: { y: number; x: number; spread: number; samples: number };
  /** Most recent kill, so stale knowledge can be told from fresh. */
  lastAt: string;
  /** Who observed it. Absent means "you". */
  by?: string;
}

/** One item's observed drop rate. */
export interface MobDrop {
  item: string;
  /** Kills that produced it. */
  count: number;
  /** `count / kills`, 0–1. A rate from three kills is not a rate; check `kills`. */
  rate: number;
}

/** Everything known about a mob in a zone, yours and peers' pooled. */
export interface MobKnowledge {
  mob: string;
  zone: string;
  kills: number;
  /** Kills you saw yourself, of the total — provenance for the rate. */
  myKills: number;
  drops: MobDrop[];
  area?: { y: number; x: number; spread: number; samples: number };
  lastAt: string;
  /** Names of everyone whose observations are in here (you are not listed). */
  contributors: string[];
}

/** Key a mob to its zone: the same mob elsewhere is a different animal to a hunter. */
const keyOf = (mob: string, zone: string): string => `${mob.toLowerCase()}|${zone.toLowerCase()}`;

/**
 * Roll your kill log up into observations. Kills with no zone are skipped — a drop rate that
 * can't be placed can't be compared with anything.
 *
 * Only kills that were **yours** count. The log reports every death in earshot, so a third of
 * a busy zone's records can be strangers' kills; counting them would pad the denominator with
 * corpses you never had the chance to loot and drag every rate down. A kill someone else
 * landed but you looted counts too — the loot is the proof you had it. Records stored before
 * the killer was captured have no `mine` and are taken at face value, since re-deciding them
 * now is impossible.
 */
export function observeMobs(kills: KillRecord[]): MobObservation[] {
  const byKey = new Map<string, MobObservation & { points: { y: number; x: number }[] }>();

  for (const kill of kills) {
    if (!kill.zone) continue;
    if (kill.mine === false && !kill.drops?.length) continue;
    const key = keyOf(kill.mob, kill.zone);
    let obs = byKey.get(key);
    if (!obs) {
      obs = { mob: kill.mob, zone: kill.zone, kills: 0, drops: {}, lastAt: kill.at, points: [] };
      byKey.set(key, obs);
    }
    obs.kills += 1;
    if (kill.at > obs.lastAt) obs.lastAt = kill.at;
    // Counted per *kill*, not per loot line: `drops` is the numerator of a per-kill rate, so
    // a corpse that yielded two of an item is still one kill that dropped it. Otherwise a
    // generous corpse pushes the rate over 100%, which is not a probability.
    for (const item of new Set(kill.drops ?? [])) obs.drops[item] = (obs.drops[item] ?? 0) + 1;
    // Only positions worth believing shape the roam area — see AREA_MIN_CONFIDENCE.
    if (kill.y !== undefined && kill.x !== undefined && kill.confidence >= AREA_MIN_CONFIDENCE) {
      obs.points.push({ y: kill.y, x: kill.x });
    }
  }

  return [...byKey.values()].map(({ points, ...obs }) => ({ ...obs, area: areaOf(points) }));
}

/** The centre of a set of positions and how far they spread from it. */
function areaOf(points: { y: number; x: number }[]): MobObservation["area"] {
  if (!points.length) return undefined;
  const y = points.reduce((n, p) => n + p.y, 0) / points.length;
  const x = points.reduce((n, p) => n + p.x, 0) / points.length;
  const spread = points.reduce((worst, p) => Math.max(worst, Math.hypot(p.y - y, p.x - x)), 0);
  return { y: Math.round(y), x: Math.round(x), spread: Math.round(spread), samples: points.length };
}

/**
 * Pool observations into per-mob knowledge. `mine` is kept apart in the result so a rate can
 * always be traced back to how much of it you saw yourself — pooled data is more useful *and*
 * less verifiable, and the reader should be able to tell.
 */
export function mergeObservations(mine: MobObservation[], theirs: MobObservation[]): MobKnowledge[] {
  const byKey = new Map<string, MobKnowledge & { areas: NonNullable<MobObservation["area"]>[] }>();

  const fold = (obs: MobObservation, isMine: boolean) => {
    const key = keyOf(obs.mob, obs.zone);
    let known = byKey.get(key);
    if (!known) {
      known = {
        mob: obs.mob,
        zone: obs.zone,
        kills: 0,
        myKills: 0,
        drops: [],
        lastAt: obs.lastAt,
        contributors: [],
        areas: [],
      };
      byKey.set(key, known);
    }
    known.kills += obs.kills;
    if (isMine) known.myKills += obs.kills;
    else if (obs.by && !known.contributors.includes(obs.by)) known.contributors.push(obs.by);
    if (obs.lastAt > known.lastAt) known.lastAt = obs.lastAt;
    if (obs.area) known.areas.push(obs.area);

    for (const [item, count] of Object.entries(obs.drops)) {
      const drop = known.drops.find((d) => d.item === item);
      if (drop) drop.count += count;
      else known.drops.push({ item, count, rate: 0 });
    }
  };

  for (const obs of mine) fold(obs, true);
  for (const obs of theirs) fold(obs, false);

  return [...byKey.values()]
    .map(({ areas, ...known }) => ({
      ...known,
      // Rates are computed once, at the end, from the pooled totals.
      drops: known.drops
        .map((d) => ({ ...d, rate: known.kills ? Math.round((d.count / known.kills) * 1000) / 1000 : 0 }))
        .sort((a, b) => b.rate - a.rate || a.item.localeCompare(b.item)),
      area: mergeAreas(areas),
      contributors: known.contributors.sort(),
    }))
    .sort((a, b) => b.kills - a.kills || a.mob.localeCompare(b.mob));
}

/**
 * Combine several observers' areas, weighting each by how many positions it came from — a
 * player who killed it forty times knows where it lives better than one who killed it once.
 */
function mergeAreas(areas: NonNullable<MobObservation["area"]>[]): MobObservation["area"] {
  if (!areas.length) return undefined;
  const samples = areas.reduce((n, a) => n + a.samples, 0);
  if (!samples) return undefined;
  const y = areas.reduce((n, a) => n + a.y * a.samples, 0) / samples;
  const x = areas.reduce((n, a) => n + a.x * a.samples, 0) / samples;
  // Spread has to cover every observer's spread *plus* how far their centres sit apart,
  // otherwise pooling would shrink the area rather than widen it.
  const spread = areas.reduce((worst, a) => Math.max(worst, a.spread + Math.hypot(a.y - y, a.x - x)), 0);
  return { y: Math.round(y), x: Math.round(x), spread: Math.round(spread), samples };
}
