/**
 * Reads the EverQuest map files off disk: finds the game's `maps` folder, lists what map
 * sets live in it, and loads a zone's geometry on request.
 *
 * The game install is derived from the log directory we already watch (`<EQ>/Logs`), so
 * there's nothing new for the user to configure — if the app can read your log, it can find
 * your maps. Parsing is the shared, pure `parseEqMap`; this module is only I/O and caching.
 */

import fs from "node:fs";
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { mergeEqMaps, parseEqMap, type EqMap, type MapPoi } from "../src/shared/map/eqmap";
import { STOCK_SOURCE_ID, type MapSource, type MapSourceReport } from "../src/shared/map/map-sources";
import { solveZoneNames, zoneLinkName, type ZoneLinks } from "../src/shared/map/zone-names";

const log = createLogger("eq-maps");

/**
 * Layers we read: the base file plus `_1`, which is where the packs put their labelled
 * points of interest. Layer 2 is skipped deliberately — in every pack sampled it holds a
 * compass rose and the mapmaker's credits drawn as vector text, parked thousands of units
 * outside the zone, which would both clutter the map and wreck the fit-to-geometry view.
 */
const GEOMETRY_LAYERS = ["", "_1"] as const;

/** Layer 2 again: not drawn, but it's where a pack names its authors, so we can credit them. */
const CREDITS_LAYER = "_2";

/** Zone short name from a map filename, or null if it's a layer file / not a map. */
function shortName(file: string): string | null {
  const m = /^(.+?)(_\d)?\.txt$/i.exec(file);
  if (!m) return null;
  return m[2] ? null : m[1].toLowerCase();
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Base map files in a folder, sorted — empty when the folder isn't one or can't be read. */
function zoneFiles(dir: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .map(shortName)
      .filter((s): s is string => !!s)
      .sort();
  } catch {
    return [];
  }
}

/**
 * `<EverQuest>/maps` for the log directory we're watching. `logDir` is `<EQ>/Logs`, so the
 * install is its parent; we also accept being pointed straight at the install or at the maps
 * folder itself, since a user who moved their logs elsewhere would otherwise be stuck.
 */
export function findMapsDir(logDir: string): string | undefined {
  if (!logDir) return undefined;
  const candidates = [
    path.join(path.dirname(logDir), "maps"),
    path.join(logDir, "maps"),
    logDir, // already the maps folder
  ];
  return candidates.find((dir) => isDir(dir) && zoneFiles(dir).length > 0);
}

/**
 * Every map set we can see: the bundled images, the game's `maps` folder, then each
 * subfolder holding map files (an installed pack — Brewall's, Goodurden's, whatever).
 */
export function listSources(logDir: string): MapSourceReport {
  const sources: MapSource[] = [];
  const mapsDir = findMapsDir(logDir);
  // No maps folder means no maps at all — there's no bundled fallback (ADR 0042), and saying so is
  // more use than an empty picker.
  if (!mapsDir) return { sources };

  sources.push({ id: STOCK_SOURCE_ID, label: "Game maps (maps folder)", dir: mapsDir, files: zoneFiles(mapsDir) });

  let entries: string[] = [];
  try {
    entries = fs.readdirSync(mapsDir).sort();
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    const dir = path.join(mapsDir, entry);
    if (!isDir(dir)) continue;
    const files = zoneFiles(dir);
    if (!files.length) continue;
    sources.push({ id: entry.toLowerCase(), label: entry, dir, files });
  }
  log.debug("map sources", { mapsDir, sources: sources.map((s) => `${s.id}:${s.files.length}`) });
  return { mapsDir, sources };
}

function readIfPresent(file: string): string | undefined {
  try {
    return fs.readFileSync(file, "latin1");
  } catch {
    return undefined;
  }
}

/**
 * A zone's **labelled points and nothing else**, across both label layers.
 *
 * The base file of a big zone is most of a megabyte of `L` geometry that neither the gazetteer nor the
 * travel graph looks at, so the `P` lines are sieved out before the parser sees them. Parsing is still
 * the shared, tested `parseEqMap` — this used to be done inline with its own `split(",").slice(7)`,
 * which was a second, unvalidated copy of the format's field layout.
 */
export function readZonePois(dir: string, short: string): MapPoi[] {
  const pois: MapPoi[] = [];
  for (const suffix of GEOMETRY_LAYERS) {
    const text = readIfPresent(path.join(dir, `${short}${suffix}.txt`));
    if (!text) continue;
    const labels = text
      .split(/\r?\n/)
      .filter((line) => line[0] === "P")
      .join("\n");
    if (labels) pois.push(...parseEqMap(labels).pois);
  }
  return pois;
}

/**
 * One zone's map: base geometry plus the POI layer, merged, with the pack's credits if it
 * ships any. Cached by source+zone — the files don't change while the app runs, and a
 * re-render shouldn't re-read 800KB of text.
 */
export function createMapReader(): {
  load: (dir: string, short: string) => (EqMap & { credits: string[] }) | undefined;
  clear: () => void;
} {
  const cache = new Map<string, (EqMap & { credits: string[] }) | undefined>();

  return {
    load(dir, short) {
      const key = `${dir}|${short}`;
      if (cache.has(key)) return cache.get(key);

      const layers: EqMap[] = [];
      for (const suffix of GEOMETRY_LAYERS) {
        const text = readIfPresent(path.join(dir, `${short}${suffix}.txt`));
        if (text) layers.push(parseEqMap(text));
      }
      if (!layers.length) {
        cache.set(key, undefined);
        return undefined;
      }
      const merged = mergeEqMaps(layers);
      // The credits layer is text-as-geometry; only its labels are worth anything to us.
      const creditsText = readIfPresent(path.join(dir, `${short}${CREDITS_LAYER}.txt`));
      const credits = creditsText
        ? parseEqMap(creditsText)
            .pois.map((p) => p.label)
            .filter((l) => /map|http|www|\bby\b/i.test(l))
            .slice(0, 4)
        : [];
      const out = { ...merged, credits };
      log.debug("loaded map", { short, segments: out.segments.length, pois: out.pois.length });
      cache.set(key, out);
      return out;
    },
    clear() {
      cache.clear();
    },
  };
}

/**
 * What each map file's zone is *called*, worked out from the exit labels across the whole folder
 * (see `solveZoneNames`). One pass per folder per run, cached: it reads every map, which is a few
 * hundred milliseconds of I/O, so it's asked for separately from the source list and the picker
 * improves once it lands rather than waiting on it.
 *
 * Only the `P` lines matter here, so the geometry is skipped while scanning — the base file of a
 * big zone is most of a megabyte of `L` lines we'd only throw away.
 */
export function createZoneNamer(): {
  names: (source: { dir: string; files: string[] }) => Record<string, string>;
  clear: () => void;
} {
  /** One gazetteer per folder, keyed by it — a pack is named once per run, whichever you view. */
  const cache = new Map<string, Record<string, string>>();
  return {
    names(source) {
      const cached = cache.get(source.dir);
      if (cached) return cached;

      // **One folder, on its own.** These used to be pooled, on the reasoning that a short name
      // means the same zone in every pack, so the packs could lend each other labels — the game's
      // own maps carry few exit labels and name barely a third of their files unaided.
      //
      // But a pack is a *survey*, not a contribution to a shared one: two folders are two authors
      // drawing the same world separately, and `solveZoneNames` assigns one name to one file, so
      // merging their evidence lets one pack's file take a name out from under the other's.
      // Measured on a real install (133 game maps beside Brewall's 568), pooling left **eight**
      // Brewall zones nameless that its own labels name outright — Unrest, Sebilis, Dalnir, Kurn's
      // Tower, the City of Mist, the Akheva Ruins, Trakanon's Teeth, Neriak Commons — and rewrote
      // seven more in the other pack's wording. A borrowed name is worth less than a name you can
      // trust: an unnamed file still shows, and still draws.
      const links: ZoneLinks = new Map();
      for (const short of source.files) {
        const out = new Set<string>();
        for (const poi of readZonePois(source.dir, short)) {
          const name = zoneLinkName(poi.label);
          if (name) out.add(name);
        }
        links.set(short, out);
      }
      const names = solveZoneNames(links);
      log.debug("named zones", { dir: source.dir, files: links.size, named: Object.keys(names).length });
      cache.set(source.dir, names);
      return names;
    },
    clear() {
      cache.clear();
    },
  };
}
