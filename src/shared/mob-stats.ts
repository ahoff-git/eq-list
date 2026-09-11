/**
 * mob-stats.ts — what we've learned about a mob by killing it repeatedly.
 *
 * The kill log records each kill with what it dropped and roughly where it happened
 * ([ADR 0022](../../specs/decisions/0022-invocation-effects-and-kill-locations.md)). Rolled
 * up per mob that becomes the three things a player actually wants to know and the wiki only
 * partly answers:
 *
 *   - **how often it drops what** — an observed rate, from your own kills;
 *   - **where it is** — every distinct spot you've killed it, not blended into one average;
 *   - **how much to believe each** — every figure carries its sample count, because "1 for 1"
 *     and "40 for 120" are not the same claim, and a location seen once is not the same claim as
 *     one seen a dozen times either.
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
 * **A mob can spawn in more than one spot, so "where it is" is a list, not a point**
 * ([ADR 0228](../../specs/decisions/0228-a-mob-can-have-more-than-one-known-location.md)). Every kill
 * position trusted enough to use (`AREA_MIN_CONFIDENCE`) is folded into one of possibly several
 * `MobArea` clusters via `clusterAreas` — two positions close enough to plausibly be the same camp
 * combine into one, weighted-average centroid the way a single roam area always worked; two far
 * enough apart stay their own rows instead of being blended into a centroid that sits between two
 * real camps and belongs to neither. `areaConfidence` grades each cluster the same way
 * [faction-cause.ts](./faction-cause.ts)'s `causeConfidence` grades a repeated faction cause — the
 * same `estimates.ts` sample-size ladder, just aimed at "how many kills corroborate *this* spot"
 * instead of "how many hits corroborate *this* NPC." `area` (singular) is kept, still populated, as
 * the single most-corroborated cluster (`areas[0]`) — every reader written before this existed keeps
 * working unchanged, and gets a real camp's centroid instead of a blend of two for free.
 *
 * Pure and DOM-free: main derives observations from the kill log, the renderer merges them for
 * display, and both use exactly this code.
 */
import { confidenceOf, type Confidence, type SampleScale } from "./estimates";
import { stripArticle } from "./log-parser";
import { placeKey, placeName } from "./zones/place";
import type { KillRecord } from "./types";
import { ratio } from "./numbers";
import { locText } from "./format";
import { legacyContributorId } from "./contributors";

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

/**
 * How far apart two clusters' centres may sit and still plausibly be the same camp, rather than two
 * separate ones — see the module header. **The one number in this file with the least real evidence
 * behind it**: EQ zones range from a small dungeon room to a sprawling outdoor tract, and this is a
 * single global guess standing in for what genuinely varies zone to zone. Too small and one mob's
 * ordinary wandering fragments into noise; too large and two real, separately-camped spawns never
 * split. Unverified, the same way `CORRELATION_WINDOW_SEC` was before a real log corrected it (ADR
 * 0224) — revisit the moment a real zone's camp spacing says otherwise.
 */
export const LOCATION_CLUSTER_UNITS = 600;

/** Straight-line distance between two clusters' centres, EQ units. */
function centroidDistance(a: Pick<MobArea, "y" | "x">, b: Pick<MobArea, "y" | "x">): number {
  return Math.hypot(a.y - b.y, a.x - b.x);
}

/**
 * Fold two clusters worth of evidence into one — the same weighted-centroid, widened-spread math a
 * single roam area always used, just applied to a candidate **pair** rather than an entire list, so
 * clustering is a series of small, explainable merges rather than one big blend. Weighted toward
 * whichever side has more samples; `spread` widens to cover both original centres, never shrinks
 * toward their average, for the same reason merging observers' areas never used to either (ADR 0024).
 */
function combineAreas(a: MobArea, b: MobArea): MobArea {
  const samples = a.samples + b.samples;
  const y = (a.y * a.samples + b.y * b.samples) / samples;
  const x = (a.x * a.samples + b.x * b.samples) / samples;
  const spread = Math.max(a.spread + centroidDistance(a, { y, x }), b.spread + centroidDistance(b, { y, x }));
  return { y: Math.round(y), x: Math.round(x), spread: Math.round(spread), samples };
}

/**
 * Group positions into distinct locations rather than blending everything into one average.
 *
 * Greedy agglomeration: repeatedly combine whichever two clusters sit closest together, stopping the
 * moment nothing left is within `thresholdUnits` of anything else. Two real camps a zone apart stay
 * two rows; kills scattered around one camp still fold into one, exactly as a single roam area always
 * did — this only adds the case a flat average couldn't tell apart from a mistake. Zero-sample
 * clusters (nothing left after `AREA_MIN_CONFIDENCE` filtering) are dropped rather than kept as an
 * empty row. Sorted biggest-first, the same "most-corroborated leads" convention
 * `FactionCauseTally`/`causes` already use.
 */
export function clusterAreas(areas: readonly MobArea[], thresholdUnits: number = LOCATION_CLUSTER_UNITS): MobArea[] {
  let clusters = areas.filter((a) => a.samples > 0).map((a) => ({ ...a }));
  while (clusters.length > 1) {
    let bestI = -1;
    let bestJ = -1;
    let bestDist = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = centroidDistance(clusters[i], clusters[j]);
        if (d < bestDist) {
          bestDist = d;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestDist > thresholdUnits) break;
    const merged = combineAreas(clusters[bestI], clusters[bestJ]);
    clusters = clusters.filter((_, idx) => idx !== bestI && idx !== bestJ);
    clusters.push(merged);
  }
  return clusters.sort((a, b) => b.samples - a.samples);
}

/**
 * Where a location's own sample count stops reading as a single, possibly-fluky kill and starts
 * reading as a real, repeatedly-confirmed camp — [estimates.ts](./estimates.ts)'s generic ladder, the
 * same one [faction-cause.ts](./faction-cause.ts)'s `causeConfidence` applies to a repeated faction
 * cause. Unverified, like `LOCATION_CLUSTER_UNITS` above — a starting guess about *how much* evidence
 * a spot needs before it reads as more than a one-off.
 */
export const AREA_SAMPLES: SampleScale = { fair: 3, solid: 10 };

/** How much to trust one entry of `MobObservation.areas`/`MobKnowledge.areas`. */
export function areaConfidence(area: Pick<MobArea, "samples">): Confidence {
  return confidenceOf(area.samples, AREA_SAMPLES);
}

/** The tooltip behind `areaConfidence` — names the actual sample count so "solid" reads as "seen
 *  here repeatedly", never as certainty a single average could never have earned either. */
export function areaConfidenceWhy(area: MobArea): string {
  const seen = area.samples === 1 ? "just 1 positioned kill" : `${area.samples} positioned kills`;
  switch (areaConfidence(area)) {
    case "solid":
      return `Confirmed by ${seen} — this is a real, repeatedly-visited spot, not a one-off.`;
    case "fair":
      return `Backed by ${seen} — more than a single coincidence, though still a small sample.`;
    default:
      return `Backed by only ${seen} so far — could be a stray kill rather than a real camp. More kills would say more.`;
  }
}

/**
 * Bring an older single-`area` shape up to today's `areas` list — every persisted row written before
 * this feature existed, and every peer running a build from before it, looks like this. An object
 * that already carries `areas` is trusted as-is; `area` beside it is recomputed from `areas[0]` rather
 * than kept, so a stale duplicate from an older write can never outrank a fresher clustering.
 */
export function withAreas<T extends { area?: MobArea; areas?: MobArea[] }>(obs: T): T & { areas: MobArea[]; area?: MobArea } {
  const areas = obs.areas ?? (obs.area ? [obs.area] : []);
  return { ...obs, areas, area: areas[0] };
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
  /**
   * The single most-corroborated spot it's been killed, and how far that spreads (EQ units) —
   * `areas[0]`, kept (rather than only `areas`) so every reader written before ADR 0228 keeps working
   * unchanged. Absent exactly when `areas` is empty.
   */
  area?: MobArea;
  /**
   * Every distinct spot it's been killed, most-corroborated first (`clusterAreas`) — a mob with one
   * real camp still has exactly one entry here, same as `area` always implied. Always populated
   * (even to `[]`) by this module's own `observeMobs`/`sumObservations`/`mergeObservations`; **may be
   * absent** on a persisted row or a peer's payload written before ADR 0228 existed — `withAreas`
   * normalizes those on the way in, so nothing outside this module should read `areas` without going
   * through it first (or trusting one of this module's own constructors).
   */
  areas?: MobArea[];
  /** Most recent kill, so stale knowledge can be told from fresh. */
  lastAt: string;
  /** Who observed it, as a name to show. Absent means "you". */
  by?: string;
  /**
   * Who observed it, as the id everything is keyed by (`contributors.ts`). Absent means "you", or a
   * tally inherited from before contributors had ids. Kept **beside** the name rather than instead
   * of it, because the merge dedupes on this — two players who both call themselves "Bob" are two
   * samples, not one — while the reader is still shown a name.
   */
  byId?: string;
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
  /**
   * How many of `count` you saw yourself — the numerator to go with `MobKnowledge.myKills`.
   *
   * Carried so a pooled rate can be checked against your own without re-deriving either: `pooling.ts`
   * uses the pair to spot a contributor whose rate is nothing like yours, which is a thing to
   * **report** rather than resolve (`estimates.ts` rule 5). Without it the two rates cannot be
   * compared at all, and the pooled figure has to be taken on trust — the exact thing pooling data
   * from strangers must not require.
   */
  myCount: number;
}

/** Everything known about a mob in a zone, yours and peers' pooled. */
export interface MobKnowledge {
  mob: string;
  zone: string;
  kills: number;
  /** Kills you saw yourself, of the total — provenance for the rate. */
  myKills: number;
  drops: MobDrop[];
  /** The single most-corroborated spot — `areas[0]`. See `MobObservation.area`'s own doc. */
  area?: MobArea;
  /**
   * Every distinct spot, pooled across every contributor, most-corroborated first. Populated (even
   * to `[]`) by `mergeObservations` — a derived, always-fresh read, never stored, so there's no wire
   * shape to migrate the way `MobObservation.areas` sometimes needs. Optional only so a hand-built
   * test fixture that predates this field needn't grow one; real callers get it from `area` if it's
   * ever missing (`area ? [area] : []`), the same fallback `withAreas` gives `MobObservation`.
   */
  areas?: MobArea[];
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
    // Only positions worth believing shape a location — see AREA_MIN_CONFIDENCE.
    if (kill.y !== undefined && kill.x !== undefined && kill.confidence >= AREA_MIN_CONFIDENCE) {
      obs.points.push({ y: kill.y, x: kill.x });
    }
  }

  return [...byKey.values()].map(({ points, ...obs }) => {
    const areas = clusterAreas(points.map((p) => ({ ...p, spread: 0, samples: 1 })));
    return { ...obs, areas, area: areas[0] };
  });
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
  const byKey = new Map<string, MobObservation & { seenAreas: MobArea[] }>();
  for (const group of groups) {
    for (const obs of group) {
      // Verbatim, like `observeMobs`: the result of this is what gets *written*, so a tally retired
      // under `Blackburrow 3` stays under `Blackburrow 3` and is grouped when it's read (ADR 0083).
      const key = keyOf(obs.mob, obs.zone);
      let sum = byKey.get(key);
      if (!sum) {
        sum = { mob: obs.mob, zone: obs.zone.trim(), kills: 0, drops: {}, copper: 0, lastAt: obs.lastAt, by: obs.by, byId: obs.byId, seenAreas: [] };
        byKey.set(key, sum);
      }
      sum.kills += obs.kills;
      sum.copper = (sum.copper ?? 0) + (obs.copper ?? 0);
      if (obs.lastAt > sum.lastAt) sum.lastAt = obs.lastAt;
      // `withAreas` covers a `retired` row folded before this feature existed, which has only `area`.
      sum.seenAreas.push(...withAreas(obs).areas);
      for (const [item, count] of Object.entries(obs.drops)) sum.drops[item] = (sum.drops[item] ?? 0) + count;
    }
  }
  return [...byKey.values()].map(({ seenAreas, ...obs }) => {
    const areas = clusterAreas(seenAreas);
    return { ...obs, areas, area: areas[0] };
  });
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
  const byKey = new Map<string, MobKnowledge & { seenAreas: MobArea[] }>();
  /** Contributor ids already counted, per mob — the merge dedupes on the id, never on the name. */
  const seenBy = new Map<string, Set<string>>();

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
        seenAreas: [],
      };
      byKey.set(key, known);
    }
    known.kills += obs.kills;
    known.copper += obs.copper ?? 0;
    if (isMine) known.myKills += obs.kills;
    else if (obs.by) {
      // Deduped by **id**, so two contributors sharing a display name are two rows of evidence and
      // one person who renamed themselves mid-evening is still one. A tally from before ids (or from
      // a build too old to send one) falls back to the name, which is the best it can be credited by.
      const ids = seenBy.get(key) ?? new Set<string>();
      const id = obs.byId ?? legacyContributorId(obs.by);
      if (!ids.has(id)) {
        ids.add(id);
        known.contributors.push(obs.by);
      }
      seenBy.set(key, ids);
    }
    if (obs.lastAt > known.lastAt) known.lastAt = obs.lastAt;
    // `withAreas` covers a peer still on a build from before ADR 0228, which only ever sends `area`.
    known.seenAreas.push(...withAreas(obs).areas);

    for (const [item, count] of Object.entries(obs.drops)) {
      const drop = known.drops.find((d) => d.item === item);
      if (drop) {
        drop.count += count;
        if (isMine) drop.myCount += count;
      } else known.drops.push({ item, count, rate: 0, myCount: isMine ? count : 0 });
    }
  };

  for (const obs of mine) fold(obs, true);
  for (const obs of theirs) fold(obs, false);

  return [...byKey.values()]
    .map(({ seenAreas, ...known }) => {
      const areas = clusterAreas(seenAreas);
      return {
        ...known,
        // Rates are computed once, at the end, from the pooled totals.
        drops: known.drops
          .map((d) => ({ ...d, rate: ratio(d.count, known.kills, 3) }))
          .sort((a, b) => b.rate - a.rate || a.item.localeCompare(b.item)),
        copperPerKill: ratio(known.copper, known.kills, 1),
        areas,
        area: areas[0],
        contributors: known.contributors.sort(),
      };
    })
    .sort((a, b) => b.kills - a.kills || a.mob.localeCompare(b.mob));
}
