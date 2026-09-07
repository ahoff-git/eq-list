/**
 * build-web-snapshot.mjs — glob this machine's own reference data into a static snapshot the web
 * build can `fetch()`, so search/travel/map work in a plain browser tab with no server.
 *
 * Copies exactly what is safe to publish, and nothing else:
 *   - `wiki-cache/` and `lucy-cache/` — parsed pages from eqlwiki.com / lucy.allakhazam.com. Public
 *     wiki content, cached under your userData the same as the app already reads it.
 *   - `travel-graphs.json`, `map-zone-names.json` — derived purely from map files + the wiki's own
 *     era data (see ADR 0061: a graph belongs to the map pack it was read from).
 *   - Your own EverQuest install's map files (`<EQ>/maps`), copied **raw** — the browser already
 *     ships `parseEqMap` (it's shared, framework-agnostic code), so there's nothing to pre-parse.
 *
 * Deliberately never reads: kill-log, loot-log, combat-history, shopping-list, spawn-timers,
 * xp/hp estimates, buffs, high-scores, mob-knowledge, peer-kills, identity, window/ui state,
 * game-clock, settings.json. That's every file under userData this script does not name above —
 * all of it is session/gameplay data, and none of it belongs on a public page.
 *
 * Usage:
 *   npm run web:snapshot                     # this machine's userData + configured log folder
 *   npm run web:snapshot -- --logs "<dir>"   # a Logs folder, an EQ install, or a maps folder
 *   npm run web:snapshot -- --out "<dir>"    # where the snapshot goes (default: ./public/data)
 *
 * Needs `npm run build:electron` first — reuses the compiled map-source reader rather than a
 * second copy of the map format in JavaScript (same convention as build-travel-graph.mjs).
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, appDataDirs, dirOpt, few, helpIfAsked, load, opt } from "./lib/cli.mjs";

helpIfAsked(import.meta.url);

const { listSources } = load("electron/eq-maps.js");

const outDir = dirOpt("out", "public/data");

/** Where the app's own userData lives on this machine, or null if it's never been run. */
function userDataDir() {
  const [dir] = appDataDirs();
  return dir ?? null;
}

/** Same resolution order as build-travel-graph.mjs: `--logs`, else the app's saved setting. */
function logDir() {
  const given = opt("logs");
  if (typeof given === "string") return given;
  const dir = userDataDir();
  if (dir) {
    try {
      const settings = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
      if (settings.logDir) return settings.logDir;
    } catch {
      /* no settings yet */
    }
  }
  return undefined;
}

/** Bytes + file count under a path, recursively — for the manifest and the console summary. */
function tally(p) {
  let bytes = 0;
  let files = 0;
  const stat = fs.existsSync(p) ? fs.statSync(p) : null;
  if (!stat) return { bytes, files };
  if (stat.isFile()) return { bytes: stat.size, files: 1 };
  for (const entry of fs.readdirSync(p)) {
    const sub = tally(path.join(p, entry));
    bytes += sub.bytes;
    files += sub.files;
  }
  return { bytes, files };
}

const fmtMB = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** Copy a file or directory if it exists; silently skip if it doesn't (nothing built yet). */
function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
  return true;
}

const manifest = { generatedAt: new Date().toISOString(), sections: {} };

fs.mkdirSync(outDir, { recursive: true });

// --- wiki + lucy caches: copied whole, same on-disk shape the app already reads -----------------
const dataDir = userDataDir();
if (!dataDir) {
  console.log("No userData folder found — run the app at least once before taking a snapshot.");
} else {
  for (const [name, folder] of [
    ["wikiCache", "wiki-cache"],
    ["lucyCache", "lucy-cache"],
  ]) {
    const src = path.join(dataDir, folder);
    const dest = path.join(outDir, folder);
    const copied = copyIfExists(src, dest);
    const { bytes, files } = copied ? tally(dest) : { bytes: 0, files: 0 };
    manifest.sections[name] = { bytes, files };
    console.log(copied ? `${folder}: ${files} files, ${fmtMB(bytes)}` : `${folder}: none on disk yet`);
  }

  // A plain static file server has no directory listing, so the Lucy item cache (one file per id,
  // named by id) needs an index written alongside it — the same reason maps/zone-files.json exists.
  const lucyItemsDir = path.join(outDir, "lucy-cache", "items");
  if (fs.existsSync(lucyItemsDir)) {
    const ids = fs
      .readdirSync(lucyItemsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => Number(f.slice(0, -".json".length)))
      .filter((id) => Number.isInteger(id));
    fs.writeFileSync(path.join(lucyItemsDir, "..", "items-index.json"), JSON.stringify(ids));
    console.log(`lucy-cache: ${ids.length} cached item page(s) indexed`);
  }

  // --- travel graph + zone-name cache: two files, copied as-is -----------------------------------
  const travelOut = path.join(outDir, "travel");
  fs.mkdirSync(travelOut, { recursive: true });
  let travelBytes = 0;
  let travelFiles = 0;
  for (const file of ["travel-graphs.json", "map-zone-names.json"]) {
    const dest = path.join(travelOut, file);
    if (copyIfExists(path.join(dataDir, file), dest)) {
      travelFiles += 1;
      travelBytes += fs.statSync(dest).size;
    }
  }
  manifest.sections.travel = { bytes: travelBytes, files: travelFiles };
  console.log(`travel: ${travelFiles} file(s), ${fmtMB(travelBytes)}`);
}

// --- map files: raw .txt, straight from this machine's EverQuest install -------------------------
const dir = logDir();
if (!dir) {
  console.log("maps: no configured log folder and no --logs given — skipped");
  manifest.sections.maps = { sources: [] };
} else {
  const { sources } = listSources(dir);
  const mapsOut = path.join(outDir, "maps");
  const sourceSummaries = [];
  /** sourceId -> its zone short names, so the web build can list zones with no folder listing to read. */
  const zoneFiles = {};
  for (const source of sources) {
    zoneFiles[source.id] = source.files;
    const destDir = path.join(mapsOut, source.id);
    let files = 0;
    let bytes = 0;
    for (const zone of source.files) {
      for (const suffix of ["", "_1", "_2"]) {
        const file = `${zone}${suffix}.txt`;
        const dest = path.join(destDir, file);
        if (copyIfExists(path.join(source.dir, file), dest)) {
          files += 1;
          bytes += fs.statSync(dest).size;
        }
      }
    }
    sourceSummaries.push({
      id: source.id,
      label: source.label,
      // The travel graph cache (travel-graphs.json) is keyed by this exact folder path — carried so
      // the web build can look its graph up without re-deriving the key (see src/lib/web/travel.ts).
      dir: source.dir,
      zones: source.files.length,
      files,
      bytes,
    });
  }
  manifest.sections.maps = { sources: sourceSummaries };
  fs.mkdirSync(mapsOut, { recursive: true });
  fs.writeFileSync(path.join(mapsOut, "zone-files.json"), JSON.stringify(zoneFiles));
  if (sources.length) {
    console.log(
      `maps: ${sources.length} source(s) — ${few(sourceSummaries.map((s) => `${s.label} (${s.zones} zones)`), 6)}`,
    );
  } else {
    console.log("maps: no maps folder found under", dir);
  }
}

fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nwrote ${path.relative(ROOT, path.join(outDir, "manifest.json"))}`);
