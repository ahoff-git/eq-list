/**
 * web-snapshot.ts — the export logic behind `npm run web:snapshot` (ADR 0256): glob this machine's
 * own reference data into the static snapshot the web build can `fetch()`, so search/travel/map
 * work in a plain browser tab with no server.
 *
 * Factored out of `scripts/build-web-snapshot.mjs` — which is now a thin CLI wrapper around
 * `buildWebSnapshot` below — so `web-snapshot-job.ts` can run the exact same export in-process, on
 * the app's own schedule, without spawning a subprocess or a console window. See the CLI script's
 * own doc comment for the full list of what gets published and why (never kill-log, loot-log,
 * shopping-list, settings, etc. — every file under userData this function does not name).
 */
import fs from "node:fs";
import path from "node:path";
import type { Database } from "better-sqlite3";
import { listSources } from "./eq-maps";
import { exportAsBuckets } from "./wiki/page-store";

export interface WebSnapshotSection {
  bytes: number;
  files: number;
}

export interface WebSnapshotMapSource {
  id: string;
  label: string;
  dir: string;
  zones: number;
  files: number;
  bytes: number;
}

export interface WebSnapshotManifest {
  generatedAt: string;
  sections: {
    wikiCache?: WebSnapshotSection;
    lucyCache?: WebSnapshotSection;
    travel?: WebSnapshotSection;
    maps?: { sources: WebSnapshotMapSource[] };
  };
}

export interface BuildWebSnapshotOptions {
  /** The app's own userData dir, or null if the app has never been run (nothing to export yet). */
  userDataDir: string | null;
  /** The already-open app database (ADR 0232) — reused rather than opened a second time. Null
   *  exactly when `userDataDir` is (there's nothing to export either way). */
  db: Database | null;
  /** Where the snapshot is written. */
  outDir: string;
  /** The EverQuest install's maps folder, or undefined to skip the maps section (no configured log folder). */
  logDir?: string;
  /** Skip the maps section entirely — see the CLI script's `--no-maps` doc comment. */
  noMaps?: boolean;
  /** One line per notable step, same shape as `console.log` — the CLI wrapper passes that; the
   *  scheduled in-app job passes its own debug logger instead. */
  onProgress?: (line: string) => void;
}

const fmtMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** Bytes + file count under a path, recursively — for the manifest and the progress line. */
function tally(p: string): { bytes: number; files: number } {
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

/** Copy a file or directory if it exists; silently skip if it doesn't (nothing built yet). */
function copyIfExists(src: string, dest: string): boolean {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, force: true });
  return true;
}

/** A few of a list, then how many were left out — see `scripts/lib/cli.mjs`'s `few` for why. */
function few(items: string[], max: number): string {
  const shown = items.slice(0, max).join(", ");
  return items.length > max ? `${shown} … +${items.length - max} more` : shown;
}

export function buildWebSnapshot(opts: BuildWebSnapshotOptions): WebSnapshotManifest {
  const { userDataDir, db, outDir, logDir, noMaps, onProgress = () => {} } = opts;
  const manifest: WebSnapshotManifest = { generatedAt: new Date().toISOString(), sections: {} };

  fs.mkdirSync(outDir, { recursive: true });

  // --- wiki + lucy caches, plus the travel graph: everything that lives under userData ------------
  if (!userDataDir || !db) {
    onProgress("No userData folder found — run the app at least once before taking a snapshot.");
  } else {
    for (const [name, folder] of [
      ["wikiCache", "wiki-cache"],
      ["lucyCache", "lucy-cache"],
    ] as const) {
      const src = path.join(userDataDir, folder);
      const dest = path.join(outDir, folder);
      let copied = copyIfExists(src, dest);
      if (name === "wikiCache") {
        // The pages themselves no longer live under `wiki-cache/pages` on disk (ADR 0256) — they're
        // rows in the shared `eqlist.db` now. Exported here into the same bucket-file wire format
        // this snapshot has always published, since that's what `src/lib/web/snapshot.ts`'s
        // browser-side reader expects and nothing about the hosted site's format should have to change.
        const pagesDest = path.join(dest, "pages");
        exportAsBuckets(db, pagesDest);
        copied = copied || fs.readdirSync(pagesDest).length > 0;
      }
      const { bytes, files } = copied ? tally(dest) : { bytes: 0, files: 0 };
      manifest.sections[name] = { bytes, files };
      onProgress(copied ? `${folder}: ${files} files, ${fmtMB(bytes)}` : `${folder}: none on disk yet`);
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
      onProgress(`lucy-cache: ${ids.length} cached item page(s) indexed`);
    }

    // --- travel graph + zone-name cache: two files, copied as-is -----------------------------------
    const travelOut = path.join(outDir, "travel");
    fs.mkdirSync(travelOut, { recursive: true });
    let travelBytes = 0;
    let travelFiles = 0;
    for (const file of ["travel-graphs.json", "map-zone-names.json"]) {
      const dest = path.join(travelOut, file);
      if (copyIfExists(path.join(userDataDir, file), dest)) {
        travelFiles += 1;
        travelBytes += fs.statSync(dest).size;
      }
    }
    manifest.sections.travel = { bytes: travelBytes, files: travelFiles };
    onProgress(`travel: ${travelFiles} file(s), ${fmtMB(travelBytes)}`);
  }

  // --- map files: raw .txt, straight from this machine's EverQuest install -------------------------
  if (noMaps) {
    onProgress("maps: skipped (--no-maps)");
  } else if (!logDir) {
    onProgress("maps: no configured log folder and no --logs given — skipped");
    manifest.sections.maps = { sources: [] };
  } else {
    const { sources } = listSources(logDir);
    const mapsOut = path.join(outDir, "maps");
    const sourceSummaries: WebSnapshotMapSource[] = [];
    /** sourceId -> its zone short names, so the web build can list zones with no folder listing to read. */
    const zoneFiles: Record<string, string[]> = {};
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
      onProgress(
        `maps: ${sources.length} source(s) — ${few(sourceSummaries.map((s) => `${s.label} (${s.zones} zones)`), 6)}`,
      );
    } else {
      onProgress(`maps: no maps folder found under ${logDir}`);
    }
  }

  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  return manifest;
}
