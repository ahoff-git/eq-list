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
 * **Two of these functions write and one reads, and they treat a zone name differently on purpose.**
 * `observeMobs` and `sumObservations` produce what gets stored and shared, so they key on the zone
 * **as the log wrote it** — two spellings of a camp are two rows. `mergeObservations` is the
 * aggregation, so it groups those rows by *place* and labels them from the mapping table
 * ([ADR 0083](../../specs/decisions/0083-a-zone-name-is-stored-raw-and-grouped-on-read.md)). That's
 * what keeps a drop rate re-derivable: fix the table and every rate ever computed follows.
 *
 * Pure and DOM-free: main derives observations from the kill log, the renderer merges them for
 * display, and both use exactly this code.
 */
import { stripArticle } from "./log-parser";
import { placeKey, placeName } from "./zones/place";
import type { KillRecord } from "./types";
import { ratio } from "./numbers";
import { locText } from "./format";

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

/**
 * Where a mob turned out to live: the middle of the kills that placed it, and how far they spread.
 *
 * Named because three lists now show it and one sentence describes it (`roamWhy`) — it was an
 * inline shape written out twice and a tooltip written out three times, which is one fact about a
 * mob with three chances to word it differently.
 */
export interface MobArea {
  y: number;
  x: number;
  /** The furthest kill from that centre, in EQ units — how rough "roughly here" is. */
  spread: number;
  /** Positioned kills behind it. A centre from two is a guess; from forty it's a camp. */
  samples: number;
}

/**
 * What a roam area actually claims, in words — the hover every list that shows one carries.
 *
 * Deliberately hedged and deliberately specific: it is an *average* of your kills, not a spawn
 * point, so it says "within about" and states the sample it rests on. The action ("click to…")
 * belongs to the caller, since the same figure pins on one screen and opens a map from another.
 */
export function roamWhy(area: MobArea): string {
  return `Killed within about ${area.spread} units of ${locText(area)}, averaged over ${
    area.samples === 1 ? "1 positioned kill" : `${area.samples} positioned kills`
  }`;
}

/** A mob's tally in one zone — the shareable unit. Counts, never raw kills. */
export interface MobObservation {
  mob: string;
  zone: string;
  /** Kills seen. The denominator for every rate below. */
  kills: number;
  /** How many of those kills dropped each item. */
  drops: Record<string, number>;
  /**
   * Coin taken off those corpses, in copper. The mob's *own* money — what its drops sell for
   * is the item's figure and lives elsewhere (ADR 0047). Merges by addition like `drops`, so a
   * pooled coin-per-kill is one bigger sample rather than an average of averages.
   */
  copper?: number;
  /** The middle of where it was killed, and how far that spreads (EQ units). */
  area?: MobArea;
  /** Most recent kill, so stale knowledge can be told from fresh. */
  lastAt: string;
  /** Who observed it. Absent means "you". */
  by?: string;
}

/**
 * The key to look a drop up by. Loot lines name an item in full and always the same way, so unlike
 * `mobKey` there is nothing to strip — only case and stray space to fold.
 */
export function dropKey(item: string): string {
  return item.toLowerCase().trim();
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
  area?: MobArea;
  lastAt: string;
  /** Names of everyone whose observations are in here (you are not listed). */
  contributors: string[];
  /** Coin off its corpses, in copper: the pooled total and what that averages per kill. */
  copper: number;
  copperPerKill: number;
}

/**
 * Every item we've seen drop, and which mobs give it up.
 *
 * The loot table read backwards. A `MobKnowledge` answers "what does this drop"; "where does this
 * come from" is the question a hunter actually asks, and nothing else can answer it — the wiki's
 * `ItemSource` names a mob and a zone but never a position, and only our own kills know where a
 * thing was standing when it died. Built once as an index rather than scanned per lookup, because
 * the asker is a list of drop rows and every row wants its own answer.
 *
 * A mob appears once per item however many zones it was tallied in: the answer is a set of mobs to
 * point at, and the same puma behind two doors is one thing to go looking for.
 */
export function dropSources(known: MobKnowledge[]): Map<string, string[]> {
  const byItem = new Map<string, string[]>();
  for (const mob of known) {
    for (const drop of mob.drops) {
      const key = dropKey(drop.item);
      const mobs = byItem.get(key);
      if (!mobs) byItem.set(key, [mob.mob]);
      else if (!mobs.includes(mob.mob)) mobs.push(mob.mob);
    }
  }
  return byItem;
}

/**
 * Key a mob to its zone **as the log wrote it** — the key an observation is *stored* under.
 *
 * Verbatim on purpose. An observation is written to disk (a retired tally) and sent to peers, so
 * anything folded in here is an assumption baked into data we can no longer re-derive: a table fixed
 * tomorrow could not fix yesterday's rows, and the difficulty the log stated would be gone
 * ([ADR 0083](../../specs/decisions/0083-a-zone-name-is-stored-raw-and-grouped-on-read.md), which
 * moves ADR 0059's fold from this key to the read). Two spellings of one camp are therefore two rows
 * here, and one row in everything derived from them — space is cheap, and a lost fact isn't.
 */
const keyOf = (mob: string, zone: string): string => `${mob.toLowerCase()}|${zone.trim()}`;

/** The key a *derived* tally groups under: one per place, from the mapping table (`placeKey`). */
const groupOf = (mob: string, zone: string): string => `${mob.toLowerCase()}|${placeKey(zone)}`;

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
    // Loot — an item or coin — is proof you had the corpse, whoever landed the killing blow.
    if (kill.mine === false && !kill.drops?.length && !kill.coin) continue;
    const key = keyOf(kill.mob, kill.zone);
    let obs = byKey.get(key);
    if (!obs) {
      // The log's own wording, kept: this is a summary of records that may be about to age out, so it
      // has to be the thing a later, better mapping table can still be pointed at (ADR 0083).
      obs = { mob: kill.mob, zone: kill.zone.trim(), kills: 0, drops: {}, copper: 0, lastAt: kill.at, points: [] };
      byKey.set(key, obs);
    }
    obs.kills += 1;
    obs.copper = (obs.copper ?? 0) + (kill.coin ?? 0);
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
 * Add observations of the same mob-in-a-zone together, into one observation.
 *
 * It's the arithmetic `mergeObservations` uses to pool across *people*, applied within a single
 * observer — which is what lets a kill record be dropped without dropping what it taught: the
 * kill log folds a record into an observation as it ages out, and adds that back here
 * ([ADR 0056](../../specs/decisions/0056-a-dropped-record-keeps-what-it-taught.md)). Deliberately
 * not `mergeObservations`: that answers "yours versus theirs", and both sides of this are yours.
 */
export function sumObservations(...groups: MobObservation[][]): MobObservation[] {
  const byKey = new Map<string, MobObservation & { areas: NonNullable<MobObservation["area"]>[] }>();
  for (const group of groups) {
    for (const obs of group) {
      // Verbatim, like `observeMobs`: the result of this is what gets *written*, so a tally retired
      // under `Blackburrow 3` stays under `Blackburrow 3` and is grouped when it's read (ADR 0083).
      const key = keyOf(obs.mob, obs.zone);
      let sum = byKey.get(key);
      if (!sum) {
        sum = { mob: obs.mob, zone: obs.zone.trim(), kills: 0, drops: {}, copper: 0, lastAt: obs.lastAt, by: obs.by, areas: [] };
        byKey.set(key, sum);
      }
      sum.kills += obs.kills;
      sum.copper = (sum.copper ?? 0) + (obs.copper ?? 0);
      if (obs.lastAt > sum.lastAt) sum.lastAt = obs.lastAt;
      if (obs.area) sum.areas.push(obs.area);
      for (const [item, count] of Object.entries(obs.drops)) sum.drops[item] = (sum.drops[item] ?? 0) + count;
    }
  }
  return [...byKey.values()].map(({ areas, ...obs }) => ({ ...obs, area: mergeAreas(areas) }));
}

/**
 * Pool observations into per-mob knowledge. `mine` is kept apart in the result so a rate can
 * always be traced back to how much of it you saw yourself — pooled data is more useful *and*
 * less verifiable, and the reader should be able to tell.
 *
 * **This is the aggregation**, and the only place a zone's variants become one camp: grouped by
 * `placeKey` and labelled with the mapping table's name for the place (ADR 0083). Nothing here is
 * stored, so it re-derives from the raw rows every time it's asked — which is what makes a correction
 * to the table correct every rate ever derived, and makes the answer independent of the order the
 * rows arrive in.
 */
export function mergeObservations(mine: MobObservation[], theirs: MobObservation[]): MobKnowledge[] {
  const byKey = new Map<string, MobKnowledge & { areas: NonNullable<MobObservation["area"]>[] }>();

  const fold = (obs: MobObservation, isMine: boolean) => {
    const key = groupOf(obs.mob, obs.zone);
    let known = byKey.get(key);
    if (!known) {
      known = {
        mob: obs.mob,
        // The place, named by the table rather than by whichever row arrived first — so a peer whose
        // pack spells it differently, and an evening spent at difficulty 3, read as one camp.
        zone: placeName(obs.zone),
        kills: 0,
        myKills: 0,
        drops: [],
        lastAt: obs.lastAt,
        contributors: [],
        copper: 0,
        copperPerKill: 0,
        areas: [],
      };
      byKey.set(key, known);
    }
    known.kills += obs.kills;
    known.copper += obs.copper ?? 0;
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
        .map((d) => ({ ...d, rate: ratio(d.count, known.kills, 3) }))
        .sort((a, b) => b.rate - a.rate || a.item.localeCompare(b.item)),
      copperPerKill: ratio(known.copper, known.kills, 1),
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
