/**
 * app-rev.mjs — building an *older* revision of the main process to run the suite against.
 *
 * The way to show a probe can catch a bug that has since been fixed is to run it against the build from
 * before the fix. The working tree is shared and must not be touched, so this reads the revision out of
 * git (`git archive`, which never changes the checkout), compiles it in a scratch folder with the repo's
 * own TypeScript, and lets the suite launch *that* app (`--app-rev <rev>`). `node_modules` is shared
 * through a junction, so the same native modules (and the same lock) apply.
 *
 * Only the main process and preload come from the old revision; the windows are still served by the
 * current dev server, which is fine for probes that talk to `window.eql`.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { ROOT } from "../../lib/cli.mjs";
import { log } from "./log.mjs";

/** What compiling the main process needs from a revision. */
const PATHS = ["electron", "src/shared", "tsconfig.electron.json", "package.json"];

function run(command, args, options) {
  const result = spawnSync(command, args, { windowsHide: true, maxBuffer: 1024 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.slice(0, 3).join(" ")} failed (${result.status}): ${String(result.stderr ?? "").slice(0, 400)}`);
  return result;
}

/**
 * Let go of a built revision's link to the shared `node_modules` *before* anything deletes the folder
 * around it. Deleting a directory tree that contains a junction must never be left to decide whether to
 * follow it: the target is the repo's real dependencies.
 */
export function releaseRevision(dest) {
  const link = path.join(dest, "node_modules");
  try {
    if (fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link);
  } catch {
    /* never built, or already released */
  }
}

/** Build `rev`'s main process into `dest` and return `dest`, ready to be the Electron app folder. */
export function buildRevision({ rev, dest }) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  log.debug("archiving", rev, "into", dest);
  // Through a file rather than a pipe (bsdtar on Windows is picky about stdin), named relative to `dest`:
  // a GNU tar on the PATH reads `C:\...` as a host called "C".
  run("git", ["archive", "--format=tar", `--output=${path.join(dest, "revision.tar")}`, rev, "--", ...PATHS], { cwd: ROOT });
  run("tar", ["-xf", "revision.tar"], { cwd: dest });
  fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(dest, "node_modules"), "junction");

  // The tests are the bulk of what tsc would compile, and the app does not need them.
  const config = JSON.parse(fs.readFileSync(path.join(dest, "tsconfig.electron.json"), "utf8"));
  fs.writeFileSync(path.join(dest, "tsconfig.smoke.json"), JSON.stringify({ ...config, exclude: [...(config.exclude ?? []), "electron/tests"] }));
  run(process.execPath, [path.join(ROOT, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.smoke.json"], { cwd: dest });
  return dest;
}
