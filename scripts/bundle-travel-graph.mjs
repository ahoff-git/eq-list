/**
 * bundle-travel-graph.mjs — build the travel graph the app ships with, for anyone whose maps folder
 * has no pack that labels a druid ring or wizard spire (ADR 0341).
 *
 * Built from **Brewall's pack** (the usual one, and the one whose labels wire both networks) with
 * **every era open**: which expansions this server has open is a fact about the day the graph is read,
 * not the day it was built, so the app closes them at load against the wiki's live list (`withoutZones`).
 * The hand-authored pass is applied here, so the file is exactly what a route is asked over.
 *
 * Re-run when `manual-links.ts`, the adjacency table or the build rules change —
 * `travel-bundle.test.ts` fails when the curated inputs move without it.
 *
 * Usage:
 *   npm run travel:bundle                     # from the app's configured log folder
 *   npm run travel:bundle -- --logs "<dir>"   # a Logs folder, an EQ install, or a maps folder
 *   npm run travel:bundle -- --source brewall # which pack (default: brewall)
 *   npm run travel:bundle -- --dry-run        # say whether it would change, write nothing
 */
import path from "node:path";
import { ROOT, flag, helpIfAsked, load, logDir, opt, writeGenerated } from "./lib/cli.mjs";

helpIfAsked(import.meta.url);

const { listSources } = load("electron/eq-maps.js");
const { buildFromSource, curatedKey } = load("electron/travel-graph.js");
const { applyManual } = load("src/shared/travel/manual.js");
const { MANUAL_TRAVEL } = load("src/shared/travel/manual-links.js");
const { travelReach } = load("src/shared/travel/reach.js");

const OUT = path.join(ROOT, "src", "shared", "travel", "travel-graph.generated.ts");

const id = String(opt("source", "brewall")).toLowerCase();
const { sources } = listSources(logDir());
const source = sources.find((s) => s.id === id);
if (!source) {
  console.error(`No "${id}" pack. Found: ${sources.map((s) => s.id).join(", ") || "nothing"}`);
  process.exit(1);
}

// No era list on purpose — see the header. The hand-listed exclusions still apply inside the build.
const { graph: read } = await buildFromSource(source, []);
const { graph: routed } = applyManual(read, MANUAL_TRAVEL);
// The folder is this machine's, and meaningless anywhere else.
const graph = { ...routed, source: { id: source.id } };
const reach = travelReach(graph);
console.log(`${source.label}: ${reach.borders} borders, ${reach.druid} druid rings, ${reach.wizard} wizard spires`);

/**
 * One node or edge per line, each **as a JSON string** parsed at load: small enough to diff, a reviewer
 * can find a border by name, and TypeScript sees `string[]` — ~2800 object literals is a union it
 * refuses to compute (TS2590).
 */
const rows = (items) => items.map((x) => `  ${JSON.stringify(JSON.stringify(x))},`).join("\n");
const { nodes, edges, ...rest } = graph;
const text = `/**
 * travel-graph.generated.ts — the travel graph shipped with the app — GENERATED, do not edit by hand.
 *
 * Regenerate with \`npm run travel:bundle\` (scripts/bundle-travel-graph.mjs). Built from the
 * ${source.label} pack with every era open; the live era is applied at load (ADR 0341). What routes use
 * when no installed pack labels a druid ring or wizard spire.
 *
 * ${reach.borders} borders, ${reach.druid} druid rings, ${reach.wizard} wizard spires.
 */
import type { BundledTravel, TravelEdge, TravelGraph, TravelNode } from "./types";

const REST: Omit<TravelGraph, "nodes" | "edges"> = JSON.parse(${JSON.stringify(JSON.stringify(rest))});

const NODES: string[] = [
${rows(nodes)}
];

const EDGES: string[] = [
${rows(edges)}
];

export const BUNDLED_TRAVEL: BundledTravel = {
  label: ${JSON.stringify(source.label)},
  curated: ${JSON.stringify(curatedKey())},
  graph: {
    ...REST,
    nodes: NODES.map((row) => JSON.parse(row) as TravelNode),
    edges: EDGES.map((row) => JSON.parse(row) as TravelEdge),
  },
};
`;
writeGenerated(OUT, text, { dryRun: flag("dry-run") });
