/**
 * launch.mjs — one reliable way to start the built app (`npm run app`).
 *
 * Builds whichever half of the app is missing or older than its source, then launches Electron.
 * Unlike `npm run dev` there's no dev server to wait on, and unlike `npm start` it skips a rebuild
 * when the build is current. The root EQ-List.cmd just calls this so the app can be double-click
 * launched.
 *
 * **Each half is judged on its own inputs**, because the app is two builds that have to agree: the
 * renderer (`out/`, from `src/` by Next) and the main process (`dist-electron/`, from `electron/` and
 * `src/shared/` by tsc). Checking only that they *exist* paired an old renderer with a new main
 * process after a pull, which looks exactly like a broken feature.
 */
import { spawn, spawnSync } from "node:child_process";
import electronPath from "electron";
import { ROOT, electronEnv } from "./lib/cli.mjs";
import { whyStale } from "./lib/stale-build.mjs";

/**
 * The two builds, in the order they are made. `public/` is left out of the renderer's inputs on
 * purpose: the running app writes its data snapshot there, so counting it would call the build stale
 * after every launch.
 */
const BUILDS = [
  {
    name: "renderer",
    output: "out/index.html",
    sources: ["src", "next.config.ts", "tsconfig.json", "package.json"],
    command: ["node_modules/next/dist/bin/next", "build"],
  },
  {
    name: "main process",
    output: "dist-electron/electron/main.js",
    sources: ["electron", "src/shared", "tsconfig.electron.json"],
    command: ["node_modules/typescript/bin/tsc", "-p", "tsconfig.electron.json"],
  },
];

function run(args) {
  const r = spawnSync(process.execPath, args, { stdio: "inherit", cwd: ROOT });
  return r.status ?? 1;
}

for (const { name, output, sources, command } of BUILDS) {
  const why = whyStale(ROOT, output, sources);
  if (!why) continue;
  console.log(`[launch] rebuilding the ${name} — ${why}…`);
  if (run(command) !== 0) process.exit(1);
}

console.log("[launch] starting EQ List…");
const child = spawn(electronPath, ["."], { stdio: "inherit", env: electronEnv(), cwd: ROOT });
child.on("close", (code) => process.exit(code ?? 0));
