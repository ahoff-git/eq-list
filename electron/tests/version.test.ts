/**
 * Black-box tests for build versions: reading one, ordering two, and stamping a build number in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVersion, compareVersions, withBuildNumber } from "../../src/shared/version";

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
