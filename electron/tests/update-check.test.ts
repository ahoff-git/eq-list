/**
 * Black-box tests for the update check: what makes a published build worth interrupting someone
 * over. The rule under test is "newer, and not already acknowledged" — a re-run, a rebuild of an
 * older commit, or the build you're already on must all stay quiet.
 *
 * GitHub is stubbed; the state file is real, so "acknowledged" is asserted across two instances —
 * the closest thing to quitting and reopening the app.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createUpdateChecker } from "../update-check";

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "eql-update-"));

/** A stub of the one GitHub call we make, answering with a release body shaped like CI's. */
function releasing(version: string | null, extra: Record<string, unknown> = {}): typeof fetch {
  const body = `Automated build of abc1234 (main).${version ? `\nversion: ${version}` : ""}`;
  return (async () =>
    ({
      ok: true,
      status: 200,
      json: async () => ({ html_url: "https://github.com/ahoff-git/eq-list/releases/tag/latest", body, ...extra }),
    })) as unknown as typeof fetch;
}

const failing = (status: number): typeof fetch =>
  (async () => ({ ok: false, status, json: async () => ({}) })) as unknown as typeof fetch;

const offline: typeof fetch = async () => {
  throw new Error("getaddrinfo ENOTFOUND");
};

async function inTemp(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = tempDir();
  try {
    await run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("a higher build number is an update", async () => {
  await inTemp(async (dir) => {
    const info = await createUpdateChecker(dir, "0.1.42", releasing("0.1.43")).check();
    assert.equal(info?.version, "0.1.43");
    assert.match(info!.url, /^https:\/\/github\.com\//);
  });
});

test("the build you're running is not an update", async () => {
  await inTemp(async (dir) => {
    assert.equal(await createUpdateChecker(dir, "0.1.42", releasing("0.1.42")).check(), null);
  });
});

test("an older published build never prompts", async () => {
  await inTemp(async (dir) => {
    // A re-run of an earlier commit, or a rollback: different from ours, but behind it.
    assert.equal(await createUpdateChecker(dir, "0.1.42", releasing("0.1.41")).check(), null);
  });
});

test("a release announcing no version is nothing to report", async () => {
  await inTemp(async (dir) => {
    assert.equal(await createUpdateChecker(dir, "0.1.42", releasing(null)).check(), null);
  });
});

test("acknowledging a build silences it, across a restart", async () => {
  await inTemp(async (dir) => {
    const first = createUpdateChecker(dir, "0.1.42", releasing("0.1.43"));
    assert.ok(await first.check());
    first.markSeen();

    const next = createUpdateChecker(dir, "0.1.42", releasing("0.1.43"));
    assert.equal(await next.check(), null);
  });
});

test("acknowledging one build does not silence the next", async () => {
  await inTemp(async (dir) => {
    const first = createUpdateChecker(dir, "0.1.42", releasing("0.1.43"));
    await first.check();
    first.markSeen();

    const info = await createUpdateChecker(dir, "0.1.42", releasing("0.1.44")).check();
    assert.equal(info?.version, "0.1.44");
  });
});

test("a failed or offline check is silent, not an error", async () => {
  await inTemp(async (dir) => {
    assert.equal(await createUpdateChecker(dir, "0.1.42", failing(403)).check(), null);
    assert.equal(await createUpdateChecker(dir, "0.1.42", offline).check(), null);
  });
});

test("latest() holds the found build until it's acknowledged", async () => {
  await inTemp(async (dir) => {
    const checker = createUpdateChecker(dir, "0.1.42", releasing("0.1.43"));
    assert.equal(checker.latest(), null); // nothing found yet
    await checker.check();
    assert.equal(checker.latest()?.version, "0.1.43"); // a tab mounting later still sees it
  });
});
