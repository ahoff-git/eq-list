/**
 * smoke.mjs — `npm run smoke`: run the real desktop app, in isolation, and see whether it holds up.
 *
 * Unit tests here are per-module black boxes and green; the bugs that actually turned up came from running
 * something real — sweeping every tab for console errors, quitting at once after a change, simulating a
 * Windows shutdown, feeding the app's own IPC garbage. This is those probes, repeatable.
 *
 * Usage:
 *   npm run smoke                              everything (about five minutes)
 *   npm run smoke -- --only sweep,ipc-fuzz     some checks: sweep, persistence, session-end, ipc-fuzz
 *   npm run smoke -- --verbose                 also print what each passing check looked at
 *   npm run smoke -- --no-live                 never copy the player's own database (a fixture profile only)
 *   npm run smoke -- --keep                    keep the scratch folder even when everything passed
 *   npm run smoke -- --inject-fault <names>    break one thing on purpose, to see its check go red (see below)
 *   npm run smoke -- --app-rev <git-rev>       launch the main process as it was at that revision
 *   npm run smoke -- --renderer-url <url>      use a dev server that is already running
 *
 * What it is: a second, isolated copy of the app on a scratch userData folder — it runs beside the
 * player's own "EQ List" and never touches that process, `%APPDATA%\eq-list`, the peer room, or the
 * network. If the player has a database, a *copy* of it seeds the run (read-only); with none (CI), a
 * fixture profile is fed through the character's log. Scratch lives under `EQL_SMOKE_DIR`, else the
 * system temp folder.
 *
 * Faults (--inject-fault a,b): console-error, exception, broken-text, no-pager, arrow-stuck, skip-flush,
 * hang-main. Each is applied from inside the suite, never by editing the app, and the check that owns it
 * must fail; a typo is an error. `--inject-fault` and `--app-rev` exist to show the suite *can* fail.
 *
 * Debug logging: `EQL_DEBUG=1 npm run smoke` (the repo's one switch, src/shared/logging.ts). It is passed
 * on to the app it launches, so the app's own debug output turns on too.
 *
 * Needs Windows for the process work, a built main process (made when stale), and the Electron build of
 * better-sqlite3 — `npm run smoke` runs `rebuild:electron` first, as `npm run dev` does.
 */
import { spawnSync } from "node:child_process";

import { ROOT, flag, helpIfAsked, opt } from "../lib/cli.mjs";
import { whyStale } from "../lib/stale-build.mjs";

helpIfAsked(import.meta.url);

/** The suite loads the compiled main process (the app's own navigation table, its logger, the app itself). */
function ensureMainBuilt() {
  const why = whyStale(ROOT, "dist-electron/electron/main.js", ["electron", "src/shared", "tsconfig.electron.json"]);
  if (!why) return;
  console.log(`[smoke] rebuilding the main process — ${why}…`);
  const built = spawnSync(process.execPath, ["node_modules/typescript/bin/tsc", "-p", "tsconfig.electron.json"], { cwd: ROOT, stdio: "inherit" });
  if (built.status !== 0) process.exit(1);
}

ensureMainBuilt();

// Imported only now: the modules below load compiled code from `dist-electron`, which has to exist first.
const { parseFaults, FAULTS } = await import("./lib/faults.mjs");
const { CHECKS, run } = await import("./run.mjs");

const text = (name) => (typeof opt(name) === "string" ? opt(name) : undefined);
const only = text("only")?.split(",").map((s) => s.trim()).filter(Boolean);
const known = CHECKS.map(([name]) => name);
if (only?.some((name) => !known.includes(name))) {
  console.error(`unknown check in --only: ${only.filter((n) => !known.includes(n)).join(", ")} — known: ${known.join(", ")}`);
  process.exit(2);
}

let faults;
try {
  faults = parseFaults(text("inject-fault"));
} catch (error) {
  console.error(`${error.message}\n\n${Object.entries(FAULTS).map(([name, what]) => `  ${name}: ${what}`).join("\n")}`);
  process.exit(2);
}

const code = await run({
  only,
  faults,
  appRev: text("app-rev"),
  rendererUrl: text("renderer-url"),
  noLive: flag("no-live"),
  keep: flag("keep"),
  verbose: flag("verbose"),
});
process.exit(code);
