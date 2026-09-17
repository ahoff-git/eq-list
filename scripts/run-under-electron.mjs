/**
 * run-under-electron.mjs — run a script through Electron's own bundled Node runtime, via Electron's
 * `ELECTRON_RUN_AS_NODE` compatibility mode, instead of plain `node`.
 *
 * `better-sqlite3` ships one native binary at a time, built for one runtime's ABI — Node's or
 * Electron's, never both (ADR 0232) — and `predev`/`prestart`/`predist` all leave the *Electron* one
 * in place. `build-web-snapshot.mjs` (ADR 0256) now opens `eqlist.db` to export the wiki cache, so
 * anything that runs it — `npm run web:snapshot(:publish)`, and `dev-snapshot-loop.mjs`'s periodic
 * refresh while `npm run dev` is running — needs to load that same Electron-ABI binary, not plain
 * Node's, or it dies with a NODE_MODULE_VERSION mismatch. Re-fetching the Node-ABI prebuild instead
 * (the way `pretest` does for the test runner) isn't an option for the `dev` case specifically: its
 * own Electron process is either already running that binary or about to reload it
 * (`dev-electron.mjs` restarts Electron on every recompile), and overwriting the file out from under
 * it is exactly the `EPERM`/`EBUSY` failure `rebuild-native-node.mjs` documents.
 *
 * Usage: node scripts/run-under-electron.mjs <script> [...args]
 */
import { spawnSync } from "node:child_process";
import electronPath from "electron";

const [script, ...rest] = process.argv.slice(2);
if (!script) {
  console.error("Usage: node scripts/run-under-electron.mjs <script> [...args]");
  process.exit(1);
}

const result = spawnSync(electronPath, [script, ...rest], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});

if (result.error) throw result.error;
process.exit(result.status ?? (result.signal ? 1 : 0));
