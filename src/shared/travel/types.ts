/**
 * The shapes of the travel graph — boundaries between zones, and the walks between boundaries.
 *
 * **A boundary is one node, and the zones are metadata on it.** Greater Faydark's `to Clan Crushbone`
 * and Clan Crushbone's `to Greater Faydark` are not two places, they're one: the border. So the node
 * is `crushbone|gfaydark`, it knows it's in both zones, and it holds **its position in each** —
 * because a border is drawn on two maps, in two different coordinate frames.
 *
 * That makes crossing a zone line free *and edgeless*: standing at the node is standing in both zones
 * at once, so there's nothing to traverse and nothing to price. Every edge in the graph is therefore a
 * **walk within one zone**, from one of that zone's boundaries to another, weighted by the distance
 * between them — which is the only cost travelling actually has.
 *
 * **A boat is a boundary too.** It costs no walking and asks nothing of you but turning up at the dock,
 * which is exactly what a zone line is — so a paired-up ferry becomes a border between the two zones,
 * positioned at each end's dock, rather than a priced ride you might not be allowed to take.
 *
 * Ports are the exception: a druid ring and a spire are `place` nodes in one zone, joined through a hub
 * by an edge naming the conveyance, because taking one needs a class you may not have.
 *
 * See [ADR 0062](../../../specs/decisions/0062-a-travel-graph-of-zone-lines.md). Pure, so the builder
 * (main process) and any consumer (renderer) share it.
 */

import { normalizeZone } from "../sources";

/** An EQ world position, `/loc` order plus height. */
export interface TravelAt {
  y: number;
  x: number;
  z: number;
}

/**
 * How you got somewhere. `walk` is always available — you can always put one foot in front of the
 * other. The rest are conveyances a route may or may not be allowed to use, which is what the toggles
 * govern.
 *
 * **There is no `zoneline` mode and no `boat` mode**, for the same reason: both are boundaries. A
 * boat is a way two zones connect that costs you no walking and asks nothing of you but turning up
 * at the dock, so it's the same thing as a line you step over — the ferry ride's minutes are real
 * and are not what this graph measures.
 */
export type TravelMode = "walk" | "druid" | "wizard" | "gnome";

/** The conveyances a route can be allowed or denied. Walking is not among them. */
export type TravelToggle = Exclude<TravelMode, "walk">;

/**
 * What a conveyance label can *name*, which is a wider set than what needs permission: the maps mark
 * docks, and finding them is how a build reports which boat runs are waiting to be paired up by hand
 * — even though a boat, once paired, is a boundary rather than a mode.
 */
export type TravelNetwork = TravelToggle | "boat";

/**
 * **How you get across**, when it isn't simply walking over a line.
 *
 * A boundary is a boundary whichever way you cross it — that's what makes the graph work — but which
 * way it is, is the first thing a person wants to know: "walk to the dock and take the boat" is a
 * different instruction from "walk over the line", even though both cost the same nothing. So it's
 * recorded on the border rather than left in its label for a reader to spot.
 *
 * **Absent is the common case** and means exactly what it says: an ordinary zone line, nothing to take.
 */
export type TravelCrossing = "boat" | "translocator" | "portal" | "spire" | "ring";

/** What to call each one, for a person. */
export const CROSSING_WORDS: Record<TravelCrossing, string> = {
  boat: "boat",
  translocator: "translocate",
  portal: "portal",
  spire: "spire",
  ring: "ring",
};

/**
 * Which network a crossing belongs to, for the parts that care about *permission* rather than wording:
 * rings and spires wire themselves into a hub, a translocator is a `gnome`, a boat needs no toggle at
 * all. A **portal** belongs to none — nothing about a bare `Portal` says who may use it or where it
 * goes, which is why it waits for `manual-links.ts`.
 */
export function networkOfCrossing(crossing: TravelCrossing): TravelNetwork | undefined {
  switch (crossing) {
    case "ring":
      return "druid";
    case "spire":
      return "wizard";
    case "translocator":
      return "gnome";
    case "boat":
      return "boat";
    default:
      return undefined;
  }
}

/** …and back, so a route's conveyance leg words itself the same way a border does. */
export function crossingOfMode(mode: TravelMode): TravelCrossing | undefined {
  switch (mode) {
    case "druid":
      return "ring";
    case "wizard":
      return "spire";
    case "gnome":
      return "translocator";
    default:
      return undefined;
  }
}

/**
 * Which conveyances a route may use.
 *
 * **Druid and wizard default off** — both need a class you may not have or a favour you may not be
 * able to call in, so a route that quietly assumes one would be advice you can't take. **Gnomes
 * default on**: a translocator is public transport, open to anyone who walks up to it. Boats aren't
 * here at all — they're boundaries, as unconditional as a zone line.
 */
export const TRAVEL_DEFAULTS: Record<TravelToggle, boolean> = {
  druid: false,
  wizard: false,
  gnome: true,
};

export type TravelOptions = Partial<Record<TravelToggle, boolean>>;

/**
 * What a node is.
 *
 * - `boundary` — the border between two zones, in both of them. The reason the graph works.
 * - `place` — somewhere in *one* zone you can travel from: a druid ring, a spire, a dock.
 * - `hub` — a teleport network, in no zone at all. Every druid ring reaches every other, which is a
 *   clique; a hub with a free edge to each member has the same shortest paths, a fraction of the
 *   edges, and one node to skip when druids are switched off.
 */
export type TravelNodeKind = "boundary" | "place" | "hub";

export interface TravelNode {
  /** `<zoneA>|<zoneB>` for a boundary (zones sorted, so a border has one name), `<zone>#<slug>` for
   *  a place, `net:<network>` for a hub. */
  id: string;
  kind: TravelNodeKind;
  /** Readable: "Greater Faydark ↔ Clan Crushbone", or the map's own words for a place. */
  label: string;
  /** The zones this node is in — two for a boundary, one for a place, none for a hub. */
  zones: string[];
  /**
   * How you cross, for a boundary that isn't just a line to step over — a boat, a translocator, a
   * portal. **Absent means an ordinary zone line**, which is most of them.
   */
  via?: TravelCrossing;
  /**
   * Where it is **in each zone**, keyed by zone. Two frames for a boundary, because two maps drew it.
   *
   * A zone can offer **several** crossing points to the same neighbour — three ways out of Greater
   * Faydark into Lesser Faydark — so this is a list, and a walk uses the nearest. Collapsing them to
   * an average would put the border somewhere none of them is.
   *
   * A zone can also be **missing** here: the far side's mapmaker labelled no way back, so we know the
   * border exists and not where it lands. Walking to or from it there costs `UNKNOWN_CROSSING`.
   */
  at: Record<string, TravelAt[]>;
}

export interface TravelEdge {
  from: string;
  to: string;
  mode: TravelMode;
  /** EQ world units of walking. Zero for a port, which is what makes one worth taking. */
  cost: number;
  /** For a walk: which zone you walk across. It's how an edge is found again to correct by hand. */
  zone?: string;
  /** Set when the cost is a stand-in rather than something measured. Surfaced on the route. */
  assumed?: boolean;
  /** Why this edge exists, for the ones a person added by hand. */
  why?: string;
}

export interface TravelGraph {
  /**
   * Which map source this was built from. A graph belongs to one pack, like the zone names do
   * ([ADR 0061](../../../specs/decisions/0061-a-map-pack-names-its-own-zones.md)) — two packs label
   * different exits, so they describe different graphs of the same world.
   */
  source: { id: string; dir?: string };
  /** Map file → the zone's long name, as the catalogue and that pack's labels named it. */
  zoneNames: Record<string, string>;
  nodes: TravelNode[];
  edges: TravelEdge[];
  /**
   * Zones the maps draw that **the server hasn't got** — taken out by the hand-authored pass, and
   * remembered so a route can say "not in the game at this time" rather than the useless "no way
   * through". Map file names. Absent on a graph nothing was removed from.
   */
  absent?: string[];
}

/**
 * What walking to or from a node whose position in this zone we don't have costs, in EQ world units.
 *
 * A stand-in, not a measurement: we know the node is in the zone and nothing else. Roughly the width
 * of a mid-sized outdoor zone, so a route through an unmapped border isn't preferred over one whose
 * distances are real, and isn't ruled out either. Every leg priced this way is flagged, so a route can
 * say which of its numbers are guesses.
 */
export const UNKNOWN_CROSSING = 2000;

/** Straight-line distance between two positions. Wrong — nothing in EQ walks straight — but honest
 *  about being wrong, and it orders routes the way walking them does. */
export function dist3d(a: TravelAt, b: TravelAt): number {
  const dy = a.y - b.y;
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dy * dy + dx * dx + dz * dz);
}

/** Where this node can be reached within a zone — empty when it's in the zone but unplaced there. */
export function positionsIn(node: Pick<TravelNode, "at">, zone: string): TravelAt[] {
  return node.at[zone] ?? [];
}

/**
 * What walking between two nodes across one zone costs — **the shortest pair of their crossing
 * points**, because a zone with three ways into its neighbour is a zone where you take the near one.
 *
 * Unplaced at either end means we're guessing, and the caller is told so.
 */
export function zoneDistance(
  a: Pick<TravelNode, "at">,
  b: Pick<TravelNode, "at">,
  zone: string,
): { cost: number; assumed: boolean } {
  const here = positionsIn(a, zone);
  const there = positionsIn(b, zone);
  if (!here.length || !there.length) return { cost: UNKNOWN_CROSSING, assumed: true };
  let best = Infinity;
  for (const from of here) for (const to of there) best = Math.min(best, dist3d(from, to));
  return { cost: best, assumed: false };
}

/** A boundary's canonical id and the pair behind it — sorted, so one border has one name. */
export function boundaryId(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/**
 * **Which map file a zone name means** — the one answer, asked by every pass.
 *
 * There were three of these: the builder resolving a `to X` label, the manual pass resolving a
 * hand-authored entry's zone, and the router resolving a route's endpoints. All three folded the name
 * and scanned `zoneNames`, and then they disagreed about the fallback — the router accepted a bare file
 * name only if some *node* was in that zone, while the manual pass also accepted one that merely had a
 * map file. So an isolated zone could be routed to by its long name but not by its file name, and an
 * excluded zone asked for by file came back "no such zone" instead of "not in the game".
 *
 * A name resolves **exactly after folding**, never by containment: `zoneMatches`' loose reading is right
 * for meeting the wiki halfway and quite wrong here, since "commonlands" sits inside "east commonlands"
 * ([ADR 0059](../../../specs/decisions/0059-a-zone-s-variants-are-one-zone.md)). Failing that, the name
 * is tried **as a file** — which is what a zone nobody could name is called, and what someone who knows
 * EverQuest would type.
 */
export function zoneFileFor(
  zoneNames: Record<string, string>,
  /** The files that exist — a graph's zones, a folder's listing, whichever the caller has. */
  files: ReadonlySet<string>,
  name: string,
): string | undefined {
  const wanted = normalizeZone(name);
  if (!wanted) return undefined;
  for (const [file, zoneName] of Object.entries(zoneNames)) {
    if (normalizeZone(zoneName) === wanted) return file;
  }
  const bare = name.trim().toLowerCase();
  return files.has(bare) || zoneNames[bare] !== undefined ? bare : undefined;
}

/**
 * Every zone a graph covers. Asked by the resolver, by the router's endpoints and by the size a refusal
 * quotes — three places that were each spelling out the same flatMap.
 */
export function graphZones(graph: Pick<TravelGraph, "nodes">): ReadonlySet<string> {
  return new Set(graph.nodes.flatMap((n) => n.zones));
}

/**
 * A node id fragment: readable, stable, and safe to write in a hand-authored file. Shared, because the
 * builder and the manual pass both mint ids and two spellings of "make this a slug" is one too many.
 */
export function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "place"
  );
}
