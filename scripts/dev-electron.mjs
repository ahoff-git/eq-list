/**
 * dev-electron.mjs — dev launcher for the Electron side.
 *
 * Run alongside `next dev` (see the `dev` npm script). It:
 *   1. compiles the Electron main/preload TypeScript,
 *   2. keeps recompiling it in the background (tsc --watch),
 *   3. waits for the Next dev server, then starts Electron pointed at it, and
 *   4. restarts Electron whenever the compiled main/preload changes.
 *
 * Step 4 matters: preload and main-process code only load when Electron starts,
 * so Next's hot reload alone leaves a stale IPC bridge (e.g. "wiki.searchZones is
 * not a function" after adding a method). Recompile + auto-restart avoids that.
 * Renderer-only edits don't touch dist-electron, so they never trigger a restart.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import electronPath from "electron";
import { electronEnv } from "./lib/cli.mjs";

/**
 * Where to start looking for the renderer, and how many ports to try.
 *
 * `next dev` does not insist on a port: if 3000 is taken it prints a warning and quietly moves up to
 * the next free one. This script used to wait on 3000 flat, so that warning became a two-minute
 * silence followed by nothing — Electron was never launched, and the only clue was a line in Next's
 * own output. "Something on 3000" would not have been enough either: a **stale `next dev` from an
 * earlier session** holding the port still answers requests (with 404s), and pointing a transparent
 * window at a server that isn't ours is another invisible window. So the test is that the port serves
 * *this* renderer, and the port that passes it is the one Electron is told about.
 */
const DEV_PORT = Number(process.env.EQL_DEV_PORT) || 3000;
const PORT_SWEEP = 10;

/** How long to keep sweeping — `next dev` needs a moment to boot and compile the first page. */
const RENDERER_DEADLINE_MS = 120_000;
/** Between sweeps, and per request, so one wedged server can't stall the sweep. */
const SWEEP_PAUSE_MS = 500;
const PROBE_TIMEOUT_MS = 2_000;

/**
 * What proves a port is serving **our** renderer rather than merely serving. The title comes from
 * `src/app/layout.tsx`'s metadata — a stranger's server, or a stale instance of ours that has stopped
 * compiling, doesn't produce it. Cosmetic coupling, deliberately: the alternative is a check that
 * passes for any Next dev server, which is the mistake being fixed.
 */
const RENDERER_MARK = "<title>EQ List</title>";

const TSC = ["node_modules/typescript/bin/tsc", "-p", "tsconfig.electron.json"];
const OUT_DIR = "dist-electron";

/**
 * How long after launch to ignore compiled-output changes. `tsc --watch` re-emits everything on its
 * first pass, which would otherwise restart Electron the moment it finished starting.
 */
const STARTUP_QUIET_MS = 4_000;

/** How long to wait for a burst of re-emitted files to finish before restarting. */
const RESTART_DEBOUNCE_MS = 300;

// 1. Initial compile — fail fast if the Electron code doesn't build.
console.log("[dev-electron] compiling electron main/preload…");
if (spawnSync(process.execPath, TSC, { stdio: "inherit" }).status !== 0) process.exit(1);

// 2. Recompile on change (a broken edit just won't emit, so we won't restart into it).
const tscWatch = spawn(process.execPath, [...TSC, "--watch", "--preserveWatchOutput"], { stdio: "inherit" });

/** Ask one port what it is: ours, something else's, or nothing at all. */
async function probe(port) {
  try {
    const res = await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) return { port, ok: false, why: `answered ${res.status} ${res.statusText}` };
    const body = await res.text();
    if (body.includes(RENDERER_MARK)) return { port, ok: true };
    return { port, ok: false, why: "answered 200, but it isn't this app's renderer" };
  } catch (e) {
    return { port, ok: false, why: e.name === "TimeoutError" ? "did not answer in time" : "nothing listening" };
  }
}

/** Sweep the range until one port serves the renderer, or the deadline passes. */
async function findRenderer() {
  const ports = Array.from({ length: PORT_SWEEP }, (_, i) => DEV_PORT + i);
  const deadline = Date.now() + RENDERER_DEADLINE_MS;
  let tried = [];
  while (Date.now() < deadline) {
    tried = [];
    for (const port of ports) {
      const result = await probe(port);
      tried.push(result);
      if (result.ok) return { port, tried };
    }
    await new Promise((resolve) => setTimeout(resolve, SWEEP_PAUSE_MS));
  }
  return { port: null, tried };
}

// 3. Find the renderer dev server — wherever `next dev` actually ended up.
console.log(`[dev-electron] looking for the renderer on ${DEV_PORT}-${DEV_PORT + PORT_SWEEP - 1} …`);
const { port: devPort, tried } = await findRenderer();
if (!devPort) {
  console.error("[dev-electron] no renderer found — is `next dev` running? What each port said:");
  for (const r of tried) console.error(`  ${r.port}: ${r.why}`);
  cleanup();
  process.exit(1);
}
const DEV_URL = `http://localhost:${devPort}`;
if (devPort !== DEV_PORT) {
  const held = tried.find((r) => r.port === DEV_PORT)?.why ?? "unavailable";
  console.warn(`[dev-electron] ${DEV_PORT} is held by something else (${held}), so the renderer moved up.`);
  console.warn("[dev-electron] a stale `next dev` from an earlier session does this — worth killing it.");
}
console.log(`[dev-electron] renderer at ${DEV_URL}`);

let child = null;
let restarting = false;
let quitting = false;

function launch() {
  // The URL goes to Electron rather than being assumed by it: `windows.ts` cannot know which port
  // `next dev` won, and the two halves guessing separately is how a dev run ends up loading nothing.
  child = spawn(electronPath, ["."], { stdio: "inherit", env: { ...electronEnv(), EQL_DEV_URL: DEV_URL } });
  child.on("close", (code) => {
    if (restarting) {
      restarting = false;
      launch();
    } else if (!quitting) {
      cleanup();
      process.exit(code ?? 0);
    }
  });
}

function restart() {
  if (!child || restarting) return;
  console.log("[dev-electron] electron code changed — restarting app");
  restarting = true;
  child.kill();
}

function cleanup() {
  try {
    tscWatch.kill();
  } catch {
    /* already gone */
  }
}

console.log("[dev-electron] launching electron");
launch();

// 4. Restart Electron when compiled main/preload changes. Ignore the brief startup
//    window so the tsc --watch initial re-emit doesn't cause a spurious restart.
const startedAt = Date.now();
let debounce = null;
fs.watch(OUT_DIR, { recursive: true }, (_evt, file) => {
  if (!file || !String(file).endsWith(".js")) return;
  if (Date.now() - startedAt < STARTUP_QUIET_MS) return;
  clearTimeout(debounce);
  debounce = setTimeout(restart, RESTART_DEBOUNCE_MS);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    quitting = true;
    cleanup();
    child?.kill();
    process.exit(0);
  });
}
