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
import waitOn from "wait-on";
import electronPath from "electron";

const URL = "http://localhost:3000";
const TSC = ["node_modules/typescript/bin/tsc", "-p", "tsconfig.electron.json"];
const OUT_DIR = "dist-electron";

// 1. Initial compile — fail fast if the Electron code doesn't build.
console.log("[dev-electron] compiling electron main/preload…");
if (spawnSync(process.execPath, TSC, { stdio: "inherit" }).status !== 0) process.exit(1);

// 2. Recompile on change (a broken edit just won't emit, so we won't restart into it).
const tscWatch = spawn(process.execPath, [...TSC, "--watch", "--preserveWatchOutput"], { stdio: "inherit" });

// 3. Wait for the renderer dev server.
console.log(`[dev-electron] waiting for ${URL} …`);
await waitOn({ resources: [URL.replace("http", "http-get")], timeout: 120_000 });

let child = null;
let restarting = false;
let quitting = false;

function launch() {
  child = spawn(electronPath, ["."], { stdio: "inherit", env: process.env });
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
  if (Date.now() - startedAt < 4000) return;
  clearTimeout(debounce);
  debounce = setTimeout(restart, 300);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    quitting = true;
    cleanup();
    child?.kill();
    process.exit(0);
  });
}
