/**
 * `sanitizeFactionObservations` is the receiving half of "somebody else told us this" for pooled
 * faction-cause evidence — see `mob-knowledge.test.ts` for the sibling check this mirrors, and
 * `contributions.ts` for the filing rules (keyed by contributor, re-vetted on every load).
 *
 * `createFactionObservations`'s own `mine()`/`knowledge()` are checked against a fake `FactionLog`
 * (just `standings()`), the same way `mob-knowledge.test.ts` fakes a `KillLog` down to
 * `observations()` alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFactionObservations, sanitizeFactionObservations } from "../faction-observations";
import { contributorId } from "../../src/shared/contributors";
import type { FactionLog } from "../faction-log";
import type { FactionStanding } from "../../src/shared/types";

const tally = (over: Record<string, unknown> = {}) => ({ faction: "Wharf Rats", kind: "kill", source: "a dock worker", net: -4, hits: 2, ...over });

test("a well-formed tally survives", () => {
  const out = sanitizeFactionObservations([tally()], false);
  assert.equal(out.length, 1);
  assert.equal(out[0].faction, "Wharf Rats");
  assert.equal(out[0].kind, "kill");
});

test("a kind that isn't 'kill' or 'dialogue' is refused like a malformed shape", () => {
  assert.deepEqual(sanitizeFactionObservations([tally({ kind: "guess" })], false), []);
});

test("a net bigger than the hits could plausibly have produced is discarded, not clamped", () => {
  // Two hits, claiming a swing of 50,000 — no single logged faction adjustment has ever been seen
  // anywhere near that large (the module's own `MAX_SINGLE_HIT`).
  assert.deepEqual(sanitizeFactionObservations([tally({ hits: 2, net: 50_000 })], false), []);
  assert.equal(sanitizeFactionObservations([tally({ hits: 2, net: -120 })], false).length, 1, "within two hits' worth still survives");
});

test("a non-positive or non-numeric hit count is refused", () => {
  assert.deepEqual(sanitizeFactionObservations([tally({ hits: 0 })], false), []);
  assert.deepEqual(sanitizeFactionObservations([tally({ hits: "two" })], false), []);
});

test("a well-formed admin audit flag survives re-vetting our own file, but never a fresh peer report", () => {
  const admin = (row: unknown) => (row as { __admin?: unknown }).__admin;
  const audit = { edited: true, history: [{ field: "net", from: -4, to: -6, at: "2026-01-01T00:00:00Z" }] };

  const [keptOnReload] = sanitizeFactionObservations([tally({ __admin: audit })], true);
  assert.deepEqual(admin(keptOnReload), audit);

  // The same, well-formed audit trail, but arriving as a live report — a peer cannot hand us this
  // shape and have it read, in our own admin panel, as a correction we ourselves made.
  const [fromPeer] = sanitizeFactionObservations([tally({ __admin: audit })], false);
  assert.equal(admin(fromPeer), undefined, "a peer's own report never carries our audit trail forward");
});

// ─── `mine()`/`knowledge()` — derived from the ledger, never stored (mirrors mob-knowledge.ts) ──

const BOB = { id: contributorId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), name: "Bob" };

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-faction-observations-"));
}

function standing(over: Partial<FactionStanding> = {}): FactionStanding {
  return {
    faction: "Wharf Rats",
    net: -4,
    raises: 0,
    lowers: 2,
    floors: 0,
    ceilings: 0,
    firstAt: "2026-01-01T00:00:00Z",
    lastAt: "2026-01-01T00:05:00Z",
    causes: [{ kind: "kill", source: "a dock worker", net: -4, hits: 2 }],
    ...over,
  };
}

const fakeLog = (standings: FactionStanding[]): Pick<FactionLog, "standings"> => ({ standings: () => standings });

test("mine() is the ledger's own causes, flattened — never a second copy of the same facts", () => {
  const store = createFactionObservations(tempDir(), fakeLog([standing()]));
  assert.deepEqual(store.mine(), [{ faction: "Wharf Rats", kind: "kill", source: "a dock worker", net: -4, hits: 2 }]);
});

test("a standing with no resolved cause contributes nothing to mine() — a floor/ceiling or still-unmatched hit isn't poolable", () => {
  const store = createFactionObservations(tempDir(), fakeLog([standing({ causes: [] })]));
  assert.deepEqual(store.mine(), []);
});

test("pooled() is everyone's, flat and credited — the shape a `give` sends", () => {
  const store = createFactionObservations(tempDir(), fakeLog([]));
  store.report(BOB, [tally()]);
  const [row] = store.pooled();
  assert.equal(row.faction, "Wharf Rats");
  assert.equal(row.by, "Bob");
  assert.equal(row.byId, BOB.id);
});

test("knowledge() folds mine and pooled into one verdict per (faction, kind, source)", () => {
  const store = createFactionObservations(tempDir(), fakeLog([standing()]));
  store.report(BOB, [tally({ net: -2, hits: 1 })]);
  const [row] = store.knowledge();
  assert.equal(row.faction, "Wharf Rats");
  assert.equal(row.kind, "kill");
  assert.equal(row.hits, 3, "2 of mine plus 1 of Bob's");
  assert.equal(row.myHits, 2);
  assert.equal(row.net, -6);
  assert.deepEqual(row.contributors, [{ id: BOB.id, name: "Bob" }]);
});

test("knowledge() keeps a kill cause and a dialogue cause for the same faction apart, never blended", () => {
  const store = createFactionObservations(
    tempDir(),
    fakeLog([
      standing({
        causes: [
          { kind: "kill", source: "a dock worker", net: -4, hits: 2 },
          { kind: "dialogue", source: "Bob", net: 2, hits: 1 },
        ],
      }),
    ]),
  );
  const rows = store.knowledge();
  assert.equal(rows.length, 2);
  assert.ok(rows.some((r) => r.kind === "kill" && r.source === "a dock worker"));
  assert.ok(rows.some((r) => r.kind === "dialogue" && r.source === "Bob"));
});

test("version moves when a peer's report changes what pooled() answers, and nothing else moves it", () => {
  const store = createFactionObservations(tempDir(), fakeLog([]));
  const v0 = store.version();
  store.report(BOB, [tally()]);
  assert.notEqual(store.version(), v0);
});
