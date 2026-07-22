/**
 * launch.mjs — one reliable way to start the built app (`npm run app`).
 *
 * Builds the renderer + Electron code on first run (or if the build is missing),
 * then launches Electron. Unlike `npm run dev` there's no dev server to wait on,
 * and unlike `npm start` it skips rebuilding when a build already exists. The
 * root EQ-List.cmd just calls this so the app can be double-click launched.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import electronPath from "electron";

function run(args) {
  const r = spawnSync(process.execPath, args, { stdio: "inherit" });
  return r.status ?? 1;
}

const built = fs.existsSync("dist-electron/electron/main.js") && fs.existsSync("out/index.html");
if (!built) {
  console.log("[launch] first run — building the app…");
  if (run(["node_modules/next/dist/bin/next", "build"]) !== 0) process.exit(1);
  if (run(["node_modules/typescript/bin/tsc", "-p", "tsconfig.electron.json"]) !== 0) process.exit(1);
}

console.log("[launch] starting EQ List…");
const child = spawn(electronPath, ["."], { stdio: "inherit", env: process.env });
child.on("close", (code) => process.exit(code ?? 0));
