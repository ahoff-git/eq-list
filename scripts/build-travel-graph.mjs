/**
 * build-travel-graph.mjs — read your EverQuest map files and compute the travel graph.
 *
 * Every border becomes **one node in both its zones** — Greater Faydark's `to Clan Crushbone` and
 * Clan Crushbone's `to Greater Faydark` are the same place — holding its position in each map's own
 * coordinates. The edges are then the **walks within a zone**, from one of its borders to another,
 * priced by the distance between them; crossing a border itself costs nothing and needs no edge.
 * See specs/travel/README.md.
 *
 * The output is the record of **what the maps said**. Boat runs, translocator gnomes and any
 * correction are a second pass — run `npm run travel:manual` after this one.
 *
 * Usage:
 *   npm run travel:build                     # every map source, from the app's configured log folder
 *   npm run travel:build -- --logs "<dir>"   # a Logs folder, an EQ install, or a maps folder
 *   npm run travel:build -- --source brewall # just one pack (its folder name, lowercased; "stock" = maps/)
 *   npm run travel:build -- --out "<dir>"    # where the JSON goes (default: ./data)
 *   npm run travel:build -- --quiet          # totals only, no findings
 *   npm run travel:build -- --offline        # skip the wiki; only the hand-listed zones are excluded
 *
 * Needs `npm run build:electron` first — it uses the compiled shared modules rather than a second
 * copy of the map format in JavaScript.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, appDataDirs, dirOpt, few, flag, helpIfAsked, load, opt } from "./lib/cli.mjs";

helpIfAsked(import.meta.url);

/**
 * How much of each report to print. They differ because they're read differently: the excluded zones,
 * the isolated ones and a network's members are a sanity check ("does that look about right?"), while
 * the unresolved destinations are a **worklist** — the names you go and type into `manual-links.ts` —
 * so that one is the longest and prints each entry on its own line.
 */
const SHOW = { absent: 8, isolated: 12, networks: 12, unresolved: 15, namedBy: 4 };

const { listSources } = load("electron/eq-maps.js");
const { buildFromSource, graphPath, writeGraph } = load("electron/travel-graph.js");
const { createWikiClient } = load("electron/wiki/index.js");

/**
 * Zones the server has **out of era**, from the wiki — the same derivation the app uses, through the
 * same client and the same on-disk cache, so a graph built here and one built in the app exclude the
 * same zones. `--offline` skips it, and so does an unreachable wiki; either way it says so, because a
 * graph that quietly includes Kunark is worse than one that admits it might.
 */
async function outOfEraZones() {
  if (flag("offline")) return { zones: [], why: "--offline" };
  for (const dir of appDataDirs()) {
    try {
      const zones = await createWikiClient(path.join(dir, "wiki-cache")).outOfEraZones();
      if (zones.length) return { zones, why: null };
      return { zones: [], why: "the wiki returned no out-of-era zones" };
    } catch (e) {
      return { zones: [], why: e.message };
    }
  }
  return { zones: [], why: "no app data folder — run the app once, or pass --offline" };
}

/**
 * Where to look for maps. The app already knows — it watches `<EQ>/Logs` — so the saved setting is
 * the default and `--logs` is for pointing this at someone else's install.
 */
function logDir() {
  const given = opt("logs");
  if (typeof given === "string") return given;
  for (const dir of appDataDirs()) {
    try {
      const settings = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
      if (settings.logDir) return settings.logDir;
    } catch {
      /* not this one */
    }
  }
  return "C:\\Users\\Public\\Daybreak Game Company\\Installed Games\\EverQuest Legends\\Logs";
}

const dir = logDir();
const { mapsDir, sources } = listSources(dir);
if (!sources.length) {
  console.error(`No map files found from ${dir}`);
  console.error("Point --logs at your EQ Logs folder, your EverQuest install, or a maps folder.");
  process.exit(1);
}

const only = opt("source");
const wanted = typeof only === "string" ? sources.filter((s) => s.id === only.toLowerCase()) : sources;
if (!wanted.length) {
  console.error(`No source "${only}". Found: ${sources.map((s) => s.id).join(", ")}`);
  process.exit(1);
}

const outDir = dirOpt("out", "data");
const quiet = flag("quiet");

const era = await outOfEraZones();
console.log(`maps: ${mapsDir}`);
if (era.zones.length) console.log(`out of era: ${era.zones.length} zones, per the wiki`);
else console.log(`out of era: nothing from the wiki (${era.why}) — only the hand-listed zones are excluded`);

for (const source of wanted) {
  const { graph, report } = buildFromSource(source, era.zones);
  const file = graphPath(outDir, source.id);
  writeGraph(file, graph);

  console.log(`\n${source.label} (${source.id})`);
  console.log(`  ${report.zones} zones → ${report.boundaries} boundaries, ${report.nodes} nodes, ${report.edges} edges`);
  for (const net of report.networks) {
    // A single destination is still a network for a *cast* port — you can reach it from anywhere — but
    // for a boat or a gnome one end is half a run, and says so. A succor is neither: every entry is
    // complete on its own, since it takes you nowhere but the zone you're already in.
    const lone = net.zones.length === 1 && (net.network === "boat" || net.network === "gnome");
    const what = net.network === "succor" ? "succor points, in" : `${net.network}:`;
    console.log(
      `  ${what} ${net.zones.length} zone${net.zones.length === 1 ? (lone ? " (one end — needs its pair)" : "") : "s"}` +
        ` — ${few(net.zones, SHOW.networks)}`,
    );
  }
  // Printed whether or not you asked for detail: a graph that knows less on purpose should say so as
  // loudly as one that's merely thin. Summarised, though — which zones is the wiki's business.
  if (report.absent.length) {
    const borders = report.absent.reduce((n, a) => n + a.borders, 0);
    const named = few(
      report.absent.map((a) => a.zone),
      SHOW.absent,
    );
    console.log(
      `  left out ${report.absent.length} zone${report.absent.length === 1 ? "" : "s"} not in the game` +
        ` (refused ${borders} border${borders === 1 ? "" : "s"} into them): ${named}`,
    );
  }
  // Everything the build couldn't do is printed, because a graph that quietly covers less than it
  // claims is worse than one that says where it's thin. This is the hand-massaging list.
  if (!quiet) {
    if (report.oneSided.length) console.log(`  ${report.oneSided.length} borders only one side drew — walks from them are guesses, not measurements`);
    if (report.dropped.length) console.log(`  ${report.dropped.length} travel labels named nowhere (bare "Zone Line", "Zone Out")`);
    if (report.isolated.length) {
      console.log(`  ${report.isolated.length} zones with no way in or out: ${few(report.isolated, SHOW.isolated)}`);
    }
    const top = report.unresolved.slice(0, SHOW.unresolved);
    if (top.length) {
      console.log(`  ${report.unresolved.length} destinations no map file answered to — the top ${top.length}:`);
      for (const miss of top) console.log(`    "${miss.name}" — named by ${few(miss.from, SHOW.namedBy)}`);
    }
  }
  console.log(`  → ${path.relative(ROOT, file) || file}`);
}

console.log(`\nNow apply the hand-authored travel (boats, gnomes, corrections): npm run travel:manual`);
