/**
 * apply-travel-manual.mjs — the second pass: add the travel the maps can't tell us.
 *
 * Reads `data/travel-graph.<source>.json` (what the maps said, from `npm run travel:build`), lays
 * `src/shared/travel/manual-links.ts` over it — boat runs, translocator gnomes, corrections — and
 * writes `data/travel-graph.<source>.routed.json`, which is the one to route over.
 *
 * Always reads the *generated* file, never its own output, so running it twice is the same as
 * running it once. Re-run it after every `npm run travel:build`.
 *
 * Usage:
 *   npm run travel:manual                     # every generated graph in ./data
 *   npm run travel:manual -- --source brewall # just one
 *   npm run travel:manual -- --out "<dir>"    # where the graphs live (default: ./data)
 *   npm run travel:manual -- --route "Greater Faydark" "Ak'Anon"    # sanity-check a route
 *   npm run travel:manual -- --route A B --druid --wizard           # …with ports allowed
 *
 * Needs `npm run build:electron` first.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);

function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = argv[i + 1];
  return value === undefined || value.startsWith("--") ? true : value;
}
const flag = (name) => argv.includes(`--${name}`);

if (flag("help")) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0].replace(/^\/\*\*?/, ""));
  process.exit(0);
}

function load(module) {
  const file = path.join(ROOT, "dist-electron", module);
  if (!fs.existsSync(file)) {
    console.error(`Missing ${path.relative(ROOT, file)} — run: npm run build:electron`);
    process.exit(1);
  }
  return require(file);
}

const { graphPath, readGraph, routedPath, writeGraph } = load("electron/travel-graph.js");
const { applyManual } = load("src/shared/travel/manual.js");
const { MANUAL_TRAVEL } = load("src/shared/travel/manual-links.js");
const { findRoute } = load("src/shared/travel/route.js");
const { crossingOfMode } = load("src/shared/travel/types.js");

const dir = typeof opt("out") === "string" ? path.resolve(String(opt("out"))) : path.join(ROOT, "data");
const only = opt("source");

/** Which sources have a generated graph waiting. */
function generated() {
  if (typeof only === "string") return [only.toLowerCase()];
  try {
    return fs
      .readdirSync(dir)
      .map((file) => /^travel-graph\.(.+)\.json$/.exec(file)?.[1])
      .filter((id) => id && !id.endsWith(".routed"));
  } catch {
    return [];
  }
}

const sources = generated();
if (!sources.length) {
  console.error(`No generated graph in ${dir} — run: npm run travel:build`);
  process.exit(1);
}

for (const id of sources) {
  const from = graphPath(dir, id);
  const graph = readGraph(from);
  if (!graph) {
    console.error(`Could not read ${path.relative(ROOT, from)} — regenerate it: npm run travel:build`);
    process.exitCode = 1;
    continue;
  }

  const { graph: routed, report } = applyManual(graph, MANUAL_TRAVEL);
  const to = routedPath(dir, id);
  writeGraph(to, routed);

  console.log(`\n${id}: ${graph.edges.length} → ${routed.edges.length} edges, ${routed.nodes.length} nodes`);
  for (const entry of report.applied) {
    console.log(`  ${entry.kind === "boundary" ? "border" : `+${entry.edges} ${entry.kind}`}: ${entry.why}`);
  }
  for (const bad of report.badBoundaries) console.log(`  ⚠ a border needs exactly two zones: ${bad}`);
  // An invention means this pack never labelled the place — the link still works, but every leg
  // through it is priced as a guess, so it's worth knowing which ones they are.
  if (report.invented.length) {
    console.log(`  ${report.invented.length} places invented (unlabelled in this pack): ${report.invented.join(", ")}`);
  }
  if (report.unknownZones.length) {
    console.log(`  ⚠ ${report.unknownZones.length} zones this pack has no map for: ${report.unknownZones.join(", ")}`);
  }
  // Not a warning: correct knowledge, waiting for its era. It starts working the day the era opens.
  if (report.outOfEraZones.length) {
    console.log(`  · ${report.outOfEraZones.length} zones out of era, so those entries wait: ${report.outOfEraZones.join(", ")}`);
  }
  if (report.blocked) console.log(`  −${report.blocked} walks removed by a block`);
  for (const bad of report.unresolvedBlocks) console.log(`  ⚠ block matched nothing: ${bad}`);
  for (const drop of report.networksDropped) console.log(`  −${drop.zone} from the ${drop.network} network`);
  console.log(`  → ${path.relative(ROOT, to) || to}`);

  // A route printed here is the quickest way to see whether the graph is any good.
  const i = argv.indexOf("--route");
  if (i >= 0 && argv[i + 1] && argv[i + 2]) {
    // No boat toggle: a boat is a boundary, as unconditional as a zone line.
    const options = { druid: flag("druid"), wizard: flag("wizard"), gnome: !flag("no-gnome") };
    const route = findRoute(routed, argv[i + 1], argv[i + 2], options);
    if (!route) {
      console.log(`\n  no route ${argv[i + 1]} → ${argv[i + 2]} with ${JSON.stringify(options)}`);
    } else {
      console.log(`\n  ${argv[i + 1]} → ${argv[i + 2]}: ${Math.round(route.cost)} units of walking${route.assumed ? " (partly assumed)" : ""}`);
      // Every zone a route mentions carries its friendly name beside its file, so printing is just
      // reading `.name` — no lookup here, and no chance of showing `felwithea` to a person.
      console.log(`  via ${route.zones.map((z) => z.name).join(" → ")}`);
      for (const step of route.steps) {
        // A walk names the zone it crossed; a port names nothing, because it crosses no zone.
        const how = step.from ? `${step.from.mode}${step.from.across ? ` ${step.from.across.name}` : ""}` : "";
        const leg = step.from ? `${how} ${Math.round(step.from.cost)}${step.from.assumed ? "?" : ""} → ` : "";
        // How you cross is one field, so printing it is one lookup: a border carries it, and a
        // conveyance leg implies it from its mode. Nothing for an ordinary zone line.
        const via = step.node.via ?? (step.from && crossingOfMode(step.from.mode));
        console.log(`    ${leg}${step.node.label}${via ? `  [${via}]` : ""}`);
      }
    }
  }
}
