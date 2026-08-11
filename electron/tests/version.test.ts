/**
 * Black-box tests for build versions: reading one, ordering two, stamping a build number in,
 * and pulling the version back out of what CI publishes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseVersion,
  compareVersions,
  isNewerVersion,
  withBuildNumber,
  versionFromRelease,
} from "../../src/shared/version";

test("parseVersion reads a dotted number, with or without decoration", () => {
  assert.deepEqual(parseVersion("0.1.42"), [0, 1, 42]);
  assert.deepEqual(parseVersion("v0.1.42"), [0, 1, 42]);
  assert.deepEqual(parseVersion(" 1.2 "), [1, 2]);
  assert.deepEqual(parseVersion("0.1.42-beta.1"), [0, 1, 42]);
});

test("parseVersion rejects anything it can't order", () => {
  for (const bad of ["", "latest", "0.1.x", "build 42", "0..1"]) {
    assert.equal(parseVersion(bad), null, bad);
  }
});

test("compareVersions orders by each part, missing parts counting as zero", () => {
  assert.ok(compareVersions([0, 1, 43], [0, 1, 42]) > 0);
  assert.ok(compareVersions([0, 2, 0], [0, 1, 999]) > 0);
  assert.ok(compareVersions([0, 1, 42], [0, 1, 42]) === 0);
  assert.ok(compareVersions([0, 1], [0, 1, 0]) === 0);
  assert.ok(compareVersions([0, 1], [0, 1, 1]) < 0);
});

test("build numbers order numerically, not as text", () => {
  // The bug a string compare would hide: "0.1.9" > "0.1.10" alphabetically.
  assert.ok(isNewerVersion("0.1.10", "0.1.9"));
  assert.ok(!isNewerVersion("0.1.9", "0.1.10"));
});

test("only a strictly higher version is newer", () => {
  assert.ok(isNewerVersion("0.1.43", "0.1.42"));
  assert.ok(!isNewerVersion("0.1.42", "0.1.42")); // the same build is not an update
  assert.ok(!isNewerVersion("0.1.41", "0.1.42")); // a rebuild of something older never prompts
  assert.ok(isNewerVersion("0.2.0", "0.1.999")); // a new line outranks every build of the old one
});

test("an unreadable version on either side is never newer", () => {
  assert.ok(!isNewerVersion("latest", "0.1.42"));
  assert.ok(!isNewerVersion("0.1.42", ""));
});

test("withBuildNumber replaces the patch, keeping the release line", () => {
  assert.equal(withBuildNumber("0.1.0", 42), "0.1.42");
  assert.equal(withBuildNumber("0.1.7", 42), "0.1.42");
  assert.equal(withBuildNumber("1.2.3", 0), "1.2.0");
});

test("withBuildNumber refuses a nonsense build or version", () => {
  assert.throws(() => withBuildNumber("0.1.0", -1));
  assert.throws(() => withBuildNumber("0.1.0", 1.5));
  assert.throws(() => withBuildNumber("latest", 42));
});

test("versionFromRelease reads the machine-readable line CI writes", () => {
  const body = "Automated build of abc1234 (main).\nversion: 0.1.42\n";
  assert.equal(versionFromRelease({ body, name: "Latest build 0.1.42" }), "0.1.42");
});

test("versionFromRelease falls back to the release name", () => {
  assert.equal(versionFromRelease({ body: "Automated build of abc1234.", name: "Latest build 0.1.42" }), "0.1.42");
});

test("versionFromRelease is null when nothing announces a version", () => {
  // A release published before build numbers existed: nothing to compare, so nothing to report.
  assert.equal(versionFromRelease({ body: "Automated build of abc1234 (main).", name: "Latest build" }), null);
  assert.equal(versionFromRelease({}), null);
});
