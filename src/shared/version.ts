/**
 * version.ts — build numbers, and what "newer" means.
 *
 * Every CI build stamps its run number into the patch position of the package version
 * (`0.1.0` → `0.1.42`, see `.github/workflows/build-windows.yml`), so a build has an identity
 * that can be *ordered* rather than only compared for equality. The update check asks the one
 * question this file answers: is the published version **greater** than the one running?
 *
 * Anything we can't read as a dotted number is not a version we can order, so it's `null` — and
 * every caller treats "can't tell" as "nothing to report" rather than nagging on a bad parse.
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

/** Is `candidate` a version strictly newer than `current`? Unreadable either side → false. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  return compareVersions(a, b) > 0;
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

/**
 * Read the version a release announces. CI writes a `version: x.y.z` line into the release body
 * (the tag is the rolling `latest`, so it can't carry one); the name is a fallback for a release
 * published before that line existed or edited by hand.
 */
export function versionFromRelease(release: { body?: string; name?: string }): string | null {
  const tagged = release.body?.match(/^\s*version:\s*(\S+)/im)?.[1];
  const named = release.name?.match(/\d+(\.\d+)+/)?.[0];
  for (const candidate of [tagged, named]) {
    if (candidate && parseVersion(candidate)) return parseVersion(candidate)!.join(".");
  }
  return null;
}
