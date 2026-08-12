/**
 * Applying hand-authored travel knowledge on top of a built graph.
 *
 * The maps say where a dock is; they don't say where the boat goes. They label a druid ring without
 * saying which rings a druid can reach. That's the gap this fills — and it fills it *after*
 * generation, as a second pass over the graph, so re-reading the maps never overwrites what a person
 * worked out, and what a person worked out is never confused with what was read.
 *
 * A place is named by **zone plus a piece of its label**, not by node id: an id depends on which
 * pack you built from (`brewall`'s Butcherblock labels its dock differently from the game's own), and
 * hand-authored knowledge should survive switching packs.
 *
 * Pure. The data itself is `manual-links.ts`.
 */

import { zoneSuccors, zoneWalks } from "./build";
import {
  isCast,
  boundaryId,
  graphZones,
  positionsIn,
  slug,
  zoneFileFor,
  type TravelCrossing,
  type TravelGraph,
  type TravelNode,
  type TravelToggle,
} from "./types";

/**
 * The modes a hand-authored entry can be written in: every toggle except `succor`.
 *
 * A pair, a network and a hub all join **two places**. A succor joins a zone to itself, so there is
 * nothing to pair it with and no network for it to be in — it's read off the map's own marker or it
 * isn't there at all. Excluding it here is what stops an entry that would quietly do nothing.
 */
export type TravelJoin = Exclude<TravelToggle, "succor">;

/** Where a manual link attaches. */
export interface TravelPlace {
  /** The zone — its name ("South Qeynos") or its map file (`qeynos`). Either will do: a file name
   *  differs between packs while a zone's name doesn't, so a table shouldn't have to guess which. */
  zone: string;
  /** Case-insensitive substring of the map's own label — `dock`, `druid ring`, `spires`. */
  label?: string;
  /** What to call the node when this pack labels no such place and it has to be invented. */
  name?: string;
}

/**
 * One piece of hand-authored travel.
 *
 * - `boundary` — **two zones connect here.** A boat run, or any crossing that costs no walking and
 *   asks nothing of you but turning up: the two zones get a border, positioned at each end's dock, and
 *   it is as unconditional as a zone line. No mode and no cost, because there's nothing to permit and
 *   nothing to charge.
 * - `pair` — a specific conveyance between specific places, which a route may be denied.
 * - `network` — a destination on one hub, which is what "every ring reaches every other" means. For a
 *   **cast** mode (druid, wizard) the edge runs out of the hub only: the place is somewhere you arrive,
 *   never somewhere you walk to in order to leave.
 */
export type ManualLink =
  | {
      shape: "boundary";
      /** Exactly two zones' worth of places. A chain of ferries is one entry per leg, not one entry. */
      places: TravelPlace[];
      /** How you cross. Recorded on the border as `via` — the border's *name* stays `A ↔ B`, so a
       *  consumer marks the crossing once, from one field. */
      via?: TravelCrossing;
      why: string;
    }
  | {
      shape: "pair" | "network";
      mode: TravelJoin;
      places: TravelPlace[];
      /**
       * What the crossing costs, in the same EQ world units as walking. **Defaults to zero**: the
       * graph measures *walking*, and a port asks for none. Set it to say a ride is a slog worth
       * avoiding — a figure in walk-units is a fudge, and it's a lever the hand-massaging pass has.
       */
      cost?: number;
      why: string;
    };

/** Two places in one zone you can't actually walk between. */
export interface ManualBlock {
  zone: string;
  a: string;
  b: string;
  why: string;
}

export interface TravelManual {
  links: ManualLink[];
  /** Take a zone out of an auto-detected network — a ring the maps label that doesn't work. */
  drop?: { network: TravelJoin; zone: string; why: string }[];
  blocks?: ManualBlock[];
  // Zones the server hasn't opened aren't here: they're excluded when the graph is **built** (the
  // wiki's out-of-era zones plus `ABSENT_ZONES`), because a subtraction you can forget to apply leaves
  // a graph that lies, while a forgotten addition only leaves one that's thin.
}

/** What applying the manual did, and what it couldn't. */
export interface ManualReport {
  /** Links applied, and what each contributed. */
  applied: { why: string; kind: TravelJoin | "boundary"; edges: number }[];
  /** Borders stated by hand — created, or given coordinates the maps didn't pair up themselves. */
  boundaries: string[];
  /** Places that matched no label and were invented, so a pack's coverage is visible. */
  invented: string[];
  /** Entries naming a zone this graph has no map file for — a typo, or a pack that lacks the zone. */
  unknownZones: string[];
  /**
   * Entries left unapplied because they name a zone the server has **out of era**. Not a fault: the
   * knowledge is right and waiting, and it starts working the day that era opens.
   */
  outOfEraZones: string[];
  /** Boundary entries that didn't name exactly two zones, so no border could be stated. */
  badBoundaries: string[];
  /** Walks removed because a block said they aren't walks. */
  blocked: number;
  /** Blocks whose two ends didn't both resolve, so nothing was removed. */
  unresolvedBlocks: string[];
  networksDropped: { network: TravelJoin; zone: string }[];
}

/** Nodes in a zone whose label contains `label` — how every hand-authored entry finds its place. */
function matching(nodes: TravelNode[], zone: string, label: string): TravelNode[] {
  const wanted = label.toLowerCase();
  return nodes.filter((n) => n.zones.includes(zone) && n.label.toLowerCase().includes(wanted));
}

/**
 * Which map file a hand-authored entry means — names a zone either way round ("The Plane of Knowledge"
 * or `poknowledge`), because a file name differs between packs while the zone's name doesn't.
 *
 * The rule itself is `zoneFileFor`, shared with the builder and the router so the same entry can't mean
 * three different things in three passes.
 */
function fileFor(graph: TravelGraph, zone: string): string | undefined {
  return zoneFileFor(graph.zoneNames, graphZones(graph), zone);
}

/**
 * Apply the manual to a graph, returning a new one. Never mutates its input: the generated graph on
 * disk stays the record of what the maps said, and this is what you route over.
 */
export function applyManual(graph: TravelGraph, manual: TravelManual): { graph: TravelGraph; report: ManualReport } {
  const nodes = graph.nodes.map((n) => ({ ...n, zones: [...n.zones], at: { ...n.at } }));
  let edges = [...graph.edges];
  const report: ManualReport = {
    applied: [],
    boundaries: [],
    invented: [],
    unknownZones: [],
    outOfEraZones: [],
    badBoundaries: [],
    blocked: 0,
    unresolvedBlocks: [],
    networksDropped: [],
  };

  // Zones the server hasn't opened never entered the graph — they're excluded at *creation*, so there
  // is nothing to take out here and re-running the build can't reintroduce one.
  //
  // But an entry may still *name* one, and must not be applied: a boat to Timorous Deep is correct
  // knowledge about a Kunark that isn't open, and applying it would invent a dock and hand back the
  // very border creation just refused. So an excluded zone is not a zone a link may attach to.
  const excluded = new Set(graph.absent ?? []);
  const knownZones = new Set(
    [...graphZones({ nodes }), ...Object.keys(graph.zoneNames)].filter((z) => !excluded.has(z)),
  );
  const ids = new Set(nodes.map((n) => n.id));
  const named = (zone: string) => graph.zoneNames[zone] ?? zone;
  /** Zones whose walks need recomputing, because a node or a position was added to them. */
  const touched = new Set<string>();

  const knowZone = (zone: string): boolean => {
    if (knownZones.has(zone)) return true;
    // Told apart on purpose: "this pack has no map for it" is something to go and fix, while "the
    // server hasn't opened it" is the graph working exactly as intended.
    const list = excluded.has(zone) ? report.outOfEraZones : report.unknownZones;
    if (!list.includes(zone)) list.push(zone);
    return false;
  };

  /** The nodes a place names — matched by label, or one invented so the knowledge isn't lost. */
  const resolve = (place: TravelPlace): TravelNode[] => {
    if (!knowZone(place.zone)) return [];
    const found = place.label ? matching(nodes, place.zone, place.label) : [];
    if (found.length) return found;

    const label = place.name ?? place.label ?? "travel point";
    let id = `manual:${place.zone}#${slug(label)}`;
    for (let n = 2; ids.has(id); n++) id = `manual:${place.zone}#${slug(label)}-${n}`;
    const node: TravelNode = { id, kind: "place", label, zones: [place.zone], at: {} };
    nodes.push(node);
    ids.add(id);
    touched.add(place.zone);
    report.invented.push(id);
    return [node];
  };

  /**
   * State a border between two zones, positioned at whatever the named places are. A boat, in other
   * words — and if the maps already found this border, the entry only *adds* coordinates to it, which
   * is what a dock at an already-known crossing amounts to.
   */
  const stateBoundary = (link: Extract<ManualLink, { shape: "boundary" }>): boolean => {
    // Two separate complaints, kept apart: an entry that doesn't *name* two zones is malformed and
    // wants fixing here, while one naming a zone this pack has no map for is fine and simply can't be
    // applied — `unknownZones` already says so, and calling that malformed would send you hunting a
    // bug in the table.
    const declared = [...new Set(link.places.map((p) => fileFor(graph, p.zone) ?? p.zone))];
    if (declared.length !== 2) {
      report.badBoundaries.push(link.why);
      return false;
    }
    // `filter`, not `every` — `every` short-circuits, which would leave the *second* missing zone of
    // an entry out of the report and understate what this pack is missing.
    if (declared.filter((zone) => !knowZone(zone)).length) return false;
    const [a, b] = [...declared].sort();
    // Only *existing* places are read, and a side with none simply leaves the border unplaced there —
    // which is the one-sided border the builder already knows how to price as a guess. Inventing a
    // node here would be a second node for the one place the border already is.
    const positions = Object.fromEntries(
      [a, b].map((zone) => [
        zone,
        link.places
          .filter((p) => (fileFor(graph, p.zone) ?? p.zone) === zone)
          .flatMap((p) => (p.label ? matching(nodes, zone, p.label) : []))
          .flatMap((node) => positionsIn(node, zone)),
      ]),
    );

    const id = boundaryId(a, b);
    let node = nodes.find((n) => n.id === id);
    if (!node) {
      node = { id, kind: "boundary", label: `${named(a)} ↔ ${named(b)}`, zones: [a, b], at: {} };
      nodes.push(node);
      ids.add(id);
    }
    // A border the maps already found gains the crossing too — they knew *where* it is, this entry
    // knows *what it is*, and a person reading the route wants the second.
    if (link.via && !node.via) node.via = link.via;
    for (const zone of [a, b]) {
      if (positions[zone].length) node.at[zone] = [...positionsIn(node, zone), ...positions[zone]];
      touched.add(zone);
    }
    report.boundaries.push(id);
    return true;
  };

  for (const link of manual.links) {
    if (link.shape === "boundary") {
      if (stateBoundary(link)) report.applied.push({ why: link.why, kind: "boundary", edges: 0 });
      continue;
    }

    const sides = link.places.map(resolve).filter((side) => side.length);
    // A pair needs both ends. A network needs only **one** place, because it joins to a hub the
    // build may already have stood up — that's how a ring this pack never drew is added to a
    // network the maps found for themselves.
    if (sides.length < (link.shape === "network" ? 1 : 2)) continue;

    const cost = link.cost ?? 0;
    let added = 0;
    const join = (x: TravelNode, y: TravelNode) => {
      edges.push({ from: x.id, to: y.id, mode: link.mode, cost, why: link.why });
      edges.push({ from: y.id, to: x.id, mode: link.mode, cost, why: link.why });
      added += 2;
    };

    if (link.shape === "network") {
      // Reuse the hub the build made if the maps already found this network, so a manual addition
      // *extends* it rather than standing up a second, disconnected one.
      const hubId = `net:${link.mode}`;
      let hub = nodes.find((n) => n.id === hubId);
      if (!hub) {
        hub = { id: hubId, kind: "hub", label: `${link.mode} network`, zones: [], at: {} };
        nodes.push(hub);
        ids.add(hubId);
      }
      // A cast network's edges run **out of** the hub only, exactly as the build's do: a ring added by
      // hand is a destination, not a stop you walk to. Anything else keeps both directions, because
      // something you board is something you have to reach.
      for (const side of sides) {
        for (const node of side) {
          if (isCast(link.mode)) {
            edges.push({ from: hub.id, to: node.id, mode: link.mode, cost, why: link.why });
            added += 1;
          } else {
            join(node, hub);
          }
        }
      }
    } else {
      for (let i = 0; i < sides.length; i++) {
        for (let j = i + 1; j < sides.length; j++) {
          for (const x of sides[i]) for (const y of sides[j]) join(x, y);
        }
      }
    }
    report.applied.push({ why: link.why, kind: link.mode, edges: added });
  }

  // **Recompute the within-zone edges of every zone this touched**, rather than patching them. A new
  // node needs wiring in — including a free ride to the zone's succor point, if it has one — and a new
  // coordinate on an existing border changes what the walks *already there* cost. So the honest move is
  // to throw that zone's own edges away and let the builder's rules redo them. Those are exactly the
  // edges that name a zone; anything that leaves one (a hub, a hand-authored pair) doesn't and stays.
  if (touched.size) {
    edges = edges.filter((edge) => !edge.zone || !touched.has(edge.zone));
    for (const zone of touched) {
      const inZone = nodes.filter((n) => n.zones.includes(zone));
      edges.push(...zoneWalks(inZone, zone), ...zoneSuccors(inZone, zone));
    }
  }

  // Dropping a network member: the node stays (it's a real place on the map), only its free ride to
  // the rest of the network goes.
  const dropped = new Set(
    (manual.drop ?? []).map((d) => {
      report.networksDropped.push({ network: d.network, zone: d.zone });
      return `${d.network}|${d.zone}`;
    }),
  );
  if (dropped.size) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    edges = edges.filter((edge) => {
      const hub = [edge.from, edge.to].find((id) => id.startsWith("net:"));
      if (!hub) return true;
      const member = byId.get(hub === edge.from ? edge.to : edge.from);
      return !member?.zones.some((zone) => dropped.has(`${edge.mode}|${zone}`));
    });
  }

  // A block **removes** the walk, rather than being carried alongside it: with walks stored, "you
  // can't get there from here" is the absence of an edge, which is one fewer thing for a router to
  // remember and one fewer way for the two to disagree. Applied last, so a recomputed zone can't
  // quietly put back a walk a person said isn't one.
  const walled = new Set<string>();
  for (const block of manual.blocks ?? []) {
    const zone = fileFor(graph, block.zone) ?? block.zone;
    const [a] = matching(nodes, zone, block.a);
    const [b] = matching(nodes, zone, block.b);
    if (!a || !b || a.id === b.id) {
      report.unresolvedBlocks.push(`${block.zone}: ${block.a} ↔ ${block.b}`);
      continue;
    }
    walled.add(`${a.id}|${b.id}|${zone}`);
    walled.add(`${b.id}|${a.id}|${zone}`);
  }
  if (walled.size) {
    const before = edges.length;
    edges = edges.filter((e) => e.mode !== "walk" || !walled.has(`${e.from}|${e.to}|${e.zone}`));
    report.blocked = before - edges.length;
  }

  // `graph.absent` is carried through untouched: the build set it, and it's what lets a route refuse
  // with "not in the game at this time" rather than the useless "no way through".
  return { graph: { ...graph, nodes, edges }, report };
}
