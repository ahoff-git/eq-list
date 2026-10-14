/**
 * `missing-pages.ts` — the day-long memory of titles eqlwiki says it doesn't have.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMissingPages, MISSING_RECHECK_MS } from "../wiki/missing-pages";

const HOUR = 60 * 60 * 1000;

/** A fresh file and a clock the test moves by hand. */
function setup() {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "missing-pages-")), "missing-pages.json");
  const clock = { t: 1_000_000 };
  const make = () => createMissingPages(file, { now: () => clock.t });
  return { file, clock, make };
}

test("a title the wiki says is missing is taken at its word for the day, then asked again", () => {
  const { clock, make } = setup();
  const missing = make();
  assert.equal(missing.isMissing("Rod (Ena)"), false);
  missing.markMissing("Rod (Ena)");
  assert.equal(missing.isMissing("Rod (Ena)"), true);
  clock.t += 23 * HOUR;
  assert.equal(missing.isMissing("Rod (Ena)"), true);
  clock.t += 2 * HOUR;
  assert.equal(missing.isMissing("Rod (Ena)"), false, "a day on, the wiki is asked again");
});

test("titles are matched the way the wiki matches them, ignoring case", () => {
  const { make } = setup();
  const missing = make();
  missing.markMissing("Rod (Ena)");
  assert.equal(missing.isMissing("rod (ena)"), true);
  assert.equal(missing.isMissing("Rod (Azia)"), false);
});

test("a page that turns up clears its 'missing' at once", () => {
  const { make } = setup();
  const missing = make();
  missing.markMissing("Rod (Ena)");
  missing.markFound("Rod (Ena)");
  assert.equal(missing.isMissing("Rod (Ena)"), false);
});

test("the memory survives a restart, and an expired answer isn't written back", () => {
  const { file, clock, make } = setup();
  make().markMissing("Old Title");
  clock.t += MISSING_RECHECK_MS + 1;
  make().markMissing("Rod (Ena)");
  const reopened = make();
  assert.equal(reopened.isMissing("Rod (Ena)"), true);
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(file, "utf8"))), ["rod (ena)"]);
});

test("a missing or unreadable file is an empty memory, not an error", () => {
  const { file, make } = setup();
  assert.equal(make().isMissing("Anything"), false);
  fs.writeFileSync(file, "{ not json");
  assert.equal(make().isMissing("Anything"), false);
});
