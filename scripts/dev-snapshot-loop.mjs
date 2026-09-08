/**
 * dev-snapshot-loop.mjs — refreshes the local web snapshot (`public/data/`) on a timer while
 * `npm run dev` is running, so browser-mode testing (`src/lib/web-api.ts`) always has reasonably
 * fresh wiki/Lucy/travel/map data without a developer remembering to run `npm run web:snapshot` by
 * hand after every session of playing.
 *
 * Dev-only. The **hosted** snapshot is a separate, deliberate act —
 * `npm run web:snapshot:publish` followed by committing `public/data/{wiki-cache,lucy-cache,
 * travel,manifest.json}` by hand (see `build-web-snapshot.mjs`'s own doc comment) — and this script
 * never touches git or runs with `--no-maps`, so it can't be mistaken for that.
 *
 * Calls `build-web-snapshot.mjs` directly rather than through `npm run web:snapshot`, which also
 * runs `npm run build:electron` first: `dev-electron.mjs` already keeps `dist-electron` current with
 * its own `tsc --watch`, so a second compiler writing the same output on a timer would be redundant
 * at best and a race at worst.
 *
 * Self-rescheduling rather than a plain `setInterval`: the next run is only ever queued from the
 * previous one's own completion (or from startup), so there is exactly one pending timer at any
 * moment and a slow refresh can never overlap the next one by construction — worth stating plainly,
 * since a silent overlap is exactly the kind of bug a `setInterval` invites once a run occasionally
 * takes longer than the interval. A failed run — most likely `dist-electron` not built yet in the
 * first few seconds of `dev` — retries **soon** rather than waiting a full interval to notice; a run
 * that succeeds falls back to the normal cadence.
 */
import { spawn } from "node:child_process";
import { ROOT } from "./lib/cli.mjs";

/** Never let a bad override turn this into a tight loop hammering disk/CPU. */
const MIN_INTERVAL_MIN = 1;
const DEFAULT_INTERVAL_MIN = 20;
const requested = Number(process.env.EQL_SNAPSHOT_INTERVAL_MIN);
const INTERVAL_MIN = Number.isFinite(requested) && requested >= MIN_INTERVAL_MIN ? requested : DEFAULT_INTERVAL_MIN;
const INTERVAL_MS = INTERVAL_MIN * 60_000;

/** Give `dev-electron`'s own initial compile a head start, rather than racing it on `dev`'s first tick. */
const FIRST_RUN_DELAY_MS = 15_000;
/** How soon to retry after a failed run — a `dist-electron` that isn't built yet is usually only
 *  seconds away, and waiting a full interval to find out would leave `public/data` stale far longer
 *  than the underlying problem actually lasted. */
const RETRY_DELAY_MS = 30_000;

let child = null;
let pending = null;
let shuttingDown = false;

function scheduleNext(delayMs) {
  clearTimeout(pending);
  pending = setTimeout(refresh, delayMs);
}

function refresh() {
  // Should be unreachable by construction (see the module doc), since the only thing that ever
  // schedules a run is the previous one finishing — kept as a safety net rather than the mechanism.
  if (child) {
    console.warn("[dev-snapshot] a refresh is still running — checking again shortly");
    scheduleNext(RETRY_DELAY_MS);
    return;
  }
  console.log("[dev-snapshot] refreshing public/data …");
  child = spawn(process.execPath, ["scripts/build-web-snapshot.mjs"], { cwd: ROOT, stdio: "inherit" });
  child.on("exit", (code, signal) => {
    child = null;
    if (shuttingDown) return; // we asked for this — nothing to report, nothing to reschedule
    if (signal) {
      console.warn(`[dev-snapshot] refresh was stopped (${signal}) — will try again in ${INTERVAL_MIN}m`);
      scheduleNext(INTERVAL_MS);
    } else if (code !== 0) {
      console.warn(`[dev-snapshot] refresh failed (exit ${code}) — retrying in ${Math.round(RETRY_DELAY_MS / 1000)}s`);
      scheduleNext(RETRY_DELAY_MS);
    } else {
      scheduleNext(INTERVAL_MS);
    }
  });
  child.on("error", (err) => {
    child = null;
    if (shuttingDown) return;
    console.warn("[dev-snapshot] could not start the refresh:", err.message);
    scheduleNext(RETRY_DELAY_MS);
  });
}

console.log(`[dev-snapshot] will refresh public/data every ${INTERVAL_MIN}m while dev is running`);
// Deliberately **not** `.unref()`'d: this script has nothing else keeping it alive (no server, no
// open handle) the way an Electron tracker's sweep does — an unref'd timer here is a timer that
// never fires at all, because Node sees an empty event loop and exits before either one is due.
scheduleNext(FIRST_RUN_DELAY_MS);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shuttingDown = true;
    clearTimeout(pending);
    // Send the signal on rather than leaving an in-flight copy (potentially ~215 MB of map files)
    // running as an orphan after `dev` itself has already reported stopped.
    child?.kill(signal);
    process.exit(0);
  });
}
