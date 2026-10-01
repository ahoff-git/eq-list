/**
 * version.ts — build numbers, and ordering them.
 *
 * Every CI build stamps its run number into the patch position of the package version
 * (`0.1.0` → `0.1.42`, see `.github/workflows/build-windows.yml`), so a build has an identity
 * that can be *ordered* rather than only compared for equality — `scripts/stamp-version.mjs` is
 * the writer; electron-updater (`electron/auto-update.ts`, ADR 0279) is what reads it back.
 *
 * Anything we can't read as a dotted number is not a version we can order, so it's `null`.
 */

/** `0.1.42` → `[0, 1, 42]`. Tolerates a leading `v` and a `-suffix`; null if it isn't a version. */
export function parseVersion(text: string): number[] | null {
  const core = text.trim().replace(/^v/i, "").split(/[-+]/)[0];
  if (!/^\d+(\.\d+)*$/.test(core)) return null;
  return core.split(".").map(Number);
}

/** Order two versions: negative if `a` is older, 0 if equal, positive if `a` is newer. */
export function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Put `build` in the patch position, keeping the major/minor the release line declares:
 * `withBuildNumber("0.1.0", 42)` → `"0.1.42"`. Hand-bumping the minor in `package.json` therefore
 * still outranks every build of the previous line, so the sequence never goes backwards.
 */
export function withBuildNumber(version: string, build: number): string {
  const parts = parseVersion(version);
  if (!parts || !Number.isInteger(build) || build < 0) {
    throw new Error(`cannot stamp build ${build} into version "${version}"`);
  }
  const [major = 0, minor = 0] = parts;
  return `${major}.${minor}.${build}`;
}
