/**
 * rebuild-native-electron.mjs — fetch better-sqlite3's prebuilt binary for the *installed* Electron's
 * own ABI, rather than the plain-Node one `npm install`/`npm rebuild` leaves in place.
 *
 * better-sqlite3 ships one native binary at a time, built against one runtime's ABI — Node's or
 * Electron's, never both at once in the same `node_modules` — and this repo runs its compiled test
 * suite through plain `node` while the app itself runs inside Electron's own bundled (older,
 * differently-ABI'd) Node. Loading the wrong one for the process that's about to use it doesn't fail
 * cleanly; it crashes the process (see ADR 0231). `predev`/`prestart`/`predist` run this before
 * Electron ever launches; `rebuild:node` (via `pretest`) is the mirror image for the test runner.
 * `prebuild-install`'s own cache makes repeat runs cheap once each ABI has been fetched once.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib/cli.mjs";

const require = createRequire(import.meta.url);
const electronVersion = require("electron/package.json").version;

// `node <bin.js>` rather than the `.bin/prebuild-install` shim: on Windows that shim is a `.cmd` batch
// file, which `spawnSync` can only launch through a shell — invoking its real JS entry point with the
// current `node` directly needs no shell, so there's nothing to escape and no platform branch.
const bin = require.resolve("prebuild-install/bin.js");
const result = spawnSync(
  process.execPath,
  [bin, "--runtime=electron", `--target=${electronVersion}`, `--arch=${process.arch}`, `--platform=${process.platform}`],
  { cwd: path.join(ROOT, "node_modules", "better-sqlite3"), stdio: "inherit" },
);

if (result.error || result.status !== 0) {
  console.error(`[rebuild-native-electron] failed to fetch better-sqlite3's Electron ${electronVersion} prebuild.`);
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}
console.log(`[rebuild-native-electron] better-sqlite3 ready for Electron ${electronVersion} (${process.platform}-${process.arch}).`);
