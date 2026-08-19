/**
 * Shortest route across the travel graph — Dijkstra over the stored edges.
 *
 * Every edge is already in the graph (walks within a zone, ports, boats), so this is a textbook
 * shortest path with three additions:
 *
 *  - **A start and a finish are zones, not nodes.** You are somewhere in a zone and want to be
 *    somewhere in another, so each end attaches through a virtual node — free when we don't know
 *    where you are, and the real walk when a `/loc` does.
 *  - **A conveyance you haven't got isn't an edge.** Druid, wizard, gnome and succor edges are filtered
 *    by the toggles before the search starts, so a route never suggests a port you can't take.
 *  - **A place you've ruled out isn't a node.** `options.avoid` names nodes the search may not pass
 *    through, so "not *that* ring" costs you the ring rather than the whole druid network, and what
 *    comes back is simply the next best route ([ADR 0109](../../../specs/decisions/0109-a-route-can-be-denied-one-place.md)).
 *
 * Crossing a zone line costs nothing and appears as no leg at all: a boundary node is in both its
 * zones, so arriving at one *is* zoning. The walk that follows is in the next zone, and says so.
 *
 * Pure and dependency-free.
 */

import { prettyZoneName } from "../map/map-sources";
import {
  crossingOfMode,
  graphZones,
  isCast,
  TRAVEL_DEFAULTS,
  TRAVEL_VERBS,
  zoneDistance,
  type TravelAt,
  type TravelGraph,
  type TravelMode,
  type TravelNode,
  type TravelOptions,
  type TravelCrossing,
  type TravelToggle,
  zoneFileFor,
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
  /**
   * Which zone this happened in — the one a walk crossed, or the one a succor was cast inside. Absent
   * on a conveyance between zones, which crosses none of them.
   */
  across?: TravelZone;
  /** The cost is a stand-in — an unplaced border, or a hand-set figure — not a measured distance. */
  assumed: boolean;
}

export interface TravelStep {
  node: TravelNode;
  /** Absent on the first step, which is where you already are. */
  from?: TravelLeg;
}

/**
 * **How you get across at this step**, or `undefined` for an ordinary zone line — which is most of them.
 *
 * Two places carry the same fact and callers shouldn't have to know both: a **border** states it
 * (`node.via` — a boat, a translocator, a portal), and a **conveyance leg** implies it from its mode (a
 * druid ring, a wizard spire). The panel and the scripts each worked this out for themselves until this
 * existed, which is one rule in two spellings.
 */
export function stepCrossing(step: TravelStep): TravelCrossing | undefined {
  return step.node.via ?? (step.from ? crossingOfMode(step.from.mode) : undefined);
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

/**
 * Which map file a zone name means — its long name, or the file name an unnamed zone shows as.
 *
 * `zoneFileFor`'s rule, shared with the builder and the manual pass. **A zone with a map file counts
 * even if it has no nodes**: it used to need one, so an isolated zone could be routed to by its long
 * name but not by its file name, and a zone excluded for not being in the game came back "no such zone"
 * rather than "not in the game at this time".
 *
 * Then the graph's own **redirect**: a pack can draw one zone twice and only one of the two files is
 * the zone (`merged`, see `duplicateZoneFiles`). The other still has a name and is still offered by the
 * map window, so asking for a route from the map you're looking at must land on the zone rather than on
 * an empty copy of it. Applied here because this is the one place a name becomes a file.
 */
export function travelZone(graph: TravelGraph, name: string): string | undefined {
  const file = zoneFileFor(graph.zoneNames, graphZones(graph), name);
  return file ? (graph.merged?.[file] ?? file) : undefined;
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

/**
 * **One instruction**: how far, what you do, and where it leaves you.
 *
 * A route is *scanned*, not read — the question at any moment is "what do I do next" — so the steps
 * are turned into four fixed things rather than a sentence, and the turning is done here because two
 * of them need the steps *around* one and none of it is a matter of taste.
 */
export interface TravelInstruction {
  step: TravelStep;
  /** `Run` · `Boat` · `Teleport` … Absent on the first, where you haven't done anything yet. */
  how?: string;
  /** Which crossing it was, so a UI can mark the ones that cost no walking. Absent for a walk. */
  via?: TravelCrossing;
  /** Where this leaves you, in the words a person would use. */
  where: string;
}

/**
 * A route as the list of instructions it reads as.
 *
 * Two things happen here that the raw steps don't do for you:
 *
 *  - **A hub is not a place, so it isn't an instruction.** `net:druid` is the teleport network itself
 *    and it sits in the trail between the start and the ring you land at. Left in, one teleport reads
 *    as two — "Teleport to druid network", then "Teleport to Druid Rings" — and since a hub's edges
 *    cost nothing, dropping it loses no distance.
 *  - **A border is named by the side you come out on.** The node is the *border*, "Greater Faydark ↔
 *    Lesser Faydark", which is the truth and not an instruction: you'd say *run to Lesser Faydark*.
 *    Which of the two that is, is written in the **next** leg, because the walk after a border happens
 *    in the zone the border let you into. A border with nothing after it keeps its own name rather
 *    than guessing.
 *
 * A **place** is in one zone and its label never says which ("Druid Rings"), so its zone is added; the
 * two virtual ends are *named after* their zone already, so saying it again would only stutter.
 *
 * And **an arrival nobody walked is not an instruction.** The last step is the walk from the final
 * node to where you're actually going inside that zone — real and worth saying when a position for the
 * destination is known, and when it isn't it is zero, a guess, and the same zone name the border above
 * it just gave you. Which is how a route ended `2.0k? Run to RunnyEye Citadel` / `0? Run to RunnyEye
 * Citadel` and read as a duplicate, because in every way that shows on screen it was one.
 */
export function routeInstructions(route: Pick<TravelRoute, "steps" | "zones">): TravelInstruction[] {
  const names = new Map(route.zones.map((z) => [z.zone, z.name]));
  const rows = route.steps.flatMap((step, i) => {
    const { kind, label, zones } = step.node;
    if (kind === "hub") return [];
    const via = stepCrossing(step);
    const zone = zones.length === 1 ? (names.get(zones[0]) ?? zones[0]) : undefined;
    const where =
      kind === "boundary"
        ? (route.steps[i + 1]?.from?.across?.name ?? label)
        : zone && zone !== label
          ? `${label} · ${zone}`
          : label;
    return [
      {
        step,
        where,
        ...(via ? { via } : {}),
        ...(step.from ? { how: TRAVEL_VERBS[via ?? "walk"] } : {}),
      },
    ];
  });

  // Never down to nothing: a trip whose every row is empty still has to say where you started.
  const last = rows[rows.length - 1];
  const walkedNowhere = !!last?.step.from && last.step.from.cost === 0 && last.step.from.assumed;
  return rows.length > 1 && last && isRouteEnd(last.step) && walkedNowhere ? rows.slice(0, -1) : rows;
}

/**
 * Is this step one of the route's two **virtual** ends — where you are, and where you're going?
 *
 * They're steps like any other so the legs read right, but they are not places on the graph: there is
 * nothing to open a map at and, in particular, nothing to *avoid* — ruling out where you're standing
 * is not a route, it's a contradiction. Exported so a UI doesn't have to infer it from the position in
 * the list, which is the same fact spelled a second, breakable way.
 */
export function isRouteEnd(step: TravelStep): boolean {
  return step.node.id === START || step.node.id === GOAL;
}

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

  const { avoid, ...toggles } = options;
  const allowed = { ...TRAVEL_DEFAULTS, ...toggles };
  /**
   * The places this route may not use — dropped **as nodes**, before anything is wired, so every later
   * step (the hubs it learns, the succors, both ends) is worked out over the graph that's left rather
   * than over the whole one with a filter to remember. Ruling a node out can never make a route worse
   * than not routing at all: a walk within a zone is priced between *every* pair of its nodes, so a
   * place is only ever somewhere you arrive or turn round, never a corner you must cut.
   */
  const banned = new Set(avoid ?? []);
  const byId = new Map<string, TravelNode>(graph.nodes.map((n) => [n.id, n]));
  byId.set(START, here);
  byId.set(GOAL, there);

  const outgoing = new Map<string, TravelHop[]>();
  const add = (id: string, hop: TravelHop) => {
    const bag = outgoing.get(id) ?? [];
    bag.push(hop);
    outgoing.set(id, bag);
  };
  /**
   * The port networks this route may use, by the mode that opens them.
   *
   * Learned from the edges rather than from the node, and only from edges that **survived the toggle** —
   * so a network you can't use is never even found, and there's one filter rather than two that have to
   * agree.
   */
  const hubs = new Map<string, TravelMode>();
  /**
   * The safe points of the zone you're starting in — the succor edges say which, and they say it only
   * if the toggle let them through, so there's one filter here rather than two that have to agree.
   */
  const succors = new Set<string>();
  for (const edge of graph.edges) {
    if (edge.mode !== "walk" && !allowed[edge.mode]) continue;
    if (banned.has(edge.from) || banned.has(edge.to)) continue;
    const across = edge.zone ? named(edge.zone) : undefined;
    add(edge.from, { to: edge.to, mode: edge.mode, cost: edge.cost, across, assumed: !!edge.assumed });
    if (byId.get(edge.from)?.kind === "hub" && isCast(edge.mode)) hubs.set(edge.from, edge.mode);
    if (edge.mode === "succor" && edge.zone === fromZone) succors.add(edge.to);
  }
  // **A port is cast from where you stand.** You don't walk to a druid ring to leave — you walk to one
  // only when it's where you're going — so the network is entered for free from the start, wherever the
  // start is. Casting later can never help: every destination was already free at step zero.
  for (const [hub, mode] of hubs) add(START, { to: hub, mode, cost: 0, assumed: false });
  // The same argument, one zone wide. The graph's succor edges run from node to node, and "where you
  // stand" is usually neither — it's the middle of the zone, which is the whole reason this helps.
  for (const point of succors) {
    add(START, { to: point, mode: "succor", cost: 0, across: named(fromZone), assumed: false });
  }
  // The two ends, wired in by the same rule as everything else: with no position given there is
  // nothing to charge, and the route says that figure is a stand-in.
  for (const node of graph.nodes) {
    if (banned.has(node.id)) continue;
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
  return { zones: graphZones(graph).size, borders: graph.nodes.filter((n) => n.kind === "boundary").length };
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
