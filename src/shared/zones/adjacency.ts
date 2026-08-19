/**
 * What eqlwiki says is next to what — and what the travel graph is allowed to do with it.
 *
 * The graph is read off map labels ([ADR 0062](../../../specs/decisions/0062-a-travel-graph-of-zone-lines.md)),
 * which means it only knows what a mapmaker wrote down. eqlwiki knows the same fact from the other
 * side: every zone page carries an **Adjacent Zones** row, written by people who play here. It states
 * *that* two zones connect and never *where* — so what it can contribute is **reachability, never
 * distance**, and a border it adds has no position in either zone, is priced by `UNKNOWN_CROSSING`,
 * and says so.
 *
 * **Precedence, and the whole of it: an exact map label beats the wiki beats everything else.**
 *
 *  1. A destination a map label names, resolved exactly, is a border **with coordinates**. Nothing
 *     here touches one — a person standing in the zone drew that, and it is the only source that can
 *     say where the crossing is.
 *  2. The wiki adds a border the maps never established. It never overrides, never moves anything, and
 *     never contributes a position.
 *  3. Everything else — the typo/near-miss pairing of a label nothing could place
 *     ([ADR 0115](../../../specs/decisions/0115-a-border-one-side-could-not-name.md)) — runs last, and
 *     is *strengthened* by the step above: a wiki-stated border is one more zone claiming to be a
 *     neighbour, which is exactly the corroboration that pairing needs to be safe.
 *
 * The table itself is `adjacency.generated.ts`, refreshed by `npm run zones:adjacency`. It ships with
 * the app rather than being fetched, so a normal launch costs the wiki nothing.
 */

import { WIKI_ADJACENT } from "./adjacency.generated";

/** One stated connection, as the wiki spells both ends. */
export interface WikiAdjacency {
  zone: string;
  to: string;
}

/**
 * Every pair the wiki states, **once each**, with the two names sorted.
 *
 * Adjacency is symmetric and the wiki writes it twice — Misty Thicket lists Rivervale and Rivervale
 * lists Misty Thicket — so a consumer iterating the raw table does the same work twice and reports
 * twice as many additions as it made. It is also *not reliably* written twice: plenty of pages list a
 * neighbour that doesn't list them back, and one side saying so is the whole claim.
 */
export function statedAdjacencies(
  table: Readonly<Record<string, readonly string[]>> = WIKI_ADJACENT,
): WikiAdjacency[] {
  const seen = new Set<string>();
  const pairs: WikiAdjacency[] = [];
  for (const [zone, others] of Object.entries(table)) {
    for (const to of others) {
      if (zone === to) continue;
      const key = [zone, to].sort().join("\u2194");
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ zone, to });
    }
  }
  return pairs;
}
