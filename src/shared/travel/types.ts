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
 * Ports are the exception twice over. A druid ring and a spire are `place` nodes in one zone, reached
 * through a hub by an edge naming the conveyance, because taking one needs a class you may not have —
 * and those edges run **one way, out of the hub**, because a port is *cast from wherever you're
 * standing*. You don't walk to a ring to leave; you walk to one only when it's where you arrive. So
 * every ring in the world is a destination from every zone, including zones that have no ring at all.
 *
 * See [ADR 0062](../../../specs/decisions/0062-a-travel-graph-of-zone-lines.md). Pure, so the builder
 * (main process) and any consumer (renderer) share it.
 */

import { normalizeZone } from "../sources";
import { resolveZone } from "../zones/resolve";

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
 *
 * **`succor` is the odd one out: it goes nowhere.** An evacuation — the spell, or the `/pick` that
 * drops you at the same place — moves you *within* the zone you are already in, from wherever you
 * stand to one fixed safe point. It is a mode all the same, because it is something a route may
 * assume you can do and may be denied; it simply never changes which zone you're in. What it buys is
 * the walk it saves when that spot is nearer the way out than you are
 * ([ADR 0069](../../../specs/decisions/0069-a-succor-is-a-port-inside-one-zone.md)).
 */
export type TravelMode = "walk" | "druid" | "wizard" | "gnome" | "succor";

/** The conveyances a route can be allowed or denied. Walking is not among them. */
export type TravelToggle = Exclude<TravelMode, "walk">;

/**
 * What a conveyance label can *name*, which is a wider set than what needs permission: the maps mark
 * docks, and finding them is how a build reports which boat runs are waiting to be paired up by hand
 * — even though a boat, once paired, is a boundary rather than a mode.
 */
export type TravelNetwork = TravelToggle | "boat";

/**
 * **How you got here**, when it isn't simply walking.
 *
 * Mostly that means getting *across*: a boundary is a boundary whichever way you cross it — that's
 * what makes the graph work — but which way it is, is the first thing a person wants to know. "Walk
 * to the dock and take the boat" is a different instruction from "walk over the line", even though
 * both cost the same nothing, so it's recorded on the border rather than left in its label for a
 * reader to spot.
 *
 * `succor` is the one that crosses nothing: it's a zone's own safe point, arrived at from anywhere
 * inside that zone. Same field because it answers the same question — how did I get to this place,
 * if not on foot?
 *
 * **Absent is the common case** and means exactly what it says: an ordinary zone line, nothing to take.
 */
export type TravelCrossing = "boat" | "translocator" | "portal" | "spire" | "ring" | "succor";

/**
 * **What you do**, in one word, for each way of getting somewhere — walking included.
 *
 * A verb rather than a noun, and the whole vocabulary in one table, because a route is read as a list
 * of instructions: *run, run, boat, teleport*. It replaced a table of nouns (`boat` · `ring` · `spire`)
 * that could only label a border and had nothing to say about the walk between two of them, which left
 * the one thing every step has — how you covered the distance — as the only thing unnamed.
 *
 * A ring and a spire are both **Teleport**: from the reader's side they are the same act, and *which*
 * network it was is already on the step (a ring is labelled "Druid Rings") and in the route's `modes`.
 */
/**
 * **What you walk up to**, for the crossings you have to be *at* before you can take them.
 *
 * A boat, a translocator and a portal are all the same shape: the ride costs nothing and the getting
 * there costs everything, so a route says them as two things — *run 4.1k to the translocator*, then
 * *translocate to the Ocean of Tears*. `TRAVEL_VERBS` is what you do; this is the noun you do it at,
 * and they are two tables because they answer two questions.
 *
 * A ring and a spire are here for completeness and are never used: a port is **cast from where you
 * stand** ([ADR 0066](../../../specs/decisions/0066-a-port-is-cast-from-where-you-stand.md)), so you
 * never walk to one, and a succor is the same one zone wide.
 */
export const CROSSING_PLACES: Record<TravelCrossing, string> = {
  boat: "the boat",
  translocator: "the translocator",
  portal: "the portal",
  spire: "the spires",
  ring: "the druid ring",
  succor: "the safe point",
};

export const TRAVEL_VERBS: Record<TravelCrossing | "walk", string> = {
  walk: "Run",
  boat: "Boat",
  translocator: "Translocate",
  portal: "Portal",
  spire: "Teleport",
  ring: "Teleport",
  succor: "Succor",
};

/**
 * The **networks** you cast into, as against the ones you board.
 *
 * This is the single most important distinction in the graph, and two things follow from it:
 *
 *  - **A network wires itself.** A druid reaches *any* ring from any other and a wizard any spire, so
 *    finding two of them is finding a network — no pairing needed. A boat runs between two particular
 *    docks and a translocator gnome between particular gnomes, so those are `manual-links.ts`'s job.
 *  - **Its edges are one-way.** A port is cast from wherever you're standing, so a ring is somewhere
 *    you *arrive* and never somewhere you have to walk to first. A boat you have to go and board, which
 *    is a walk like any other.
 *
 * Get the second one wrong and every route through a port is priced at the cost of reaching the nearest
 * ring — which is how a druid in a zone with no ring at all was told to walk.
 *
 * **A succor is cast too and is deliberately not here**, because this list is what earns a *hub*: a
 * succor point reaches nothing but itself, so there is no network to collapse and hubbing it would say
 * every zone's safe point leads to every other. Its one-wayness is written straight into the edges the
 * builder makes instead — see `zoneSuccors`.
 */
export const CAST_MODES = ["druid", "wizard"] as const;

/** Is this a spell that casts you into a network — one whose destinations are therefore all arrivals? */
export function isCast(mode: TravelMode): mode is (typeof CAST_MODES)[number] {
  return (CAST_MODES as readonly string[]).includes(mode);
}

/**
 * Which network a crossing belongs to, for the parts that care about *permission* rather than wording:
 * rings and spires wire themselves into a hub, a translocator is a `gnome`, a boat needs no toggle at
 * all, and a succor answers only to itself. A **portal** belongs to none — nothing about a bare
 * `Portal` says who may use it or where it goes, which is why it waits for `manual-links.ts`.
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
    case "succor":
      return "succor";
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
    case "succor":
      return "succor";
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
 *
 * **Succor defaults off** by the druid-and-wizard argument: it needs an evacuation spell, a friend
 * with one, or a second instance to `/pick` into, and none of the three can be read off a map. Unlike
 * a gnome you can walk up to and see, there is nothing here to check before the route relies on it.
 */
export const TRAVEL_DEFAULTS: Record<TravelToggle, boolean> = {
  druid: false,
  wizard: false,
  gnome: true,
  succor: false,
};

/**
 * **One place a route may not use**, remembered by the node it is.
 *
 * The case that asks for this is a port you haven't got: a druid ring or a wizard spire is a *spell*,
 * and the spell that reaches it has a level, so the network toggle — "I can get a druid port" — is too
 * coarse. Turning druid off to dodge one ring you can't cast loses every ring you can. So a route is
 * denied a **place**, not a network, and takes the next best way instead
 * ([ADR 0109](../../../specs/decisions/0109-a-route-can-be-denied-one-place.md)).
 *
 * The `label` and `zone` travel with the id because the id alone is unreadable (`butcher#druid-rings`)
 * and, once a place is out of every route, **nothing else can name it** — the graph is in the main
 * process and only the steps of a route cross to a UI. Without the words there'd be no way to see what
 * you'd switched off, which is the difference between a setting and a trap.
 */
export interface TravelAvoided {
  /** The `TravelNode.id` to leave out. */
  id: string;
  /** The node's own label, as the route showed it — "Druid Rings", "Greater Faydark ↔ Lesser Faydark". */
  label: string;
  /** The zone it's in, as a person reads it. Absent for a border, whose label already names both. */
  zone?: string;
}

/**
 * What a route is allowed to assume: which conveyances, and which particular places to leave out.
 *
 * The two are different questions on purpose — a toggle is *can I do this at all*, `avoid` is *not
 * that one*.
 */
export interface TravelOptions extends Partial<Record<TravelToggle, boolean>> {
  /** `TravelNode` ids the search may not pass through. Anything unknown to the graph is simply unused. */
  avoid?: readonly string[];
}

/**
 * What a node is.
 *
 * - `boundary` — the border between two zones, in both of them. The reason the graph works.
 * - `place` — somewhere in *one* zone you can travel from or arrive at: a druid ring, a spire, a dock,
 *   a succor point.
 * - `hub` — a teleport network, in no zone at all: a free edge **out** to each of its destinations,
 *   entered for free from wherever the route starts (`findRoute`). Every druid ring reaches every other,
 *   which is a clique, and a hub has the same shortest paths with a fraction of the edges — plus one
 *   node to skip when druids are switched off. Nothing points *into* it from the map, which is what
 *   says you cast a port rather than travelling to one.
 */
export type TravelNodeKind = "boundary" | "place" | "hub";

export interface TravelNode {
  /** `<zoneA>|<zoneB>` for a boundary (zones sorted, so a border has one name), `<zone>#<slug>` for
   *  a place, `net:<network>` for a hub. */
  id: string;
  kind: TravelNodeKind;
  /** Readable: "Greater Faydark ↔ Clan Crushbone", or the map's own words for a place. */
  label: string;
  /**
   * **The map's own labels this node was read from**, when they aren't the label itself.
   *
   * A border's name is rewritten to `A ↔ B` once both sides are in, which is right for reading and
   * threw away the only thing that could find it again: `to Erud's Crossing (Translocator Sedina)`
   * becomes `Erud's Crossing ↔ South Qeynos`, and the hand-authored table — which names a place by
   * **zone plus a piece of its label**, deliberately, so it survives switching packs — could no longer
   * see the gnome it was talking about. So a second border through the same NPC was stated with no
   * position at all and every walk to it cost `UNKNOWN_CROSSING`, while the coordinate sat on the
   * border beside it.
   *
   * Absent on a place, whose `label` is already the map's own words.
   */
  labels?: string[];
  /**
   * **Stated by the wiki, not read off a map.** eqlwiki's zone pages list Adjacent Zones, which says
   * two zones connect and never *where* — so a border added from it has no position in either and
   * every walk to it is a stand-in. Marked so a route leaning on one can say the crossing is a claim
   * rather than something a mapmaker drew ([ADR 0025](../../../specs/decisions/0025-observation-over-the-wiki.md)).
   */
  claimed?: boolean;
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
  /**
   * Which zone this happens in — the one a walk crosses, or the one a succor is cast inside. It's how
   * an edge is found again to correct by hand, and how the router knows whose safe point is whose.
   */
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
  /**
   * **A second drawing of a zone this graph already has** → the file that *is* the zone.
   *
   * A pack can ship two maps of one place (`mistythicket.txt` beside `misty.txt`), and only one of
   * them can be the zone or every border into it is doubled — see `duplicateZoneFiles`. The dropped
   * file keeps its name in `zoneNames`, because the map window still offers it and a route asked for
   * from the map you're looking at has to land somewhere: `travelZone` reads this and sends it to the
   * survivor. Absent on a graph with no such pair.
   */
  merged?: Record<string, string>;
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
 * A name resolves **exactly after folding, or by rephrasing** — never by containment. "The Castle of
 * Mistmoore" and "Mistmoore Castle" are the same words in a different order and so the same zone, but
 * "commonlands" merely sits *inside* "east commonlands" and is a different one
 * ([ADR 0059](../../../specs/decisions/0059-a-zone-s-variants-are-one-zone.md)), which is why the
 * resolver's `narrower` tier is left off here: a route to the wrong end of the Commonlands is a wrong
 * answer that reads like a right one
 * ([ADR 0068](../../../specs/decisions/0068-a-zone-name-resolves-against-what-we-know.md)). Failing that,
 * the name is tried **as a file** — which is what a zone nobody could name is called, and what someone
 * who knows EverQuest would type.
 */
export function zoneFileFor(
  zoneNames: Record<string, string>,
  /** The files that exist — a graph's zones, a folder's listing, whichever the caller has. */
  files: ReadonlySet<string>,
  name: string,
): string | undefined {
  if (!normalizeZone(name)) return undefined;
  const match = resolveZone(name, Object.entries(zoneNames), ([, zoneName]) => zoneName);
  if (match) return match.item[0];
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
