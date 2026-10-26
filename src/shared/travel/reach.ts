/**
 * reach.ts — how much of the world a built graph can actually get you to, in three numbers.
 *
 * A route is only as good as the graph under it, and the failure that matters reads the same from
 * every side: **"it tells me to run everywhere."** That has two very different causes — a pack that
 * labels no druid ring or wizard spire at all (so there is no network to cast into), and a stored
 * graph that no longer matches what the maps would build — and these counts are what tell them apart
 * without anyone opening a JSON file. See the `travel` step of the setup check (ADR 0340).
 */
import type { TravelGraph } from "./types";

export interface TravelReach {
  /** Zone borders the graph joined — the walking skeleton everything else hangs off. */
  borders: number;
  /** Druid rings the druid network reaches (edges out of `net:druid`). */
  druid: number;
  /** Wizard spires the wizard network reaches (edges out of `net:wizard`). */
  wizard: number;
}

/** Count a graph's borders and the places each cast network reaches. */
export function travelReach(graph: TravelGraph): TravelReach {
  const outOf = (hub: string) => graph.edges.filter((e) => e.from === hub).length;
  return {
    borders: graph.nodes.filter((n) => n.kind === "boundary").length,
    druid: outOf("net:druid"),
    wizard: outOf("net:wizard"),
  };
}

/** Can this graph teleport anywhere at all? */
export const canTeleport = (reach: TravelReach): boolean => reach.druid > 0 || reach.wizard > 0;

/**
 * Which pack to route over: the one being drawn if it can teleport, else the installed pack that
 * reaches most. A pack that labels no ring or spire (the game's own `maps/` folder) has nothing to
 * offer a druid, and routing over it walks you everywhere with every port switched on — so its
 * drawing is kept and another pack's labels are borrowed for the route (ADR 0340).
 *
 * Ranked by ports first and borders second: a port saves whole continents of walking, a border one
 * zone. With no pack that can teleport, the drawn one stands — borrowing would buy nothing.
 */
export function travelPack<S>(drawn: { source: S; reach: TravelReach }, others: { source: S; reach: TravelReach }[]): S {
  if (canTeleport(drawn.reach)) return drawn.source;
  const ports = (r: TravelReach) => r.druid + r.wizard;
  const best = others
    .filter((o) => canTeleport(o.reach))
    .sort((a, b) => ports(b.reach) - ports(a.reach) || b.reach.borders - a.reach.borders)[0];
  return best?.source ?? drawn.source;
}
