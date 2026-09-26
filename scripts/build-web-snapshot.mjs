/**
 * build-web-snapshot.mjs — glob this machine's own reference data into a static snapshot the web
 * build can `fetch()`, so search/travel/map work in a plain browser tab with no server.
 *
 * A thin CLI wrapper: all the actual copying/exporting lives in `electron/web-snapshot.ts`'s
 * `buildWebSnapshot`, compiled to `dist-electron/electron/web-snapshot.js` and loaded here the same
 * way this script already loads the map/database modules — so the app itself can run the exact same
 * export in-process, on its own schedule (`electron/web-snapshot-job.ts`), without a second copy of
 * this logic and without spawning a subprocess.
 *
 * Copies exactly what is safe to publish, and nothing else:
 *   - `wiki-cache/` and `lucy-cache/` — parsed pages from eqlwiki.com / lucy.allakhazam.com. Public
 *     wiki content, published in the same bucket-file wire format this snapshot always has —
 *     `lucy-cache/` still literally is that on disk, but the wiki pages themselves now live as rows
 *     in the app's own shared `eqlist.db` (ADR 0256), so this script exports them into that shape
 *     (`exportAsBuckets`) rather than copying files that no longer exist.
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
 *   npm run web:snapshot -- --no-maps        # skip map files entirely — see "publish" below
 *
 * Needs `npm run build:electron` first — reuses the compiled map-source reader rather than a
 * second copy of the map format in JavaScript (same convention as build-travel-graph.mjs).
 *
 * ## Publishing (`npm run web:snapshot:publish`)
 *
 * `public/data/` is gitignored — a personal, per-install artifact, same as `/data/`'s travel
 * graphs — so a hosted deployment built from git history alone has never had any of this. Until
 * there's a real plan for the map data specifically (your own install's files plus a third-party
 * pack, ~215 MB and growing every refresh — too large to comfortably commit, and not obviously
 * ours to redistribute), the wiki/Lucy/travel thirds of the snapshot are committed instead: small
 * (~38 MB), genuinely ours (a mirror of public wiki pages), and enough for search/items/spells/
 * quests/peers to work on the hosted site. `--no-maps` is what makes that honest — it skips the
 * `maps` section **entirely** (not merely the files) so `manifest.json` never claims a map source
 * exists that the deployment doesn't actually carry; without it, the Map tab would show a picker
 * offering sources with zero zones in them, which is a worse failure than not offering the tab at
 * all (`hasSection("maps")` in `src/lib/web/snapshot.ts` is what reads this claim).
 *
 * Refreshing what's hosted is: `npm run web:snapshot:publish`, then commit `public/data/wiki-cache`,
 * `public/data/lucy-cache`, `public/data/travel`, and `public/data/manifest.json` — never
 * `public/data/maps`, which stays gitignored and local-only.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, appDataDirs, dirOpt, flag, helpIfAsked, load, opt } from "./lib/cli.mjs";

helpIfAsked(import.meta.url);

const { buildWebSnapshot } = load("electron/web-snapshot.js");
const { openAppDatabase } = load("electron/sqlite-store.js");
const { WIKI_PAGE_MIGRATIONS } = load("electron/wiki/page-store.js");

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

const dataDir = userDataDir();
// A throwaway connection to the shared database, just for this one export — the CLI script is a
// one-shot process with nothing else holding it open, unlike the app itself (`web-snapshot-job.ts`
// passes its own already-open handle instead).
const db = dataDir ? openAppDatabase(dataDir, WIKI_PAGE_MIGRATIONS) : null;

buildWebSnapshot({
  userDataDir: dataDir,
  db,
  outDir,
  logDir: flag("no-maps") ? undefined : logDir(),
  noMaps: flag("no-maps"),
  onProgress: (line) => console.log(line),
});

console.log(`\nwrote ${path.relative(ROOT, path.join(outDir, "manifest.json"))}`);
