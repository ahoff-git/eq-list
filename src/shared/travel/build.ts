/**
 * Turning what the maps say into a graph you can route over.
 *
 * Three steps:
 *
 *  1. **Every border becomes one node, in both its zones.** Greater Faydark's `to Clan Crushbone` and
 *     Clan Crushbone's `to Greater Faydark` are one place — the boundary — so they collapse into
 *     `crushbone|gfaydark`, holding its position in each zone's own frame. Which of three exits pairs
 *     with which of two arrivals stops being a question nobody can answer: they're all the same
 *     border, and a walk to it takes the nearest one.
 *  2. **Walks within a zone are the edges.** For each zone, every pair of its nodes gets an edge
 *     weighted by the distance between them *in that zone*. Crossing the boundary itself needs no
 *     edge at all: standing at the node is standing in both zones.
 *  3. **A teleport network collapses to a hub** — a free edge to each member. Only rings and spires;
 *     a boat runs between two particular docks (see `AUTO_NETWORKS`).
 *
 * Pure — the file reading is `electron/travel-graph.ts`.
 */

import type { ZoneHarvest } from "./harvest";
import {
  boundaryId,
  networkOfCrossing,
  slug,
  zoneFileFor,
  zoneDistance,
  type TravelCrossing,
  type TravelEdge,
  type TravelGraph,
  type TravelNetwork,
  type TravelNode,
  type TravelToggle,
} from "./types";

/**
 * The networks that really are networks. A druid reaches **any** ring from any other, and a wizard
 * any spire, so finding two of them is finding a network — no pairing needed.
 *
 * A boat and a gnome are not like that: they run between *particular* ends. Hubbing them would make
 * every dock in the world mutually reachable for nothing, which is the kind of wrong that produces a
 * confident, useless route. So their nodes are found and reported, and the runs between them are
 * `manual-links.ts`'s job — a boat's becoming a boundary rather than an edge.
 */
const AUTO_NETWORKS = ["druid", "wizard"] as const;

/** Is this a network the labels alone can wire up — and, if so, a mode a route can be denied? */
function isAutoNetwork(network: TravelNetwork): network is TravelToggle {
  return (AUTO_NETWORKS as readonly string[]).includes(network);
}

/** What a build found, and — the half worth reading — what it couldn't. */
export interface TravelBuildReport {
  zones: number;
  nodes: number;
  edges: number;
  /** Boundaries found, and how many of them only one side's mapmaker labelled. */
  boundaries: number;
  oneSided: string[];
  /** Destinations no map file answered to, and the zones whose labels named them. */
  unresolved: { name: string; from: string[] }[];
  /** Labels that read as travel but named nowhere — a bare `Zone Line`, a `Succor` point. */
  dropped: { zone: string; label: string }[];
  /** The conveyances found, and which zones are in them. */
  networks: { network: TravelNetwork; zones: string[] }[];
  /** Zones with a map file and no way in or out. The list to work through by hand. */
  isolated: string[];
  /**
   * Zones left out for not being in the game (`ABSENT_ZONES`), and how many borders were refused into
   * each — which is the size of the shortcut that would otherwise exist.
   */
  absent: { zone: string; borders: number }[];
}

/**
 * The two directed walk edges between a pair of nodes sharing a zone. Shared with the manual pass, so
 * a hand-added dock is wired into its zone by exactly the rule everything else was.
 */
export function walkPair(a: TravelNode, b: TravelNode, zone: string): TravelEdge[] {
  const { cost, assumed } = zoneDistance(a, b, zone);
  const edge = { mode: "walk" as const, cost, zone, ...(assumed ? { assumed: true } : {}) };
  return [
    { from: a.id, to: b.id, ...edge },
    { from: b.id, to: a.id, ...edge },
  ];
}

/** Every walk within one zone: each pair of its nodes, both ways. */
export function zoneWalks(nodes: TravelNode[], zone: string): TravelEdge[] {
  const edges: TravelEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) edges.push(...walkPair(nodes[i], nodes[j], zone));
  }
  return edges;
}

/**
 * Build the graph. `zoneNames` is `file → long name` as the pack and the catalogue named them
 * (`zonesFromFiles`); it's what a label's `to The Lesser Faydark` is resolved against, through the one
 * fold every zone comparison in the app shares
 * ([ADR 0059](../../../specs/decisions/0059-a-zone-s-variants-are-one-zone.md)).
 */
export function buildTravelGraph(
  source: { id: string; dir?: string },
  harvests: ZoneHarvest[],
  zoneNames: Record<string, string>,
  /**
   * Zones to leave out because **the server hasn't got them** (`ABSENT_ZONES` — each named either as
   * you'd say it or as its map file).
   *
   * An input to *creation*, not a correction applied afterwards, so **re-running the build is always
   * safe**: a zone that isn't in the game never enters the graph, rather than entering it and being
   * removed by a second pass someone might forget to run.
   */
  absentZones: readonly string[] = [],
): { graph: TravelGraph; report: TravelBuildReport } {
  const nodes: TravelNode[] = [];
  const dropped: { zone: string; label: string }[] = [];
  const usedIds = new Set<string>();
  /** Conveyances by network, so the hubs can be wired once every zone has been read. */
  const members = new Map<TravelNetwork, TravelNode[]>();
  /** Boundaries by their canonical id — one node per border, filled in from both sides. */
  const boundaries = new Map<string, TravelNode>();

  const known = new Set(harvests.map((h) => h.zone));
  /** One resolver for every pass — see `zoneFileFor`, which is also what the router and the manual
   *  pass ask. Memoised because a big pack asks it once per exit label. */
  const resolved = new Map<string, string | undefined>();
  const fileOf = (name: string): string | undefined => {
    if (!resolved.has(name)) resolved.set(name, zoneFileFor(zoneNames, known, name));
    return resolved.get(name);
  };

  const zoneLabel = (file: string): string => zoneNames[file] ?? file;
  const unresolved = new Map<string, Set<string>>();

  // Which files the exception list means, through the same fold as everything else — so an entry can
  // name the zone or the file, since a file name differs between packs while a zone's name doesn't.
  const absent = new Set<string>();
  const refusedBorders = new Map<string, number>();
  for (const zone of absentZones) {
    const file = fileOf(zone);
    if (file) absent.add(file);
  }

  /** How you cross a border, when a conveyance's own label said so. */
  const crossings = new Map<string, TravelCrossing>();

  for (const harvest of harvests) {
    // A zone that isn't in the game contributes nothing — not its borders, not its docks. Its map file
    // is real and still draws; it just isn't somewhere you can be.
    if (absent.has(harvest.zone)) continue;
    for (const label of harvest.dropped) dropped.push({ zone: harvest.zone, label });

    for (const point of harvest.points) {
      // Where it says it goes, if a map file answers to that. **A conveyance that names its
      // destination is a border**, exactly as a `to X` zone line is: `Boat to Butcherblock Mountains`
      // and `Translocator to Erudin` state a connection, and one that costs no walking and asks
      // nothing of you but turning up is a border by the same argument boats are (ADR 0062). Reading
      // those was the difference between Odus being reachable and being an island.
      const target = point.to ? fileOf(point.to) : undefined;
      // **A border into a zone that isn't in the game is refused, not reported as a mystery.** A map
      // file does answer to it, so calling it unresolved would be a lie: it's a place we know about and
      // are deliberately leaving out. Counted, because that count is the shortcut being avoided.
      if (target && absent.has(target)) {
        refusedBorders.set(target, (refusedBorders.get(target) ?? 0) + 1);
        continue;
      }
      const joins = !!target && known.has(target) && target !== harvest.zone;

      if (!joins) {
        // A conveyance whose destination we couldn't place keeps its node — the maps drew a real dock,
        // and `manual-links.ts` can pair it. A *border* with nowhere to go is only a label.
        if (point.to) {
          const bag = unresolved.get(point.to) ?? new Set();
          bag.add(harvest.zone);
          unresolved.set(point.to, bag);
        }
        if (point.kind !== "place") continue;

        let id = `${harvest.zone}#${slug(point.label)}`;
        for (let n = 2; usedIds.has(id); n++) id = `${harvest.zone}#${slug(point.label)}-${n}`;
        usedIds.add(id);
        const node: TravelNode = {
          id,
          kind: "place",
          label: point.label,
          zones: [harvest.zone],
          at: { [harvest.zone]: [point.at] },
        };
        nodes.push(node);
        // A **network** is about permission — which rings a druid can reach — so it's the crossing's
        // network that matters here, not the crossing itself. A portal belongs to none, and waits.
        const network = point.crossing && networkOfCrossing(point.crossing);
        if (network) {
          const bag = members.get(network) ?? [];
          bag.push(node);
          members.set(network, bag);
        }
        continue;
      }

      // **Both sides land here.** Whichever zone is read first creates the node; the other adds its
      // own coordinates to it. A zone labelling three ways across adds three positions, and a walk
      // to the border takes the nearest.
      const id = boundaryId(harvest.zone, target!);
      let node = boundaries.get(id);
      if (!node) {
        node = { id, kind: "boundary", label: id, zones: id.split("|"), at: {} };
        boundaries.set(id, node);
        usedIds.add(id);
        nodes.push(node);
      }
      node.at[harvest.zone] = [...(node.at[harvest.zone] ?? []), point.at];
      // A ride names itself on the border, so a route can say "take the boat" rather than leaving you
      // to wonder why two zones an ocean apart are next to each other.
      if (point.crossing && !crossings.has(id)) crossings.set(id, point.crossing);
    }
  }

  // Named once the whole corpus has been read, so a border found from one side as a plain zone line and
  // from the other as a boat still ends up saying so.
  //
  // **How you cross is `via`, not part of the name.** It used to be appended to the label too, which
  // meant every consumer either showed it twice or had to check whether the words were already in
  // there. One marking, in one field, which a UI can badge and a script can print.
  for (const [id, node] of boundaries) {
    const [a, b] = node.zones;
    const how = crossings.get(id);
    if (how) node.via = how;
    node.label = `${zoneLabel(a)} ↔ ${zoneLabel(b)}`;
  }

  // ── Walks within each zone ───────────────────────────────────────────────────────────────────
  const byZone = new Map<string, TravelNode[]>();
  for (const node of nodes) {
    for (const zone of node.zones) {
      const bag = byZone.get(zone) ?? [];
      bag.push(node);
      byZone.set(zone, bag);
    }
  }
  const edges: TravelEdge[] = [];
  for (const [zone, inZone] of byZone) edges.push(...zoneWalks(inZone, zone));

  // ── Teleport networks ────────────────────────────────────────────────────────────────────────
  const networks: { network: TravelNetwork; zones: string[] }[] = [];
  for (const [network, found] of members) {
    const zones = [...new Set(found.flatMap((n) => n.zones))].sort();
    networks.push({ network, zones });
    // Boats and gnomes are found, listed, and left to be paired by hand. And one zone's worth of
    // rings is not a network — there's nowhere to go — so the nodes stay but the hub doesn't,
    // because an empty hub is a lie.
    if (!isAutoNetwork(network) || zones.length < 2) continue;
    const hub: TravelNode = { id: `net:${network}`, kind: "hub", label: `${network} network`, zones: [], at: {} };
    nodes.push(hub);
    for (const node of found) {
      edges.push({ from: node.id, to: hub.id, mode: network, cost: 0 });
      edges.push({ from: hub.id, to: node.id, mode: network, cost: 0 });
    }
  }

  const linked = new Set<string>();
  for (const edge of edges) linked.add(edge.from).add(edge.to);
  const isolated = harvests
    .map((h) => h.zone)
    .filter((zone) => !absent.has(zone))
    .filter((zone) => !(byZone.get(zone) ?? []).some((n) => n.kind === "boundary" || linked.has(n.id)))
    .sort();

  // A border only one mapmaker drew: we know it's there and not where it lands on the far side, so
  // every walk from it in that zone is priced as a guess. Named, because it's a thing to check.
  const oneSided = [...boundaries.values()]
    .filter((node) => node.zones.some((zone) => !node.at[zone]?.length))
    .map((node) => node.id)
    .sort();

  // Carried on the graph so a route can refuse with "not in the game at this time" rather than the
  // useless "no way through" — the reason a person needs, and the one that ends the search.
  return {
    graph: { source, zoneNames, nodes, edges, ...(absent.size ? { absent: [...absent].sort() } : {}) },
    report: {
      zones: harvests.length,
      nodes: nodes.length,
      edges: edges.length,
      boundaries: boundaries.size,
      oneSided,
      unresolved: [...unresolved.entries()]
        .map(([name, from]) => ({ name, from: [...from].sort() }))
        .sort((a, b) => b.from.length - a.from.length || a.name.localeCompare(b.name)),
      dropped,
      networks: networks.sort((a, b) => a.network.localeCompare(b.network)),
      isolated,
      absent: [...absent].sort().map((zone) => ({ zone, borders: refusedBorders.get(zone) ?? 0 })),
    },
  };
}
