/**
 * Tests for contributed data: who told us something
 * ([src/shared/contributors.ts](../../src/shared/contributors.ts)) and how it is kept
 * ([electron/contributions.ts](../contributions.ts)).
 *
 * The store's tests touch a real temp userData dir, like the other stores', because *surviving a
 * restart* is the whole feature — peers' kills used to live in a window's state and die with it.
 *
 * The five rules from the store's own header get a test each, since every one of them reads as a bug
 * when it's missing: keyed by id rather than name, a report that replaces, an un-share that doesn't
 * erase, arrivals that are vetted, and a cap that holds.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  contributorId,
  contributorName,
  isContributorId,
  isLegacyContributorId,
  legacyContributorId,
  readContributor,
  UNKNOWN_CONTRIBUTOR,
} from "../../src/shared/contributors";
import { createContributions } from "../contributions";

const ALICE = { id: contributorId("11111111-2222-3333-4444-555555555555"), name: "Alice" };
const BOB = { id: contributorId("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), name: "Bob" };

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-contrib-"));
}

/** A store of plain numbered rows — the rules are the subject here, not any one payload shape. */
interface Row {
  n: number;
  by?: string;
  byId?: string;
}

function store(dir: string, cap = 10) {
  return createContributions<Row>({
    file: path.join(dir, "contributed.json"),
    what: "test rows",
    concern: "peer-knowledge",
    cap,
    // Vetting, in miniature: a row has to have a finite, non-negative `n` to be worth keeping.
    sanitize: (raw) =>
      raw.flatMap((r) => {
        const n = (r as { n?: unknown })?.n;
        return typeof n === "number" && Number.isFinite(n) && n >= 0 ? [{ n }] : [];
      }),
    credit: (row, by) => ({ ...row, by: by.name, byId: by.id }),
  });
}

// ── identity ──────────────────────────────────────────────────────────────────

test("a contributor id is recognisable, and nothing else is", () => {
  assert.ok(isContributorId(ALICE.id));
  // The shapes that would otherwise be accepted as keys, which is the whole point of the check.
  assert.equal(isContributorId("Alice"), false);
  assert.equal(isContributorId("11111111-2222-3333-4444-555555555555"), false); // bare uuid, unprefixed
  assert.equal(isContributorId("c-nonsense"), false);
  assert.equal(isContributorId(undefined), false);
  assert.equal(isContributorId(42), false);
});

test("an announced identity is read only when it carries an id", () => {
  assert.deepEqual(readContributor({ id: ALICE.id, name: "Alice" }), ALICE);
  // A peer on an older build announces a name and no id. It is nobody: filing them under their name
  // is exactly the behaviour ids replaced.
  assert.equal(readContributor({ name: "Alice" }), null);
  assert.equal(readContributor({ id: "Alice", name: "Alice" }), null);
});

test("a name is a label: trimmed, capped, and never required", () => {
  assert.equal(contributorName("  Alice  "), "Alice");
  assert.equal(contributorName(""), UNKNOWN_CONTRIBUTOR);
  assert.equal(contributorName(undefined), UNKNOWN_CONTRIBUTOR);
  assert.equal(contributorName("x".repeat(500)).length, 40);
});

test("a tally inherited from the name-keyed era says so in its key", () => {
  const id = legacyContributorId("Bob");
  assert.ok(isLegacyContributorId(id));
  assert.equal(id, legacyContributorId("  BOB  ")); // the same person, however they typed it
  // And it can never be mistaken for the real thing, which is what stops it being trusted as one.
  assert.equal(isContributorId(id), false);
});

// ── the five rules ────────────────────────────────────────────────────────────

test("two contributors who share a display name stay two contributors", () => {
  const dir = tempDir();
  const s = store(dir);
  s.report(ALICE, [{ n: 1 }]);
  s.report({ id: BOB.id, name: "Alice" }, [{ n: 2 }]);

  assert.equal(s.size().contributors, 2);
  assert.deepEqual(
    s.pooled().map((r) => r.n).sort(),
    [1, 2],
  );
});

test("a report replaces that contributor's set rather than adding to it", () => {
  const dir = tempDir();
  const s = store(dir);
  // Everyone broadcasts their whole current tally, so adding would double-count what we already had.
  s.report(ALICE, [{ n: 1 }, { n: 2 }]);
  s.report(ALICE, [{ n: 1 }, { n: 2 }, { n: 3 }]);
  assert.deepEqual(s.size(), { contributors: 1, items: 3 });
});

test("un-sharing keeps what it taught us, and forgetting is the retraction", () => {
  const dir = tempDir();
  const s = store(dir);
  s.report(ALICE, [{ n: 1 }, { n: 2 }]);
  // An empty report is "stop counting me from now on" — the expensive part is what it taught, and
  // there is no log of ours to rebuild it from (ADR 0056's reasoning, applied to somebody else's).
  s.report(ALICE, []);
  assert.equal(s.size().items, 2);
  // …but the timestamp moves, so a reader can tell live pooling from a tally nobody has refreshed.
  assert.ok(s.all()[0].seenAt);

  s.forget(ALICE.id);
  assert.deepEqual(s.size(), { contributors: 0, items: 0 });
});

test("a malformed row is dropped, and takes nothing else with it", () => {
  const dir = tempDir();
  const s = store(dir);
  s.report(ALICE, [{ n: 1 }, { n: "lots" }, null, { n: Number.NaN }, { n: -3 }, { n: 4 }]);
  assert.deepEqual(
    s.pooled().map((r) => r.n),
    [1, 4],
  );
});

test("one chatty contributor is capped, and doesn't crowd anyone out", () => {
  const dir = tempDir();
  const s = store(dir, 3);
  s.report(ALICE, [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }, { n: 5 }]);
  s.report(BOB, [{ n: 9 }]);
  assert.deepEqual(s.size(), { contributors: 2, items: 4 });
});

test("every pooled row knows who said it", () => {
  const dir = tempDir();
  const s = store(dir);
  s.report(ALICE, [{ n: 1 }]);
  assert.deepEqual(s.pooled(), [{ n: 1, by: "Alice", byId: ALICE.id }]);
});

test("contributions survive a restart, still keyed by whoever made them", () => {
  const dir = tempDir();
  const first = store(dir);
  first.report(ALICE, [{ n: 1 }, { n: 2 }]);
  first.report(BOB, [{ n: 3 }]);
  first.flush();

  // A fresh store over the same folder — the app, restarted.
  const second = store(dir);
  assert.deepEqual(second.size(), { contributors: 2, items: 3 });
  const alice = second.all().find((c) => c.by.id === ALICE.id);
  assert.equal(alice?.by.name, "Alice");
  assert.equal(alice?.data.length, 2);
});

test("a name change follows the contributor rather than splitting them", () => {
  const dir = tempDir();
  const s = store(dir);
  s.report(ALICE, [{ n: 1 }]);
  s.report({ id: ALICE.id, name: "Alicia" }, [{ n: 1 }, { n: 2 }]);
  assert.equal(s.size().contributors, 1);
  assert.equal(s.all()[0].by.name, "Alicia"); // the label is refreshed; the key never moved
});
