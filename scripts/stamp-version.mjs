/**
 * stamp-version.mjs — give this build its own number.
 *
 * The package version is hand-set per release *line* (`0.1.0`); CI stamps the workflow run number
 * into the patch position so every build is `0.1.<run>` — distinct, ordered, and never going
 * backwards (see ADR 0064). electron-builder reads the version from `package.json`, so this must
 * run before it: the installer's name and the app's `app.getVersion()` both come from here.
 *
 * Prints the stamped version on stdout so the workflow can put it in the release body — which is
 * where the update check reads it back from.
 *
 * Usage:
 *   node scripts/stamp-version.mjs <build-number>
 *
 * Needs `npm run build:electron` first — the version rules live in `src/shared/version.ts` rather
 * than in a second copy here.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withBuildNumber } from "../dist-electron/src/shared/version.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const build = Number(process.argv[2]);

if (!Number.isInteger(build) || build < 0) {
  console.error("usage: node scripts/stamp-version.mjs <build-number>");
  process.exit(1);
}

const file = path.join(ROOT, "package.json");
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
pkg.version = withBuildNumber(pkg.version, build);
// Trailing newline: package.json is edited by hand and by npm, both of which keep one.
fs.writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");

console.log(pkg.version);
