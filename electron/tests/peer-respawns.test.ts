/**
 * What a stranger's learned respawn has to look like before it teaches this install anything about
 * a camp.
 *
 * `sanitizeRespawns` is the receiving half of a rule `readRespawn` (`peer-share.ts`) also applies —
 * deliberately not a duplicate, since we cannot see how the sender made theirs. The filing rules —
 * keyed by contributor, replaced per report, capped — are `contributions.ts` and are tested there.
 * This is only the shape check, on the same terms `peer-kills.test.ts` checks a shared kill's.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPeerRespawns, sanitizeRespawns } from "../peer-respawns";
import { contributorId } from "../../src/shared/contributors";

/** A well-formed shared respawn, which every case below spoils in exactly one way. */
const respawn = (over: Record<string, unknown> = {}) => ({
  key: "a named@Blackburrow",
  mob: "a named",
  place: "Blackburrow",
  shortestSeconds: 300,
  longestSeconds: 900,
  samples: 4,
  lastKillAt: "2026-01-01T00:00:00Z",
  ...over,
});

test("a well-formed respawn survives with nothing added and nothing carried over", () => {
  // The evidence and the settings — `gaps`, `crossedDifficulty`, `notify` — never travel and are
  // not copied, the same guarantee `sanitizeKills` gives a shared kill.
  const out = sanitizeRespawns([respawn({ gaps: [{ seconds: 300, at: "2026-01-01T00:00:00Z" }], crossedDifficulty: 2, notify: true })], false);
  assert.deepEqual(out, [respawn()]);
});

test("a respawn has to name a camp and a mob", () => {
  for (const spoiled of [{ key: "" }, { key: "   " }, { key: undefined }, { mob: "" }, { mob: undefined }]) {
    assert.deepEqual(sanitizeRespawns([respawn(spoiled)], false), [], JSON.stringify(spoiled));
  }
});

test("a shortest longer than the longest is impossible, not weak, and is refused", () => {
  assert.deepEqual(sanitizeRespawns([respawn({ shortestSeconds: 900, longestSeconds: 300 })], false), []);
  assert.equal(sanitizeRespawns([respawn({ shortestSeconds: 300, longestSeconds: 300 })], false).length, 1, "equal is fine");
});

test("a place confirmed to be a restriction notice, not a camp, is refused like a malformed shape", () => {
  assert.deepEqual(sanitizeRespawns([respawn({ place: "an area where levitation effects do not function" })], false), []);
});

test("one bad row costs its own row and nothing else", () => {
  const out = sanitizeRespawns([respawn(), null, "nonsense", 7, [], respawn({ mob: "a rat king" })], false);
  assert.deepEqual(out.map((r) => r.mob), ["a named", "a rat king"]);
});

test("nothing at all is an empty list, not a throw", () => {
  assert.deepEqual(sanitizeRespawns([], false), []);
});

// ─── the store — credited, kept apart, and survives a restart (ADR 0242) ──────────────────────

test("a filed respawn comes back flat and credited — the shape a `give` sends", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-peer-respawns-"));
  const store = createPeerRespawns(dir);
  const bob = { id: contributorId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), name: "Bob" };
  store.report(bob, [respawn()]);
  const [row] = store.all();
  assert.equal(row.mob, "a named");
  assert.equal(row.by, "Bob");
  assert.equal(row.byId, bob.id);
});

test("respawns survive a restart, still keyed by whoever taught them to us", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-peer-respawns-"));
  const bob = { id: contributorId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), name: "Bob" };
  const first = createPeerRespawns(dir);
  first.report(bob, [respawn()]);
  first.flush();

  const second = createPeerRespawns(dir);
  assert.equal(second.all().length, 1);
  assert.equal(second.all()[0].byId, bob.id);
});
