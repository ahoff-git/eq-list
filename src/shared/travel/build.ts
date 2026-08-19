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
 *     edge at all: standing at the node is standing in both zones. A zone whose map marks its **succor
 *     point** also gets a free edge into it from each of the others, because an evacuation is cast from
 *     where you stand — the same one-wayness a druid ring has, inside one zone.
 *  3. **A teleport network collapses to a hub** — a free edge *out* to each of its destinations. Only
 *     rings and spires; a boat runs between two particular docks (see `AUTO_NETWORKS`). The edges are
 *     one-way on purpose: a druid or a wizard casts from where they stand, so every ring is somewhere
 *     you arrive and nowhere you have to walk to first.
 *
 * Pure — the file reading is `electron/travel-graph.ts`.
 */

import { zoneSpelling } from "../zones/spelling";
import type { ZoneHarvest } from "./harvest";
import {
  boundaryId,
  isCast,
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
 * Is this a network the labels alone can wire up — and, if so, a mode a route can be denied?
 *
 * The same question as `isCast`: what makes a ring network wire itself is what makes it one-way, and
 * both are "it's a spell". Hubbing a boat instead would make every dock in the world mutually reachable
 * for nothing, which is the kind of wrong that produces a confident, useless route — so a boat's and a
 * gnome's nodes are found, reported, and left to `manual-links.ts`.
 */
function isAutoNetwork(network: TravelNetwork): network is TravelToggle {
  return network !== "boat" && isCast(network);
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
  /** Labels that read as travel but named nowhere — a bare `Zone Line`, `Zone Out`. */
  dropped: { zone: string; label: string }[];
  /**
   * The conveyances found, and which zones are in them. `succor` reads a little differently from the
   * rest — it wires no network, so its row is simply the zones whose maps say where an evacuation
   * drops you.
   */
  networks: { network: TravelNetwork; zones: string[] }[];
  /** Zones with a map file and no way in or out. The list to work through by hand. */
  isolated: string[];
  /** Second drawings of a zone the pack already has, and which file each was folded into. */
  merged: { dropped: string; kept: string }[];
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
 * The free ways **into** a zone's safe point: from every other node in that zone, for nothing.
 *
 * An evacuation is cast from where you stand — the same fact that makes a druid ring one-way — so a
 * succor point is somewhere you arrive and never somewhere you walk to in order to leave. Leaving is
 * an ordinary walk, which `zoneWalks` has already priced; these are the edges that make the arrival
 * cost nothing.
 *
 * It's a hub's shape without a hub, because a succor network has exactly one destination: the zone's
 * own. Wiring it through `net:succor` would say every zone's safe point reaches every other, which is
 * a teleport nobody has. So the free edges are stated directly, and the toggle then filters them like
 * any other conveyance's.
 */
export function zoneSuccors(nodes: TravelNode[], zone: string): TravelEdge[] {
  const points = nodes.filter((n) => n.via === "succor");
  return points.flatMap((point) =>
    nodes
      .filter((n) => n.id !== point.id)
      .map((n) => ({ from: n.id, to: point.id, mode: "succor" as const, cost: 0, zone })),
  );
}

/**
 * **Two files drawing one zone**, and which of them is the zone.
 *
 * A pack ships a map per zone, except where it doesn't: Brewall carries both `misty.txt` and
 * `mistythicket.txt`, both `sro.txt` and `southro.txt`, five such pairs in 590 files. They are the
 * same place drawn twice — identical exit labels, different coordinate frames — and the second one is
 * always the zone's **long name with the spaces closed up**, which is a file name nothing in the
 * catalogue answers to, so it comes through unnamed and enters the graph as a zone of its own.
 *
 * That is a zone doubled from top to bottom: two borders into Rivervale, two druid rings in the
 * network, and a route that offers you one of each with nothing to tell them apart. Which is how a
 * player came to rule out "Druid Ring · Misty Thicket" and then be offered "Druid Ring · mistythicket".
 *
 * The test is **exact `zoneSpelling` equality** and deliberately not `sameZoneOrMisspelling`: over
 * this pack the one-edit tier pairs up `mseru`/`sseru`, `shipmvu`/`shippvu`/`shipuvu` and four
 * `phinterior` rooms, all of them genuinely different zones a letter apart. Closed-up spelling matched
 * exactly five pairs and every one is real.
 *
 * **The named file wins**, which in all five cases is the game's own short name — the one the log says
 * you're in, so keeping it is what makes a route out of where you're standing work. The other's
 * coordinates are *not* merged in: two drawings are two frames, and averaging them would put the ring
 * somewhere neither of them has it.
 */
export function duplicateZoneFiles(zoneNames: Record<string, string>, files: readonly string[]): Record<string, string> {
  const byZone = new Map<string, string[]>();
  for (const file of files) {
    const spelling = zoneSpelling(zoneNames[file] ?? file);
    if (spelling) byZone.set(spelling, [...(byZone.get(spelling) ?? []), file]);
  }
  const merged: Record<string, string> = {};
  for (const group of byZone.values()) {
    if (group.length < 2) continue;
    // Named beats unnamed; failing that the shorter file name, so the answer can't depend on the
    // order a folder happened to list its files in.
    const [kept] = [...group].sort(
      (a, b) => Number(zoneNames[b] !== b) - Number(zoneNames[a] !== a) || a.length - b.length || a.localeCompare(b),
    );
    for (const file of group) if (file !== kept) merged[file] = kept;
  }
  return merged;
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

  // **One zone, one file.** Applied before a single label is read, for the same reason the absent
  // zones are: a second drawing that never enters the graph can't double a border, and there's no
  // later pass to remember. Its own points are skipped and the graph carries the redirect, so asking
  // for a route to the file we dropped still lands on the zone.
  const merged = duplicateZoneFiles(zoneNames, harvests.map((h) => h.zone));
  const known = new Set(harvests.map((h) => h.zone).filter((zone) => !merged[zone]));
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
    // is real and still draws; it just isn't somewhere you can be. A second drawing of a zone we
    // already have contributes nothing for a different reason: it isn't somewhere *else*.
    if (absent.has(harvest.zone) || merged[harvest.zone]) continue;
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
          // **Only a succor marks itself.** `via` is how you *got* somewhere, and a succor point is the
          // one place where that's settled by the place itself — you evacuated, there is no other way
          // to arrive. A dock wearing `via: "boat"` would instead claim a ride nobody has paired up
          // yet, so a conveyance's kind stays where it belongs: on the border, once one exists.
          ...(point.crossing === "succor" ? { via: "succor" as const } : {}),
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
  for (const [zone, inZone] of byZone) edges.push(...zoneWalks(inZone, zone), ...zoneSuccors(inZone, zone));

  // ── Teleport networks ────────────────────────────────────────────────────────────────────────
  const networks: { network: TravelNetwork; zones: string[] }[] = [];
  for (const [network, found] of members) {
    const zones = [...new Set(found.flatMap((n) => n.zones))].sort();
    networks.push({ network, zones });
    // Boats and gnomes are found, listed, and left to be paired by hand — they run between
    // *particular* ends, so there's no network to wire.
    if (!isAutoNetwork(network) || !found.length) continue;
    const hub: TravelNode = { id: `net:${network}`, kind: "hub", label: `${network} network`, zones: [], at: {} };
    nodes.push(hub);
    // **One way only, into the network's destinations.** A port is cast from wherever you're standing,
    // not from the ring — so the ring is somewhere you *arrive*, and there is no edge for walking to
    // one in order to leave. Entering the network is free from anywhere, which is `findRoute`'s job
    // since "anywhere" includes the middle of a zone, where no node is.
    //
    // It also means a **single** ring is a network worth having: one destination reachable from the
    // whole world is a real edge, where under a walk-there-first model it went nowhere.
    for (const node of found) edges.push({ from: hub.id, to: node.id, mode: network, cost: 0 });
  }

  // **Only an edge that leaves the zone counts as a way in or out**, which is the ones with no `zone`
  // on them: a walk and a succor both name the zone they happen inside, and neither gets you out of it.
  // Counting every edge said a zone whose only two nodes were a dock and a succor point was connected,
  // when all it really has is a short walk between two dead ends.
  const linked = new Set<string>();
  for (const edge of edges) if (!edge.zone) linked.add(edge.from).add(edge.to);
  const isolated = harvests
    .map((h) => h.zone)
    .filter((zone) => !absent.has(zone) && !merged[zone])
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
    graph: {
      source,
      zoneNames,
      nodes,
      edges,
      ...(absent.size ? { absent: [...absent].sort() } : {}),
      ...(Object.keys(merged).length ? { merged } : {}),
    },
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
      merged: Object.entries(merged)
        .map(([dropped, kept]) => ({ dropped, kept }))
        .sort((a, b) => a.dropped.localeCompare(b.dropped)),
      absent: [...absent].sort().map((zone) => ({ zone, borders: refusedBorders.get(zone) ?? 0 })),
    },
  };
}
