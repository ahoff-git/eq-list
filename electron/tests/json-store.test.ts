/**
 * The one reader and the one atomic writer every store on disk goes through.
 *
 * Ten modules each had their own, and only two wrote to a temp file and renamed. The other eight wrote
 * straight to the destination, so an interrupted write left a half-file, the next read threw, the
 * fallback took over, and the store came back **empty with nothing said** — the kill log, the loot
 * ledger, the fight history, the observations pooled from peers.
 *
 * Atomicity itself can't be tested by killing the process mid-write, so what's pinned here is the
 * property that produces it: the target is only ever replaced by a **rename**, so a write that fails
 * leaves what was already there completely intact. Touches a temp dir, because the whole subject is what
 * ends up on disk.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readJson, writeJson } from "../json-store";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-json-store-"));
}

test("what goes in comes back, and the folder is made on the way", () => {
  // Deliberately two levels deep and absent: a first run has no userData folder yet.
  const file = path.join(tempDir(), "nested", "deeper", "state.json");
  assert.equal(writeJson(file, { kills: [1, 2, 3] }), true);
  assert.deepEqual(readJson(file, null), { kills: [1, 2, 3] });
});

test("a successful write leaves no temp file behind", () => {
  // The temp file is the mechanism; finding one afterwards would mean the rename didn't happen.
  const dir = tempDir();
  const file = path.join(dir, "state.json");
  writeJson(file, { a: 1 });
  assert.deepEqual(fs.readdirSync(dir), ["state.json"]);
});

test("a write that can't finish leaves the previous file untouched", () => {
  // The bug, from the other side. A directory where the temp file needs to be makes the write fail
  // part-way; with a plain `writeFileSync` to the target, the old contents would already be gone.
  const dir = tempDir();
  const file = path.join(dir, "kills.json");
  writeJson(file, { kills: ["a hard-won record"] });
  fs.mkdirSync(`${file}.tmp`); // now the temp path can't be written

  assert.equal(writeJson(file, { kills: ["replacement"] }), false, "it should report the failure");
  assert.deepEqual(readJson(file, null), { kills: ["a hard-won record"] }, "and lose nothing");
});

test("a file that isn't there is the fallback, quietly — that's a first run", () => {
  const file = path.join(tempDir(), "never-written.json");
  assert.deepEqual(readJson(file, { fights: [] }), { fights: [] });
  assert.equal(readJson(file, null), null);
});

test("a corrupt file is the fallback too, which is what makes the atomic write matter", () => {
  // This is the failure the eight unsafe writers could produce, and it's why losing the *old* file is
  // so costly: there's nothing to fall back to but empty.
  const file = path.join(tempDir(), "half-written.json");
  fs.writeFileSync(file, '{ "kills": [ {"mob": "a gnoll pu', "utf8");
  assert.deepEqual(readJson(file, { kills: [] }), { kills: [] });
});

test("pretty is for the files a person opens; compact for the big ones", () => {
  const dir = tempDir();
  const plain = path.join(dir, "compact.json");
  const pretty = path.join(dir, "pretty.json");
  const data = { a: 1, b: [2, 3] };
  writeJson(plain, data);
  writeJson(pretty, data, { pretty: true });

  assert.ok(!fs.readFileSync(plain, "utf8").includes("\n"));
  assert.ok(fs.readFileSync(pretty, "utf8").includes("\n  "));
  // Same data either way — the indentation is the only difference.
  assert.deepEqual(readJson(plain, null), readJson(pretty, null));
});
