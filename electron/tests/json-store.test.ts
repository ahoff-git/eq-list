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
import { createSaver, readJson, writeJson } from "../json-store";

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

/**
 * The debounced writer six stores share. What's pinned is the **cancellation**, since that's where the
 * six copies could have drifted: a `timer` never nulled stops a store saving for the rest of the
 * session, and a `flush` that doesn't cancel lets a write land after the app has quit.
 */
test("a burst of changes is one write, and the newest state is what lands", async () => {
  const file = path.join(tempDir(), "burst.json");
  let state = 0;
  const saver = createSaver(file, "burst", () => ({ state }), 10);

  for (state = 1; state <= 5; state++) saver.save();
  assert.equal(readJson(file, null), null, "nothing written yet — that's the coalescing");

  await new Promise((r) => setTimeout(r, 40));
  // `snapshot` runs at write time, so the write carries the last value rather than the first.
  assert.deepEqual(readJson(file, null), { state: 6 });
});

test("saving again after a write still writes — the timer is released", async () => {
  // The failure this guards: forget `timer = null` and the first burst is the only one ever saved.
  const file = path.join(tempDir(), "again.json");
  let state = "first";
  const saver = createSaver(file, "again", () => ({ state }), 10);

  saver.save();
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(readJson(file, null), { state: "first" });

  state = "second";
  saver.save();
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(readJson(file, null), { state: "second" });
});

test("flush writes now, and cancels the write that was pending", async () => {
  const file = path.join(tempDir(), "flush.json");
  let state = "pending";
  const saver = createSaver(file, "flush", () => ({ state }), 10_000); // far longer than this test
  saver.save();
  saver.flush();
  assert.deepEqual(readJson(file, null), { state: "pending" }, "on disk immediately");

  // Nothing may land afterwards: on quit the app is gone, and a later write would be on stale state.
  state = "after quit";
  await new Promise((r) => setTimeout(r, 40));
  assert.deepEqual(readJson(file, null), { state: "pending" });
});

test("flush with nothing pending still writes", () => {
  // The clear/forget paths call it that way: "this is now on disk" has to be true without a prior save.
  const file = path.join(tempDir(), "cleared.json");
  createSaver(file, "cleared", () => ({ kills: [] }), 10).flush();
  assert.deepEqual(readJson(file, null), { kills: [] });
});

test("`restart` waits for the changes to stop; the default doesn't", async () => {
  // The two readings of "debounce", and the reason both exist. A window being dragged wants the last
  // frame only (restart); a log being eaten wants a write every so often no matter how long the stream
  // runs, or a busy camp would postpone it for ever.
  const dir = tempDir();
  let n = 0;
  const dragged = createSaver(path.join(dir, "dragged.json"), "dragged", () => ({ n }), 30, { restart: true });
  const eaten = createSaver(path.join(dir, "eaten.json"), "eaten", () => ({ n }), 30);

  // Changes every 10ms for ~60ms: longer than the interval, with no gap in it.
  for (let i = 0; i < 6; i++) {
    n = i;
    dragged.save();
    eaten.save();
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.deepEqual(readJson(path.join(dir, "dragged.json"), null), null, "still being dragged — nothing yet");
  assert.notEqual(readJson(path.join(dir, "eaten.json"), null), null, "the stream got its write anyway");

  await new Promise((r) => setTimeout(r, 60)); // let go
  assert.deepEqual(readJson(path.join(dir, "dragged.json"), null), { n: 5 }, "where it landed");
});
