/**
 * Reads the EverQuest map files off disk: finds the game's `maps` folder, lists what map
 * sets live in it, and loads a zone's geometry on request.
 *
 * The game install is derived from the log directory we already watch (`<EQ>/Logs`), so
 * there's nothing new for the user to configure — if the app can read your log, it can find
 * your maps. Parsing is the shared, pure `parseEqMap`; this module is only I/O and caching.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { mergeEqMaps, parseEqMap, type EqMap, type MapPoi } from "../src/shared/map/eqmap";
import { STOCK_SOURCE_ID, type MapSource, type MapSourceReport } from "../src/shared/map/map-sources";
import { solveZoneNames, zoneLinkName, type ZoneLinks } from "../src/shared/map/zone-names";
import { readJson, writeJson } from "./json-store";

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

/** The same, as raw bytes and off the main thread — for the folder-wide scans below. */
async function readBytesIfPresent(file: string): Promise<Buffer | undefined> {
  try {
    return await fsp.readFile(file);
  } catch {
    return undefined;
  }
}

const P_LINE = "P".charCodeAt(0);
const NEWLINE = "\n".charCodeAt(0);
const RETURN = "\r".charCodeAt(0);

/**
 * The `P` (labelled point) lines of a map file, joined — sieved out of the **raw bytes** rather than
 * by decoding the file and splitting it.
 *
 * A big zone's base file is most of a megabyte of `L` geometry, and a pack of them is 130MB, of which
 * the labels are 2. Decoding all of it to a JS string (which doubles it, latin1 → UTF-16) and cutting
 * it into a million throwaway line strings was half the cost of naming a pack, and all of its garbage.
 * Scanning the buffer decodes only the lines we keep.
 */
function poiLines(buf: Buffer): string {
  const lines: string[] = [];
  let start = 0;
  while (start < buf.length) {
    let end = buf.indexOf(NEWLINE, start);
    if (end === -1) end = buf.length;
    if (buf[start] === P_LINE) {
      lines.push(buf.toString("latin1", start, buf[end - 1] === RETURN ? end - 1 : end));
    }
    start = end + 1;
  }
  return lines.join("\n");
}

/**
 * A zone's **labelled points and nothing else**, across both label layers.
 *
 * Parsing is the shared, tested `parseEqMap` — this used to be done inline with its own
 * `split(",").slice(7)`, which was a second, unvalidated copy of the format's field layout.
 */
export async function readZonePois(dir: string, short: string): Promise<MapPoi[]> {
  const pois: MapPoi[] = [];
  for (const suffix of GEOMETRY_LAYERS) {
    const buf = await readBytesIfPresent(path.join(dir, `${short}${suffix}.txt`));
    if (!buf) continue;
    const labels = poiLines(buf);
    if (labels) pois.push(...parseEqMap(labels).pois);
  }
  return pois;
}

/**
 * How many map files to have in flight at once.
 *
 * A folder scan is 1300 files and 130MB, and the point of a limit is that it stays **background**
 * work: turned loose it saturates the disk queue, which is what a person notices as the whole machine
 * going slow rather than one app being busy. Enough to keep the drive fed, not enough to own it.
 */
const SCAN_CONCURRENCY = 4;

/**
 * Every zone's labelled points in a folder — the one pass that both the gazetteer and the travel
 * harvest are built from, so a folder is read once for the two of them instead of once each.
 *
 * Read asynchronously, a few files at a time: the I/O lands on libuv's pool rather than the main
 * thread, and each `await` is a chance for the event loop to serve the windows. The longest the main
 * thread is held is one zone's labels, not one folder's.
 *
 * Keyed in **file order**, whatever order the reads finish in — `solveZoneNames` gives one name to
 * one file and breaks ties as it goes, so a folder must name itself the same way every run.
 */
export async function readFolderPois(source: Pick<MapSource, "dir" | "files">): Promise<Map<string, MapPoi[]>> {
  const found: MapPoi[][] = [];
  let next = 0;
  const read = async (): Promise<void> => {
    while (next < source.files.length) {
      const at = next++;
      found[at] = await readZonePois(source.dir, source.files[at]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, source.files.length) }, read));
  return new Map(source.files.map((short, at) => [short, found[at] ?? []]));
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

/** Where a folder's remembered gazetteer lives, and the shape it's kept in. */
const GAZETTEER_FILE = "map-zone-names.json";

/**
 * Bumped when the naming *rule* changes (`zoneLinkName` / `solveZoneNames`), so a stored gazetteer
 * solved under the old one is thrown away rather than outliving it — the files haven't changed, so
 * nothing else would notice.
 */
const GAZETTEER_VERSION = 1;

interface StoredGazetteers {
  version: number;
  /** By map folder: what that folder looked like, and what we named it. */
  folders: Record<string, { signature: string; names: Record<string, string> }>;
}

/**
 * A cheap fingerprint of a folder's map files: how many, how many bytes, and the newest mtime.
 *
 * Statting a 1700-file pack costs ~25ms against the ~1s scan it stands in for, and it moves for every
 * way a pack actually changes — installed, updated in place, uninstalled. It is not a content hash and
 * doesn't try to be: the failure it can miss is an edit that keeps the byte count *and* the timestamp,
 * and the cost of that is one stale zone name until something else touches the folder.
 */
async function folderSignature(dir: string): Promise<string> {
  let files = 0;
  let bytes = 0;
  let newest = 0;
  let names: string[] = [];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return "unreadable";
  }
  await Promise.all(
    names
      .filter((name) => /\.txt$/i.test(name))
      .map(async (name) => {
        try {
          const stat = await fsp.stat(path.join(dir, name));
          if (!stat.isFile()) return;
          files += 1;
          bytes += stat.size;
          newest = Math.max(newest, stat.mtimeMs);
        } catch {
          /* vanished between the listing and the stat — the next launch will see it */
        }
      }),
  );
  return `${files}:${bytes}:${Math.round(newest)}`;
}

/**
 * What each map file's zone is *called*, worked out from the exit labels across the whole folder
 * (see `solveZoneNames`).
 *
 * **Remembered on disk between runs**, in `cacheDir`. Solving reads every map in the folder — 199MB
 * across 1300 files for a real install's two sources — and it used to be done on every launch, on the
 * main thread, the moment the map window opened: the app froze for about a second and the machine
 * slowed down with it. A pack's files don't change while it's installed, so the answer is worth
 * keeping; a folder signature (see above) is what notices when it does.
 *
 * Asked for separately from the source list, so the picker is usable by file name while a first solve
 * is in flight, and relabels itself when it lands. Without a `cacheDir` it still works and simply
 * re-solves each run — which is what the tests use.
 */
export function createZoneNamer(cacheDir?: string): {
  names: (source: { dir: string; files: string[] }) => Promise<Record<string, string>>;
  clear: () => void;
} {
  /** One gazetteer per folder, keyed by it — a pack is named once per run, whichever you view. */
  const cache = new Map<string, Record<string, string>>();
  /** Solves in flight, so two windows asking at once share one scan instead of racing two. */
  const solving = new Map<string, Promise<Record<string, string>>>();
  const file = cacheDir ? path.join(cacheDir, GAZETTEER_FILE) : undefined;

  const stored = (): StoredGazetteers => {
    const read = file ? readJson<StoredGazetteers>(file, { version: 0, folders: {} }) : { version: 0, folders: {} };
    return read.version === GAZETTEER_VERSION && read.folders ? read : { version: GAZETTEER_VERSION, folders: {} };
  };

  /** Keep this folder's answer, leaving every other folder's in place. */
  const remember = (dir: string, signature: string, names: Record<string, string>): void => {
    if (!file) return;
    const all = stored();
    all.folders[dir] = { signature, names };
    // Stamped like every other store under `userData` (`data-provenance.ts`). Easy to leave off and
    // expensive to: an unstamped file reads as "written by the current rules", so the health panel
    // would report this gazetteer up to date for ever and a future revision bump would do nothing.
    writeJson(file, all, { what: "zone names", concern: "zone-names" });
  };

  async function solve(source: { dir: string; files: string[] }, signature: string): Promise<Record<string, string>> {
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
    for (const [short, pois] of await readFolderPois(source)) {
      const out = new Set<string>();
      for (const poi of pois) {
        const name = zoneLinkName(poi.label);
        if (name) out.add(name);
      }
      links.set(short, out);
    }
    const names = solveZoneNames(links);
    log.debug("named zones", { dir: source.dir, files: links.size, named: Object.keys(names).length });
    remember(source.dir, signature, names);
    return names;
  }

  return {
    names(source) {
      const cached = cache.get(source.dir);
      if (cached) return Promise.resolve(cached);
      const already = solving.get(source.dir);
      if (already) return already;

      const pending = (async () => {
        const signature = await folderSignature(source.dir);
        const kept = stored().folders[source.dir];
        if (kept?.signature === signature) {
          log.debug("named zones from cache", { dir: source.dir, named: Object.keys(kept.names).length });
          return kept.names;
        }
        return solve(source, signature);
      })()
        .then((names) => {
          cache.set(source.dir, names);
          return names;
        })
        .finally(() => solving.delete(source.dir));

      solving.set(source.dir, pending);
      return pending;
    },
    clear() {
      cache.clear();
      solving.clear();
    },
  };
}
