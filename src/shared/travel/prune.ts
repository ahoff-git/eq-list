/**
 * prune.ts — take zones out of a graph that has already been built.
 *
 * The build leaves out a zone the server hasn't got at *creation* (`buildTravelGraph`'s `absentZones`),
 * which is right for a graph built here, where the wiki's era list is at hand. The **bundled** graph is
 * built before anyone knows which expansions this server will have open by the time it's read, so it's
 * built with every era open and closed here, at load, against the live list (ADR 0341). Doing that has
 * to come to the same graph the build would have made — `travel-bundle.test.ts` holds it to that.
 */
import type { TravelGraph } from "./types";

/**
 * The graph without these zones (map files): every node that stands in one — its borders, its places —
 * and every edge that touches such a node, or happens inside such a zone. Hubs stand in no zone and stay;
 * they just lose the destinations that went. The zones are added to `absent`, so a route still refuses
 * them with "not in the game" rather than "no way through".
 */
export function withoutZones(graph: TravelGraph, files: readonly string[]): TravelGraph {
  const gone = new Set(files);
  if (!gone.size) return graph;
  const nodes = graph.nodes.filter((n) => !n.zones.some((z) => gone.has(z)));
  const kept = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => kept.has(e.from) && kept.has(e.to) && !(e.zone && gone.has(e.zone)));
  const absent = [...new Set([...(graph.absent ?? []), ...files])].sort();
  return { ...graph, nodes, edges, absent };
}
