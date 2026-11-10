/**
 * run.mjs — one smoke run: prepare, run the checks, clean up, report.
 *
 * Everything the checks share is built here and handed to them as `env`: the renderer's URL, the faults to
 * inject, the app folder to launch, and `env.profile()`, which builds a scratch userData and remembers it
 * so the cleanup at the end can prove nothing of this run is left running.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ROOT, appDataDirs } from "../lib/cli.mjs";
import { ipcFuzzCheck } from "./checks/ipc-fuzz.mjs";
import { persistenceCheck } from "./checks/persistence.mjs";
import { sessionEndCheck } from "./checks/session-end.mjs";
import { sweepChecks } from "./checks/sweep.mjs";
import { buildRevision, releaseRevision } from "./lib/app-rev.mjs";
import { killAll, leftoversOf } from "./lib/instance.mjs";
import { log } from "./lib/log.mjs";
import { buildProfile, findLiveDir } from "./lib/profile.mjs";
import { killTree } from "./lib/processes.mjs";
import { readProtocolCommand, restoreProtocolCommand } from "./lib/protocol-guard.mjs";
import { ensureRenderer } from "./lib/renderer.mjs";
import { exitCode, fail, formatDetails, formatTable, pass, runCheck } from "./lib/report.mjs";

/** In the order they run. The fuzz is last: it leaves junk in the stores it was aimed at. */
export const CHECKS = [
  ["sweep", sweepChecks],
  ["persistence", persistenceCheck],
  ["session-end", sessionEndCheck],
  ["ipc-fuzz", ipcFuzzCheck],
];

const SNAPSHOT_DIR = path.join(ROOT, "public", "data", "wiki-cache");
const MAPS_DIR = path.join(ROOT, "public", "data", "maps");

/** Where scratch profiles go: `EQL_SMOKE_DIR`, else a folder under the system's temp directory. */
const scratchBase = () => process.env.EQL_SMOKE_DIR ?? path.join(os.tmpdir(), "eq-list-smoke");

/** The "nothing of mine is left" row: every profile's processes gone, the dev server stopped if this run started it. */
function cleanupResult({ profiles, renderer, protocol }) {
  const stragglers = profiles.flatMap((p) => leftoversOf(p));
  for (const straggler of stragglers) killTree(straggler.pid);
  const evidence = [
    `${profiles.length} scratch profiles: ${profiles.map((p) => p.name).join(", ") || "none"}`,
    renderer ? (renderer.started ? "dev server: started by this run, stopped" : "dev server: already running, left alone") : "dev server: not used",
    `eqlist:// link handler: ${protocol === "unchanged" ? "unchanged" : `${protocol} (an unpackaged launch registers itself as the handler)`}`,
  ];
  return stragglers.length
    ? fail("cleanup", `${stragglers.length} electron process${stragglers.length === 1 ? "" : "es"} of this run were still alive and were ended`, [...evidence, ...stragglers.map((s) => `pid ${s.pid}`)])
    : pass("cleanup", "no process of this run is left", evidence);
}

/**
 * Run the selected checks. `options`:
 *   only      names of checks to run (default all)   faults   a Set from `parseFaults`
 *   appRev    a git revision to build and launch instead of the working tree
 *   noLive    never copy the player's own database    keep     keep the scratch folder
 *   rendererUrl  use this dev server instead of finding or starting one
 *   verbose   print what each passing check looked at
 */
export async function run(options) {
  const selected = CHECKS.filter(([name]) => !options.only || options.only.includes(name));
  const runDir = path.join(scratchBase(), new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(runDir, { recursive: true });

  const profiles = [];
  let renderer;
  let appDir;
  const results = [];
  const liveDir = options.noLive ? undefined : findLiveDir(appDataDirs());
  const protocolBefore = readProtocolCommand();

  const cleanUp = async () => {
    await killAll();
    await renderer?.stop();
  };
  const onInterrupt = () => cleanUp().finally(() => process.exit(130));
  process.once("SIGINT", onInterrupt);

  try {
    renderer = await ensureRenderer({ url: options.rendererUrl, logFile: path.join(runDir, "renderer.log") });
    appDir = options.appRev ? buildRevision({ rev: options.appRev, dest: path.join(runDir, `app-${options.appRev}`) }) : undefined;
    const env = {
      rendererUrl: renderer.url,
      faults: options.faults,
      appDir,
      profile(name, { withHistory }) {
        const profile = buildProfile({
          root: runDir,
          name,
          liveDir: withHistory ? liveDir : undefined,
          snapshotDir: withHistory ? SNAPSHOT_DIR : undefined,
          mapsDir: withHistory ? MAPS_DIR : undefined,
        });
        profiles.push(profile);
        return profile;
      },
    };
    log.debug("smoke run", { runDir, liveDir, appDir, checks: selected.map(([n]) => n) });

    for (const [name, check] of selected) {
      console.log(`\n▶ ${name}`);
      const rows = await runCheck(name, () => check(env));
      results.push(...rows);
      for (const row of rows) console.log(`  ${row.status.toUpperCase().padEnd(4)} ${row.name} — ${row.summary}`);
    }
  } catch (error) {
    results.push(...(await runCheck("setup", async () => Promise.reject(error))));
  } finally {
    process.off("SIGINT", onInterrupt);
    await cleanUp();
    results.push(cleanupResult({ profiles, renderer, protocol: restoreProtocolCommand(protocolBefore) }));
  }

  console.log(`\n${formatTable(results)}`);
  const details = formatDetails(results, { verbose: options.verbose });
  if (details) console.log(`\n${details}`);

  const code = exitCode(results);
  if (appDir) releaseRevision(appDir);
  if (code === 0 && !options.keep) fs.rmSync(runDir, { recursive: true, force: true });
  else console.log(`\nscratch kept for inspection: ${runDir}`);
  return code;
}
