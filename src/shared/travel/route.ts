/**
 * Shortest route across the travel graph — Dijkstra over the stored edges.
 *
 * Every edge is already in the graph (walks within a zone, ports, boats), so this is a textbook
 * shortest path with two additions:
 *
 *  - **A start and a finish are zones, not nodes.** You are somewhere in a zone and want to be
 *    somewhere in another, so each end attaches through a virtual node — free when we don't know
 *    where you are, and the real walk when a `/loc` does.
 *  - **A conveyance you haven't got isn't an edge.** Druid, wizard, boat and gnome edges are filtered
 *    by the toggles before the search starts, so a route never suggests a port you can't take.
 *
 * Crossing a zone line costs nothing and appears as no leg at all: a boundary node is in both its
 * zones, so arriving at one *is* zoning. The walk that follows is in the next zone, and says so.
 *
 * Pure and dependency-free.
 */

import { prettyZoneName } from "../map/map-sources";
import { normalizeZone } from "../sources";
import {
  TRAVEL_DEFAULTS,
  zoneDistance,
  type TravelAt,
  type TravelGraph,
  type TravelMode,
  type TravelNode,
  type TravelOptions,
  type TravelToggle,
} from "./types";

/**
 * A zone, both ways round: the **map file** everything is keyed by, and the **name a person reads**.
 *
 * Both, together, everywhere a route mentions a zone — because they're needed for different things
 * (one looks a map up, the other goes on screen) and a shape that carries only the key invites the
 * mistake of showing it. Nobody wants to be told they're walking across `felwithea`.
 */
export interface TravelZone {
  /** The map file / zone short name: `felwithea`. What kills, pins and maps are keyed by. */
  zone: string;
  /** What to show: "Northern Felwithe". */
  name: string;
}

/** How you got to a step from the one before it. */
export interface TravelLeg {
  mode: TravelMode;
  cost: number;
  /** Which zone a walk crossed. Absent on a conveyance, which crosses none. */
  across?: TravelZone;
  /** The cost is a stand-in — an unplaced border, or a hand-set figure — not a measured distance. */
  assumed: boolean;
}

export interface TravelStep {
  node: TravelNode;
  /** Absent on the first step, which is where you already are. */
  from?: TravelLeg;
}

export interface TravelRoute {
  steps: TravelStep[];
  /** Total straight-line walking, in EQ world units. */
  cost: number;
  /** True when any leg was priced by a stand-in rather than measured. */
  assumed: boolean;
  /** The zones passed through, in order — the route as you'd say it out loud. */
  zones: TravelZone[];
  /** Which conveyances the route actually uses. */
  modes: TravelToggle[];
}

/** Where a route starts or ends: a zone, and your position in it when the log knows one. */
export interface TravelEnd {
  zone: string;
  at?: TravelAt;
}

/**
 * A zone as a person reads it — **the one mask a route's output goes through**.
 *
 * The same order the map's own picker and titles use: this pack's name for the file (which is already
 * the catalogue's, then the pack's solved name, then `prettyZoneName` — see `zonesFromFiles`), and
 * `prettyZoneName` again as a backstop for a zone this graph never named at all, because
 * "Gukbottom" beats "gukbottom" and both beat nothing.
 */
export function zoneName(graph: Pick<TravelGraph, "zoneNames">, zone: string): string {
  return graph.zoneNames[zone] ?? prettyZoneName(zone);
}

/** Which map file a zone name means — its long name, or the file name an unnamed zone shows as. */
export function travelZone(graph: TravelGraph, name: string): string | undefined {
  const wanted = normalizeZone(name);
  if (!wanted) return undefined;
  for (const [file, name] of Object.entries(graph.zoneNames)) {
    if (normalizeZone(name) === wanted) return file;
  }
  const bare = name.trim().toLowerCase();
  return graph.nodes.some((n) => n.zones.includes(bare)) ? bare : undefined;
}

/** A minimal binary min-heap. The graph runs to thousands of nodes, where scanning for the
 *  cheapest each round is the difference between instant and noticeable. */
function createHeap(): {
  push: (id: string, cost: number) => void;
  pop: () => { id: string; cost: number } | undefined;
} {
  const items: { id: string; cost: number }[] = [];
  const swap = (i: number, j: number) => {
    [items[i], items[j]] = [items[j], items[i]];
  };
  return {
    push(id, cost) {
      items.push({ id, cost });
      let i = items.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (items[parent].cost <= items[i].cost) break;
        swap(parent, i);
        i = parent;
      }
    },
    pop() {
      if (!items.length) return undefined;
      const top = items[0];
      const last = items.pop()!;
      if (items.length) {
        items[0] = last;
        let i = 0;
        for (;;) {
          const left = i * 2 + 1;
          const right = left + 1;
          let small = i;
          if (left < items.length && items[left].cost < items[small].cost) small = left;
          if (right < items.length && items[right].cost < items[small].cost) small = right;
          if (small === i) break;
          swap(small, i);
          i = small;
        }
      }
      return top;
    },
  };
}

/** One hop out of a node, as the search sees it. */
interface TravelHop extends TravelLeg {
  to: string;
}

/** The virtual ends. Prefixed so they can't collide with a node id, which never starts with a space. */
const START = " start";
const GOAL = " goal";

/** A virtual end as a node, so the same `zoneDistance` prices its walk as prices every other. */
function endNode(id: string, zone: string, label: string, at?: TravelAt): TravelNode {
  return { id, kind: "place", label, zones: [zone], at: at ? { [zone]: [at] } : {} };
}

/**
 * The cheapest way from one zone to another, or `undefined` when there isn't one with these
 * conveyances allowed.
 *
 * `from`/`to` take a zone's long name or its map file name; pass an `at` for either end and the walk
 * to the first boundary (or from the last) is charged for real instead of assumed free.
 */
export function findRoute(
  graph: TravelGraph,
  from: TravelEnd | string,
  to: TravelEnd | string,
  options: TravelOptions = {},
): TravelRoute | undefined {
  const start = typeof from === "string" ? { zone: from } : from;
  const finish = typeof to === "string" ? { zone: to } : to;
  const fromZone = travelZone(graph, start.zone);
  const toZone = travelZone(graph, finish.zone);
  if (!fromZone || !toZone) return undefined;

  // One mask, used for every zone this function shows: the virtual ends' labels, each leg, and the
  // summary. Nothing downstream has to remember to apply it.
  const named = (zone: string): TravelZone => ({ zone, name: zoneName(graph, zone) });
  const here = endNode(START, fromZone, named(fromZone).name, start.at);
  const there = endNode(GOAL, toZone, named(toZone).name, finish.at);

  // Already there. One zone has nothing the distance between two points doesn't already say, so this
  // doesn't route out through a boundary and back to get home.
  if (fromZone === toZone) {
    const leg = start.at && finish.at ? zoneDistance(here, there, fromZone) : { cost: 0, assumed: true };
    return {
      steps: [{ node: here }, { node: there, from: { mode: "walk", across: named(fromZone), ...leg } }],
      cost: leg.cost,
      assumed: leg.assumed,
      zones: [named(fromZone)],
      modes: [],
    };
  }

  const allowed = { ...TRAVEL_DEFAULTS, ...options };
  const byId = new Map<string, TravelNode>(graph.nodes.map((n) => [n.id, n]));
  byId.set(START, here);
  byId.set(GOAL, there);

  const outgoing = new Map<string, TravelHop[]>();
  const add = (id: string, hop: TravelHop) => {
    const bag = outgoing.get(id) ?? [];
    bag.push(hop);
    outgoing.set(id, bag);
  };
  for (const edge of graph.edges) {
    if (edge.mode !== "walk" && !allowed[edge.mode]) continue;
    const across = edge.zone ? named(edge.zone) : undefined;
    add(edge.from, { to: edge.to, mode: edge.mode, cost: edge.cost, across, assumed: !!edge.assumed });
  }
  // The two ends, wired in by the same rule as everything else: with no position given there is
  // nothing to charge, and the route says that figure is a stand-in.
  for (const node of graph.nodes) {
    if (node.zones.includes(fromZone)) {
      const leg = start.at ? zoneDistance(here, node, fromZone) : { cost: 0, assumed: true };
      add(START, { to: node.id, mode: "walk", across: named(fromZone), ...leg });
    }
    if (node.zones.includes(toZone)) {
      const leg = finish.at ? zoneDistance(node, there, toZone) : { cost: 0, assumed: true };
      add(node.id, { to: GOAL, mode: "walk", across: named(toZone), ...leg });
    }
  }

  const best = new Map<string, number>([[START, 0]]);
  const cameFrom = new Map<string, { id: string; leg: TravelLeg }>();
  const settled = new Set<string>();
  const heap = createHeap();
  heap.push(START, 0);

  for (;;) {
    const cheapest = heap.pop();
    if (!cheapest) return undefined;
    if (settled.has(cheapest.id)) continue;
    settled.add(cheapest.id);
    if (cheapest.id === GOAL) break;

    for (const hop of outgoing.get(cheapest.id) ?? []) {
      if (settled.has(hop.to)) continue;
      const total = cheapest.cost + hop.cost;
      if (total >= (best.get(hop.to) ?? Infinity)) continue;
      best.set(hop.to, total);
      cameFrom.set(hop.to, {
        id: cheapest.id,
        leg: { mode: hop.mode, cost: hop.cost, across: hop.across, assumed: hop.assumed },
      });
      heap.push(hop.to, total);
    }
  }

  // Walk the trail back, then read it forwards.
  const trail: { id: string; leg?: TravelLeg }[] = [];
  for (let id: string | undefined = GOAL; id; ) {
    const previous = cameFrom.get(id);
    trail.push({ id, leg: previous?.leg });
    id = previous?.id;
  }
  trail.reverse();
  const steps: TravelStep[] = trail.map(({ id, leg }) =>
    leg ? { node: byId.get(id)!, from: leg } : { node: byId.get(id)! },
  );

  // Which zones the route goes through. A **walk** says outright which zone it crossed, and that's
  // the reliable signal — a boundary node is in two zones and can't say which way you went through
  // it. But a **conveyance** crosses no zone and still lands you somewhere: a boat you change at
  // Ocean of Tears belongs in the list, so the arrival's zone stands in when it has exactly one.
  const zones = [named(fromZone)];
  for (const step of steps) {
    if (!step.from) continue;
    const zone = step.from.across?.zone ?? (step.node.zones.length === 1 ? step.node.zones[0] : undefined);
    if (zone && zone !== zones[zones.length - 1].zone) zones.push(named(zone));
  }
  if (zones[zones.length - 1].zone !== toZone) zones.push(named(toZone));

  return {
    steps,
    cost: best.get(GOAL) ?? 0,
    assumed: steps.some((s) => s.from?.assumed),
    zones,
    modes: [...new Set(steps.map((s) => s.from?.mode).filter((m): m is TravelToggle => !!m && m !== "walk"))],
  };
}

// ── Asking for a route from a UI ────────────────────────────────────────────────────────────────

/** Why there's no route. A person needs the reason; "nothing found" is not an answer. */
export type TravelRefusal =
  /** The graph is empty — no maps found, or none of them label their exits. */
  | "no-graph"
  /** No map file answers to the zone asked to start from. */
  | "unknown-from"
  /** …or to travel to. */
  | "unknown-to"
  /** The zone is real on the maps and **not in the game** — the hand-authored pass took it out. */
  | "absent"
  /** Both zones are real and nothing joins them with these conveyances allowed. */
  | "unreachable";

/**
 * A route, or the reason there isn't one, plus what the graph actually knows.
 *
 * `findRoute` returns `undefined` for four quite different situations, and a UI that says "no route"
 * to all of them is unhelpful in three: a zone the pack has no map for, a typo, an island in the
 * graph and a port you switched off want different sentences. The sizes come along because "no route"
 * is only believable next to how much was looked at.
 */
export interface TravelAnswer {
  route?: TravelRoute;
  refused?: TravelRefusal;
  /** With `refused: "absent"`, the zone that isn't in the game — named as a person reads it. */
  absent?: string;
  knows: { zones: number; borders: number };
}

/** What the graph covers — the denominator behind any answer it gives. */
function knows(graph: TravelGraph): { zones: number; borders: number } {
  const zones = new Set(graph.nodes.flatMap((n) => n.zones));
  return { zones: zones.size, borders: graph.nodes.filter((n) => n.kind === "boundary").length };
}

/** `findRoute`, with the failure classified — what an interface asks, and what IPC carries. */
export function answerRoute(
  graph: TravelGraph,
  from: TravelEnd | string,
  to: TravelEnd | string,
  options: TravelOptions = {},
): TravelAnswer {
  const answer = { knows: knows(graph) };
  if (!graph.nodes.length) return { ...answer, refused: "no-graph" };

  const start = typeof from === "string" ? from : from.zone;
  const finish = typeof to === "string" ? to : to.zone;
  const fromZone = travelZone(graph, start);
  const toZone = travelZone(graph, finish);
  if (!fromZone) return { ...answer, refused: "unknown-from" };
  if (!toZone) return { ...answer, refused: "unknown-to" };

  // Checked before the search, so a zone the server hasn't got is told apart from one the maps are
  // merely thin about. Its nodes are gone, so the search would only ever say "unreachable".
  const gone = graph.absent?.find((zone) => zone === fromZone || zone === toZone);
  if (gone) return { ...answer, refused: "absent", absent: zoneName(graph, gone) };

  const route = findRoute(graph, from, to, options);
  return route ? { ...answer, route } : { ...answer, refused: "unreachable" };
}
