/**
 * The travel graph as seen **from one zone** — what a map can draw, and what a person can audit.
 *
 * The route panel answers "how do I get there?" and says nothing about how good the graph *is*. That
 * is a different question and the one that decides whether an answer can be trusted: which borders
 * this zone actually has, where they sit, which of them nobody drew the far side of, and whether the
 * ring the router keeps porting to is really there. None of it is visible in a list of steps, and all
 * of it is visible on the map the coordinates came from.
 *
 * So this is the **survey**: every node the graph puts in one zone, at its stated position, plus the
 * networks that zone can reach — and those are deliberately **counted, not listed**. A druid reaches
 * eighteen rings from anywhere, and drawing eighteen lines off the edge of Misty Thicket says nothing
 * except that the network exists. One marker saying `Druid Rings · 18` says exactly as much and can be
 * opened when you want the names.
 *
 * Pure, so the main process can answer it and the renderer can draw it.
 */

import {
  isCast,
  positionsIn,
  TRAVEL_DEFAULTS,
  type TravelAt,
  type TravelCrossing,
  type TravelGraph,
  type TravelNodeKind,
  type TravelToggle,
} from "./types";
import { zoneName, type TravelZone } from "./route";

/** One node of the graph, as it sits in the zone being surveyed. */
export interface SurveyNode {
  id: string;
  kind: TravelNodeKind;
  /** The graph's own label — a border reads `A ↔ B`, a place reads what the mapmaker wrote. */
  label: string;
  /** How you cross, when it's anything but walking over a line. */
  via?: TravelCrossing;
  /**
   * Where it is **in this zone**, and a list because a zone can offer several crossings of one
   * border — three ways out of Greater Faydark into Lesser Faydark are three points on one node.
   * **Empty is the finding**: the graph knows this border exists and not where it lands here, so
   * every walk to it is priced by a stand-in. That is precisely what a survey is for.
   */
  at: TravelAt[];
  /** For a border, the zone on the other side — what you'd call the marker. */
  beyond?: TravelZone;
  /**
   * **The wiki said this, no map drew it.** Which is also why it can never have a position: the claim
   * is that two zones connect, not where. Worth showing apart from a border merely nobody placed —
   * one is a hole in the maps, the other is knowledge from somewhere else.
   */
  claimed?: boolean;
}

/**
 * A teleport network reachable from this zone, **grouped**.
 *
 * `here` is the network's own destinations that happen to be in this zone, which is what a line from
 * the group can be drawn to; `destinations` is how many it has in the world, which is the number that
 * would otherwise have been that many lines.
 */
export interface SurveyNetwork {
  mode: TravelToggle;
  /** What to call the group: "Druid Rings", "Wizard Spires". */
  label: string;
  /** Every destination on it, by node id and label, for when the count isn't enough. */
  destinations: { id: string; label: string; zone: TravelZone }[];
  /** The ids of those that are in *this* zone. */
  here: string[];
  /** Is the network switched on? A group you can't use is drawn differently, not hidden. */
  allowed: boolean;
}

/**
 * **One leg of a route, as it falls on one map** — the pair of nodes a walk was measured between.
 *
 * The distance on a route row is `dist3d` between two points in one zone's frame, and this is those
 * two points. Drawn, it is the *measurement* rather than a path: straight, because a straight line is
 * exactly what was measured and nothing in EverQuest walks straight
 * ([ADR 0062](../../../specs/decisions/0062-a-travel-graph-of-zone-lines.md)).
 */
export interface SurveyLeg {
  /** The node ids at each end, so a UI can pick them out of the survey it already has. */
  from: string;
  to: string;
}

/** What one zone's corner of the graph looks like. */
export interface TravelSurvey {
  zone: TravelZone;
  nodes: SurveyNode[];
  networks: SurveyNetwork[];
  /** Nodes the graph puts here with **no position in this zone** — the holes, counted for a headline. */
  unplaced: number;
  /**
   * **Zones the maps draw and the server hasn't got**, as this pack's labels write them.
   *
   * Every pack marks `to The Plane of Knowledge (Click Book)` in half the world, and the Plane of
   * Knowledge is six expansions past this server. The graph already refuses to build a border into it
   * — but the *map* still draws the label, in zone after zone, and a label for somewhere you cannot go
   * is noise sitting exactly where the exits are, which is where you look when you're finding your way
   * out. Carried here so the map can drop them while you're navigating.
   */
  absent: string[];
}

/** What to call a network, for a person. Plural, because a group is what's being named. */
const NETWORK_LABELS: Record<TravelToggle, string> = {
  druid: "Druid Rings",
  wizard: "Wizard Spires",
  gnome: "Translocators",
  succor: "Succor",
};

/**
 * Everything the graph knows about one zone.
 *
 * `zone` is a map file, already resolved — this is the drawing end, and by the time a map is on
 * screen the file is what the caller has.
 */
export function surveyZone(
  graph: TravelGraph,
  zone: string,
  allowed: Partial<Record<TravelToggle, boolean>> = {},
): TravelSurvey {
  const named = (file: string): TravelZone => ({ zone: file, name: zoneName(graph, file) });
  const inZone = graph.nodes.filter((n) => n.zones.includes(zone));

  const nodes: SurveyNode[] = inZone.map((node) => {
    // A border's far side is the other of its two zones. A place has only this one, so there is no
    // beyond and the label already says what it is.
    const far = node.kind === "boundary" ? node.zones.find((z) => z !== zone) : undefined;
    return {
      id: node.id,
      kind: node.kind,
      label: node.label,
      ...(node.via ? { via: node.via } : {}),
      at: positionsIn(node, zone),
      ...(node.claimed ? { claimed: true } : {}),
      ...(far ? { beyond: named(far) } : {}),
    };
  });

  // The networks, read off the hub edges rather than from a list — the same source the router uses,
  // so the survey can't claim a ring the router wouldn't take.
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const on = { ...TRAVEL_DEFAULTS, ...allowed };
  const networks: SurveyNetwork[] = [];
  for (const hub of graph.nodes) {
    if (hub.kind !== "hub") continue;
    const edges = graph.edges.filter((e) => e.from === hub.id);
    const mode = edges.find((e) => isCast(e.mode))?.mode;
    if (!mode || !isCast(mode)) continue;
    const destinations = edges.flatMap((edge) => {
      const node = byId.get(edge.to);
      // A hub's destination is a place, so it is in exactly one zone.
      return node?.zones.length === 1 ? [{ id: node.id, label: node.label, zone: named(node.zones[0]) }] : [];
    });
    networks.push({
      mode,
      label: NETWORK_LABELS[mode],
      destinations: destinations.sort((a, b) => a.zone.name.localeCompare(b.zone.name)),
      here: destinations.filter((d) => d.zone.zone === zone).map((d) => d.id),
      allowed: !!on[mode],
    });
  }

  return {
    zone: named(zone),
    nodes,
    networks: networks.sort((a, b) => a.label.localeCompare(b.label)),
    unplaced: nodes.filter((n) => !n.at.length).length,
    absent: (graph.absent ?? []).map((file) => zoneName(graph, file)).sort(),
  };
}
