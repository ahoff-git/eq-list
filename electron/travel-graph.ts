/**
 * Reading a folder of map files into a travel graph, and keeping it on disk.
 *
 * Only I/O and orchestration: the harvesting, the joining and the routing are pure
 * (`src/shared/travel/`), and the map format, the sources and the zone naming are the map
 * subsystem's existing ones, reused as-is.
 *
 * A graph belongs to **one map source**, like the zone names do
 * ([ADR 0061](../specs/decisions/0061-a-map-pack-names-its-own-zones.md)): two packs label
 * different exits, so they describe different graphs of the same world, and pooling them would let
 * one pack's coverage stand in for another's.
 */

import { createHash } from "node:crypto";
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { pickSource, zonesFromFiles } from "../src/shared/map/map-sources";
import type { MapSource } from "../src/shared/map/map-sources";
import { buildTravelGraph, type TravelBuildReport } from "../src/shared/travel/build";
import { harvestZone, type ZoneHarvest } from "../src/shared/travel/harvest";
import { applyManual } from "../src/shared/travel/manual";
import { MANUAL_TRAVEL, NOT_IN_GAME, STALE_DRAWINGS } from "../src/shared/travel/manual-links";
import { statedAdjacencies } from "../src/shared/zones/adjacency";
import { outOfEraSet, zoneAvailable } from "../src/shared/zones/expansions";
import { answerRoute, travelZone, type TravelAnswer, type TravelEnd } from "../src/shared/travel/route";
import { canTeleport, travelPack, travelReach, type TravelReach } from "../src/shared/travel/reach";
import { surveyZone, type TravelSurvey } from "../src/shared/travel/survey";
import type { BundledTravel, TravelGraph, TravelOptions } from "../src/shared/travel/types";
import { withoutZones } from "../src/shared/travel/prune";
import { createZoneNamer, folderSignature, readFolderPois } from "./eq-maps";
import { currentAppVersion, readJson, writeJson } from "./json-store";
import { createAsyncCache } from "./async-cache";

/** The app's gazetteer, passed in so a graph is built from the naming everything else already has. */
type ZoneNamer = ReturnType<typeof createZoneNamer>;

const log = createLogger("travel-graph");

/** Every zone in a source, harvested for travel points. */
export async function harvestSource(source: Pick<MapSource, "dir" | "files">): Promise<ZoneHarvest[]> {
  const pois = await readFolderPois(source);
  return source.files.map((short) => harvestZone(short, pois.get(short) ?? []));
}

/**
 * `file → long name` for a source: the catalogue, then that pack's own solved names.
 *
 * Takes the app's `namer` rather than making one, so naming a folder costs one scan for the whole app
 * — and none at all once the gazetteer is cached. A fresh namer here meant the build read the folder
 * twice over (once to name it, once to harvest it) and threw the naming away afterwards, while the
 * copy the map window had already paid for sat unused.
 */
export async function zoneNamesFor(source: MapSource, namer: ZoneNamer): Promise<Record<string, string>> {
  const solved = await namer.names(source);
  const names: Record<string, string> = {};
  for (const zone of zonesFromFiles(source.id, source.files, solved)) {
    if (zone.file) names[zone.file] = zone.name;
  }
  return names;
}

/**
 * Which of a pack's zones to leave out of the graph, by the **one test the whole app shares**
 * (`zoneAvailable`).
 *
 * Two things make a zone unreachable and they're answered by different sources, which is why they're
 * combined here rather than listed anywhere: the **expansion table** rules out everything past this
 * server for good (Argath, and ~350 others a pack draws), and the **wiki's live era flags** close the
 * expansions the server does have but hasn't opened yet (Kunark, Velious — and they re-open with
 * nothing edited). Asked of the pack's own names, so the answer is about the zones actually in front of
 * us rather than a list of everything EverQuest ever shipped.
 */
export function absentZonesFor(zoneNames: Record<string, string>, outOfEra: readonly string[]): string[] {
  const closed = outOfEraSet(outOfEra);
  return Object.values(zoneNames).filter((name) => !zoneAvailable(name, closed));
}

/**
 * Read a source's maps and build its graph. The manual pass is applied separately, on purpose — but the
 * **exclusions are not**: a zone the server hasn't got is left out at creation, so re-running this
 * can't reintroduce one and there's no second pass to remember.
 */
export async function buildFromSource(
  source: MapSource,
  outOfEra: readonly string[] = [],
  namer: ZoneNamer = createZoneNamer(),
): Promise<{ graph: TravelGraph; report: TravelBuildReport }> {
  const zoneNames = await zoneNamesFor(source, namer);
  const harvests = await harvestSource(source);
  /**
   * Everywhere you can't go, from **both** sources and composed here rather than inside either.
   *
   * `zoneAvailable` answers it for a zone with a name — the expansion table plus the wiki's era flags —
   * and fails open on a name it has never heard of, which is right for a Legends custom zone and wrong
   * for `mmca`: an instance of Mistmoore's Catacombs that nothing in any catalogue answers to. So the
   * hand-authored list stands beside the computed one instead of hiding inside it, and both curated
   * inputs reach the builder the same way — as arguments.
   */
  const absent = [...absentZonesFor(zoneNames, outOfEra), ...NOT_IN_GAME];
  // The wiki's Adjacent Zones, shipped rather than fetched — reachability the mapmakers didn't write
  // down, added only where a label established nothing (see `zones/adjacency.ts` for the precedence).
  const built = buildTravelGraph(
    { id: source.id, dir: source.dir },
    harvests,
    zoneNames,
    absent,
    statedAdjacencies(),
    STALE_DRAWINGS,
  );
  log.debug("built travel graph", {
    source: source.id,
    zones: built.report.zones,
    nodes: built.report.nodes,
    edges: built.report.edges,
    claimed: built.report.claimed.added.length,
  });
  return built;
}

/**
 * Where a source's graph lives, in a directory of the caller's choosing. Two files per source, and
 * the split is the point: the first is what the **maps** said and is safe to regenerate at any time,
 * the second is that plus what a **person** worked out (`manual-links.ts`) and is what you route
 * over. Generating never touches the second, so a rebuild can't quietly drop hand-authored travel —
 * it goes stale instead, and re-running the manual pass fixes it.
 */
export function graphPath(dir: string, sourceId: string): string {
  return path.join(dir, `travel-graph.${sourceId}.json`);
}

export function routedPath(dir: string, sourceId: string): string {
  return path.join(dir, `travel-graph.${sourceId}.routed.json`);
}

export function writeGraph(file: string, graph: TravelGraph): void {
  writeJson(file, graph, { pretty: true, what: "travel graph" });
  log.debug("wrote travel graph", { file, nodes: graph.nodes.length, edges: graph.edges.length });
}

/** Read a stored graph, or `undefined` when there isn't one (or it's unreadable). */
export function readGraph(file: string): TravelGraph | undefined {
  const graph = readJson<TravelGraph | undefined>(file, undefined);
  // A graph from an older shape is no use and shouldn't crash a caller three layers up.
  if (!Array.isArray(graph?.nodes) || !Array.isArray(graph?.edges)) return undefined;
  return graph;
}

/** Where a run's built graph is remembered, and the shape it's kept in. */
const GRAPH_CACHE_FILE = "travel-graphs.json";

/**
 * Bumped when the *shape* of what's stored changes, so a file written under the old one is dropped
 * rather than read as the new. The build **rules** need no bump here: they're keyed on the app's
 * version (see `cacheKey`), which moves with every release that could have changed them.
 */
const GRAPH_CACHE_VERSION = 1;

interface StoredGraphs {
  version: number;
  /** By map folder: what its graph was built from, and the graph. */
  folders: Record<string, { key: string; graph: TravelGraph }>;
}

/**
 * The hand-authored inputs, fingerprinted — `manual-links.ts` and the shipped adjacency table.
 *
 * These are *data*, so they can answer for themselves: stringifying them is both cheap and exact, which
 * is the same argument `peer-share.ts` makes for the digest it sends. Editing a boat run or a wiki
 * adjacency therefore drops a stored graph with nothing remembered by hand — which matters most in
 * development, where those files change and the app's version does not.
 */
let curatedFingerprint: string | undefined;

export function curatedKey(): string {
  curatedFingerprint ??= createHash("sha1")
    .update(JSON.stringify([MANUAL_TRAVEL, NOT_IN_GAME, STALE_DRAWINGS, statedAdjacencies()]))
    .digest("hex")
    .slice(0, 12);
  return curatedFingerprint;
}

/**
 * **Everything a stored graph was built from, in one string.** Anything that can change the graph has
 * to be in here, or the app routes over a stale one:
 *
 *  - the **map folder** — its files are the whole survey (`folderSignature`, the same fingerprint the
 *    gazetteer keys on, so one pack can't be fresh for one of them and stale for the other);
 *  - the **era** — the wiki's out-of-era list closes and re-opens whole expansions;
 *  - the **curated inputs** — `manual-links.ts` and the adjacency table (`curatedKey`);
 *  - the **build itself** — code, which only the running version can speak for.
 */
async function cacheKey(source: MapSource, outOfEra: readonly string[]): Promise<string> {
  const era = [...outOfEra].sort().join(",");
  return [
    GRAPH_CACHE_VERSION,
    currentAppVersion() || "dev",
    await folderSignature(source.dir),
    curatedKey(),
    era ? createHash("sha1").update(era).digest("hex").slice(0, 12) : "none",
  ].join("|");
}

/**
 * The graph the app routes over: the one it ships with by default (`bundled`, ADR 0341), or — when
 * Settings says to build from your own map files — built on demand and cached per map folder.
 *
 * **Building from your folders**, the scripts write `data/travel-graph.*.json` for you to read and argue
 * with, and the app doesn't load them. What the app keeps is its own build of your own folder, and it keeps it under a
 * key that says so (`cacheKey`) — which is a cache, not an artifact. Building costs one pass over the
 * folder's labels, through the shared `readFolderPois`, which reads a few files at a time off the main
 * thread rather than blocking on the whole folder.
 *
 * The hand-authored pass is applied here, every time, so the travel in `manual-links.ts` is part of
 * what the app routes over and not something only the scripts see. So is `outOfEraZones`, which is why
 * this is async: which zones the server has *open* is a fact about the server, and the wiki is the only
 * thing that knows it.
 *
 * **And it is remembered between runs**, in `cacheDir`, against everything it was built from
 * (`cacheKey`). Building is a folder scan plus a pass over every label it found — most of a second on a
 * 568-file pack, on the main thread, so every window stops while it happens, and it happened on the
 * first route or survey of every launch. Reading it back is a couple of milliseconds. Nothing is
 * *routed* differently: the same build runs the moment the key says the stored answer no longer applies.
 */
export function createTravelRouter(deps: {
  /** Zones the server has out of era, from the wiki (`WikiClient.outOfEraZones`). */
  outOfEraZones?: () => Promise<string[]>;
  /** The app's gazetteer, so the graph is named from the scan the map window already paid for. */
  namer?: ZoneNamer;
  /**
   * Where to keep the built graph between runs — `userData`, beside the gazetteer it's named from.
   * Left off (the tests, the scripts) and every run builds its own, which is what a caller checking
   * the *build* wants.
   */
  cacheDir?: string;
  /**
   * The graph shipped with the app (`travel-graph.generated.ts`), loaded on first need — what routes are
   * asked over unless you choose to build from your own maps, and the fallback when you do and none of
   * them labels a ring or spire (ADR 0341). Left off (the tests, the scripts) and every route is built
   * from the folder, which is what a caller checking the *build* wants.
   */
  bundled?: () => Promise<BundledTravel>;
}): {
  graph: (source: MapSource) => Promise<TravelGraph>;
  answer: (
    source: MapSource,
    from: TravelEnd | string,
    to: TravelEnd | string,
    options?: TravelOptions,
  ) => Promise<TravelAnswer>;
  survey: (source: MapSource, zone: string, options?: TravelOptions) => Promise<TravelSurvey | undefined>;
  clear: () => void;
  travelSource: (sources: MapSource[], chosen: string | undefined, how?: TravelFrom) => Promise<MapSource | undefined>;
  inspect: (sources: MapSource[], chosen: string | undefined, how?: TravelFrom) => Promise<TravelCheck | undefined>;
  rebuild: (source: MapSource) => Promise<TravelGraph>;
} {
  /** One graph per folder, keyed by it — like the gazetteer, and for the same reason: two routes
   *  asked for at once share one build rather than each reading the folder. */
  const cache = createAsyncCache<TravelGraph>();
  const file = deps.cacheDir ? path.join(deps.cacheDir, GRAPH_CACHE_FILE) : undefined;

  const stored = (): StoredGraphs => {
    const read = file ? readJson<StoredGraphs>(file, { version: 0, folders: {} }) : { version: 0, folders: {} };
    return read.version === GRAPH_CACHE_VERSION && read.folders ? read : { version: GRAPH_CACHE_VERSION, folders: {} };
  };

  /** Keep this folder's graph, leaving every other folder's in place — the gazetteer's own rule. */
  const remember = (dir: string, key: string, graph: TravelGraph): void => {
    if (!file) return;
    const all = stored();
    all.folders[dir] = { key, graph };
    writeJson(file, all, { what: "travel graph" });
  };

  const eraList = async (): Promise<string[]> => {
    // A failed era lookup must not quietly produce a graph that routes through Kunark, so it's said
    // out loud. The list is disk-cached, so this only bites on a first run with no network.
    let outOfEra: string[] = [];
    try {
      outOfEra = (await deps.outOfEraZones?.()) ?? [];
    } catch (e) {
      log.warn("out-of-era zones unavailable, so only the hand-listed exclusions apply:", (e as Error).message);
    }
    if (!outOfEra.length) log.warn("no out-of-era zone list — a route may go through a zone the server hasn't opened");
    return outOfEra;
  };

  /** The maps' graph plus the hand-authored pass — what a route is asked over. */
  const buildRouted = async (source: MapSource, outOfEra: readonly string[], namer?: ZoneNamer) => {
    const { graph: read, report } = await buildFromSource(source, outOfEra, namer);
    const { graph: routed, report: manual } = applyManual(read, MANUAL_TRAVEL);
    return { routed, report, manual };
  };

  const build = async (source: MapSource): Promise<TravelGraph> => {
    const outOfEra = await eraList();

    // Asked before the folder is read, because the whole point is not to read it. A graph kept under an
    // older shape is refused the same way a read one is (`readGraph`) — it's no use and mustn't crash a
    // caller three layers up.
    const key = await cacheKey(source, outOfEra);
    const kept = stored().folders[source.dir];
    if (kept?.key === key && Array.isArray(kept.graph?.nodes) && Array.isArray(kept.graph?.edges)) {
      log.debug("travel graph from cache", {
        source: source.id,
        nodes: kept.graph.nodes.length,
        edges: kept.graph.edges.length,
      });
      return kept.graph;
    }

    const { routed, report, manual } = await buildRouted(source, outOfEra, deps.namer);
    log.debug("travel graph ready", {
      source: source.id,
      zones: report.zones,
      borders: report.boundaries,
      excluded: report.absent.length,
      hand: manual.applied.length,
      edges: routed.edges.length,
    });
    remember(source.dir, key, routed);
    return routed;
  };

  /**
   * The shipped graph as a source a route can be asked over. Never a folder: `graph` answers it from the
   * bundle, and since only this router hands it out, it's told apart by identity.
   */
  let bundledSource: MapSource | undefined;
  let bundledGraph: Promise<TravelGraph> | undefined;
  const loadBundled = async (): Promise<MapSource | undefined> => {
    if (!deps.bundled) return undefined;
    if (bundledSource) return bundledSource;
    const { label, graph: all } = await deps.bundled();
    // Built with every era open, so the server's live one is applied here — the same exclusion the build
    // makes from a folder (`absentZonesFor`), by name and then back to the bundle's own files.
    bundledGraph = eraList().then((era) => {
      const closed = new Set(absentZonesFor(all.zoneNames, era));
      return withoutZones(all, Object.keys(all.zoneNames).filter((file) => closed.has(all.zoneNames[file])));
    });
    // Under the id of the pack it was built from, so its markers land on that pack's drawings — the frame
    // its positions were read in (ADR 0111) — and nowhere else.
    bundledSource = { id: all.source.id, label: `${label} (shipped with the app)`, dir: "", files: [] };
    return bundledSource;
  };
  const isBundled = (source: MapSource): boolean => !!bundledSource && source === bundledSource;

  const graph = (source: MapSource): Promise<TravelGraph> =>
    isBundled(source) && bundledGraph ? bundledGraph : cache.get(source.dir, () => build(source));

  /**
   * The pack a route is asked over (`travelPack`): the one being drawn, unless it can't teleport and
   * another installed pack can. The other packs are only built when the drawn one comes up empty, and
   * like any graph they're kept, so that costs one build per pack, once.
   */
  const travelSource = async (
    sources: MapSource[],
    chosen: string | undefined,
    how: TravelFrom = {},
  ): Promise<MapSource | undefined> => {
    // **The shipped graph by default** — the same build anyone's machine would make of the same pack,
    // made once (ADR 0341). It needs no folder of yours at all; they're read only when you've asked for
    // that in Settings.
    if (!how.fromMaps) {
      const shipped = await loadBundled();
      if (shipped) return shipped;
    }
    const drawn = pickSource(sources, chosen);
    if (!drawn) return undefined;
    const reach = travelReach(await graph(drawn));
    if (canTeleport(reach)) return drawn;
    const others = await Promise.all(
      sources.filter((s) => s.id !== drawn.id).map(async (s) => ({ source: s, reach: travelReach(await graph(s)) })),
    );
    const picked = travelPack({ source: drawn, reach }, others);
    if (picked !== drawn) log.debug("routing over another pack's labels", { drawn: drawn.id, travel: picked.id });
    // An installed pack that can teleport always wins: it's the user's own survey. Only when none can
    // does the shipped graph stand in, and only if it can do better.
    if (picked !== drawn) return picked;
    const shipped = await loadBundled();
    if (shipped && canTeleport(travelReach(await graph(shipped)))) {
      log.debug("no installed pack can teleport — routing over the shipped graph", { drawn: drawn.id });
      return shipped;
    }
    return drawn;
  };

  return {
    graph,
    answer: async (source, from, to, options) => answerRoute(await graph(source), from, to, options),
    // Through `travelZone` like a route's endpoints, so the map you're looking at and the zone the
    // survey describes can't be two different answers to one name — including a zone the pack drew
    // twice, where the file on screen may not be the file the graph kept (ADR 0111).
    survey: async (source, zone, options) => {
      const built = await graph(source);
      const file = travelZone(built, zone);
      return file ? surveyZone(built, file, options) : undefined;
    },
    clear: () => cache.clear(),
    travelSource,

    /**
     * What the pack in use can reach, and whether a rebuild would change it.
     *
     * The comparison is against a build made **from nothing stored** — a throwaway namer, no kept
     * graph — so it covers every input `cacheKey` can't see, the gazetteer's names among them. Equal
     * means a rebuild would hand back exactly what's routed over now, so none is offered.
     */
    async inspect(sources, chosen, how = {}) {
      const source = await travelSource(sources, chosen, how);
      if (!source) return undefined;
      const drawn = pickSource(sources, chosen);
      const routed = await graph(source);
      // The bundle has no folder to build afresh from, and nothing kept to go stale: it is what shipped.
      const fresh = isBundled(source) ? routed : (await buildRouted(source, await eraList(), createZoneNamer())).routed;
      return {
        pack: { id: source.id, label: source.label },
        ...(drawn && drawn.id !== source.id ? { drawn: { id: drawn.id, label: drawn.label } } : {}),
        ...(isBundled(source) ? { shipped: how.fromMaps ? "fallback" : "default" } : {}),
        reach: travelReach(routed),
        fresh: travelReach(fresh),
        current: routed === fresh || JSON.stringify(routed) === JSON.stringify(fresh),
      };
    },

    /** Forget everything kept for this folder — its names and its graph — and build it again. */
    async rebuild(source) {
      if (isBundled(source)) return graph(source);
      deps.namer?.forget(source.dir);
      cache.clear();
      if (file) {
        const all = stored();
        delete all.folders[source.dir];
        writeJson(file, all, { what: "travel graph" });
      }
      log.debug("rebuilding travel graph", { source: source.id });
      return graph(source);
    },
  };
}

/** What the setup check is told about travel (`inspect`). */
export interface TravelCheck {
  /** The pack routes are asked over (`travelSource`). */
  pack: { id: string; label: string };
  /** The pack the map window draws, when routes borrow another's labels because it has no ports. */
  drawn?: { id: string; label: string };
  /** What the graph routed over now can reach. */
  reach: TravelReach;
  /** What a build from nothing stored reaches. */
  fresh: TravelReach;
  /** The routed graph is exactly a fresh build — a rebuild would change nothing. */
  current: boolean;
  /**
   * Routes use the graph shipped with the app: `default` because that's the setting, `fallback` because
   * you asked for your own maps and none of them can teleport.
   */
  shipped?: "default" | "fallback";
}

/** Where routes come from — the Settings choice (`TravelSettings.fromMaps`). */
export interface TravelFrom {
  /** Build from the map folders on this machine rather than use the shipped graph. */
  fromMaps?: boolean;
}
