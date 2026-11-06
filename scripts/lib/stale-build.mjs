/**
 * stale-build.mjs — is a build output older than the source it was built from?
 *
 * `npm run app` used to rebuild only a *missing* build, so after a `git pull` an old renderer paired
 * with a new main process (or the reverse) and a feature that had changed on both sides looked
 * broken rather than stale. Comparing modification times is the cheapest honest answer: a build
 * is stale when any of its inputs was written after its output was.
 *
 * Nothing here knows what the app is — it takes paths, so each half of the build can say what it is
 * made from.
 */
import fs from "node:fs";
import path from "node:path";

/** Folders that hold other people's code or earlier builds, never inputs of this one. */
const SKIPPED = new Set(["node_modules", ".next", "out", "dist-electron", ".git"]);

/** The most recently written file under `target` (a file or a folder), or undefined if there is none. */
export function newestFile(target) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return undefined; // an input that doesn't exist can't be newer than anything
  }
  if (!stat.isDirectory()) return { file: target, mtimeMs: stat.mtimeMs };

  let newest;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIPPED.has(entry.name)) continue;
    const found = newestFile(path.join(target, entry.name));
    if (found && (!newest || found.mtimeMs > newest.mtimeMs)) newest = found;
  }
  return newest;
}

/**
 * Why `output` needs rebuilding from `sources`, or undefined when it is up to date. Every path is
 * relative to `root`. The reason is a sentence, because it is printed to someone waiting on a build.
 */
export function whyStale(root, output, sources) {
  let built;
  try {
    built = fs.statSync(path.join(root, output)).mtimeMs;
  } catch {
    return "it hasn't been built yet";
  }
  const changed = sources
    .map((source) => newestFile(path.join(root, source)))
    .filter(Boolean)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
  return changed && changed.mtimeMs > built ? `${path.relative(root, changed.file)} changed after it was built` : undefined;
}
