/**
 * cli.mjs — the plumbing every script in here needs, in one place.
 *
 * Three scripts had grown their own copy of the same six lines: parse `--name value`, test a bare
 * `--flag`, print the docblock for `--help`, and `require` a module out of `dist-electron`. Identical
 * behaviour, separately maintained — so a fix to the "did you run build:electron?" message reached one
 * script and not the others.
 *
 * Nothing here knows anything about EverQuest. It's argv and file paths.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

/** The repo root. Scripts resolve from here, never from the cwd — npm runs them from anywhere. */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const argv = process.argv.slice(2);

/**
 * `--name value` → `"value"`, a bare `--name` → `true`, absent → `fallback`.
 *
 * A bare flag reads as `true` so `--quiet` and `--out dir` can share one parser; callers that want a
 * string check with `typeof`.
 */
export function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = argv[i + 1];
  return value === undefined || value.startsWith("--") ? true : value;
}

export const flag = (name) => argv.includes(`--${name}`);

/**
 * A directory argument, resolved, or a default under the repo — the `--out`/`--to` shape.
 * `opt` yields `true` for a bare `--out`, which must not become the string "true".
 */
export function dirOpt(name, fallback) {
  const given = opt(name);
  return typeof given === "string" ? path.resolve(given) : path.join(ROOT, fallback);
}

/**
 * `--help` prints the calling script's own docblock, so usage can't drift from the file it documents.
 * Pass `import.meta.url`.
 */
export function helpIfAsked(url) {
  if (!flag("help")) return;
  console.log(fs.readFileSync(fileURLToPath(url), "utf8").split("*/")[0].replace(/^\/\*\*?/, ""));
  process.exit(0);
}

const require = createRequire(import.meta.url);

/**
 * A module from `dist-electron`, by its path within it (`"electron/eq-maps.js"`).
 *
 * Scripts use the app's **compiled** modules rather than a second copy of the logic in JavaScript —
 * that's the whole reason this exists. The cost is needing `npm run build:electron` first, so the
 * missing-file case says exactly that instead of throwing a module-resolution error at the reader.
 */
export function load(module) {
  const file = path.join(ROOT, "dist-electron", module);
  if (!fs.existsSync(file)) {
    console.error(`Missing ${path.relative(ROOT, file)} — run: npm run build:electron`);
    process.exit(1);
  }
  return require(file);
}

/**
 * The app's own data directories that exist, most likely first.
 *
 * Two names because the folder is the Electron product name, which shipped as `eq-list` before it
 * became `EQ List` — an install from either is still out there, and a script that reads only one finds
 * nothing on the other. Scripts can't ask Electron for `userData`; they aren't Electron.
 */
export function appDataDirs() {
  const appData = process.env.APPDATA;
  if (!appData) return [];
  return ["EQ List", "eq-list"].map((name) => path.join(appData, name)).filter((dir) => fs.existsSync(dir));
}

/**
 * A few of a list, then how many were left out.
 *
 * Every report in here truncates: a hundred unresolved destinations is a wall of text nobody reads,
 * but a silent `slice(0, 12)` reads as "that was all of them" — which for a report whose whole job is
 * saying where the graph is thin would be the one lie it must not tell. So the count comes with it,
 * and the cap is an argument rather than a number buried in a template.
 */
export function few(items, max) {
  const shown = items.slice(0, max).join(", ");
  return items.length > max ? `${shown} … +${items.length - max} more` : shown;
}

/**
 * The environment to launch Electron with.
 *
 * `ELECTRON_RUN_AS_NODE` has to go. Anything that sets it — a VS Code extension host, an editor task,
 * a debug session, a shell that once exported it — turns the very same binary into a bare Node
 * process, so the app dies on its first line of Electron API with
 * `Cannot read properties of undefined (reading 'registerSchemesAsPrivileged')` and no window ever
 * appears. It arrives silently through `process.env`, which is exactly how a launch that works in one
 * terminal fails in another; both launchers strip it here so neither can forget.
 */
export function electronEnv() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
