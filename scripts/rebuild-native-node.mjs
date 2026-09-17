/**
 * rebuild-native-node.mjs — fetch better-sqlite3's prebuilt binary for the *plain Node* runtime
 * currently running this script, the mirror image of `rebuild-native-electron.mjs`.
 *
 * `pretest` used to run `npm rebuild better-sqlite3` for this — npm's own rebuild lifecycle, which
 * runs the package's install script (`prebuild-install || node-gyp rebuild --release`). That fallback
 * is the fragile half: `node-gyp rebuild` recompiles from source, needs a working Python/MSVC
 * toolchain, and its own `clean` step deletes the existing binary first — which throws outright if
 * anything else on the machine still has it open (hit locally: a running Electron instance holding
 * `better_sqlite3.node`, `EPERM`/`EBUSY` on unlink). None of that is needed when a prebuilt binary
 * already exists for this exact runtime/arch/platform, which it does for every Node LTS this repo
 * targets — calling `prebuild-install` directly, the same way `rebuild-native-electron.mjs` already
 * does for Electron's ABI, fetches it without ever touching `node-gyp`.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createRequire } from "node:module";
import { ROOT } from "./lib/cli.mjs";

const require = createRequire(import.meta.url);

const bin = require.resolve("prebuild-install/bin.js");
const result = spawnSync(
  process.execPath,
  [bin, "--runtime=node", `--target=${process.versions.node}`, `--arch=${process.arch}`, `--platform=${process.platform}`],
  { cwd: path.join(ROOT, "node_modules", "better-sqlite3"), stdio: "inherit" },
);

if (result.error || result.status !== 0) {
  console.error(`[rebuild-native-node] failed to fetch better-sqlite3's Node ${process.versions.node} prebuild.`);
  if (result.error) console.error(result.error);
  process.exit(result.status ?? 1);
}
console.log(`[rebuild-native-node] better-sqlite3 ready for Node ${process.versions.node} (${process.platform}-${process.arch}).`);
