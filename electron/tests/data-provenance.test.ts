/**
 * Tests for data provenance — the staleness rule
 * ([src/shared/data-provenance.ts](../../src/shared/data-provenance.ts)) and the reader that gets a
 * stamp back off disk ([electron/data-health.ts](../data-health.ts)).
 *
 * The reader's tests touch a real temp dir, like the other store tests: the whole claim is that a
 * stamp written by one build is legible to the next, and that a **large** file's stamp is found
 * without reading the file. Neither is provable against a mock.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DATA_CONCERNS,
  actionsNeeded,
  concernById,
  dataState,
  needsAction,
  stampFor,
  type DataConcern,
} from "../../src/shared/data-provenance";
import { dataReport } from "../data-health";
import { createSaver, setAppVersion, writeJson } from "../json-store";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-prov-"));
}

const concern = (over: Partial<DataConcern> = {}): DataConcern => ({
  id: "test",
  label: "Test",
  revision: 3,
  remedy: "re-eat",
  blurb: "",
  ...over,
});

// ── the rule ──────────────────────────────────────────────────────────────────

test("a stamp at the current revision is current, an older one is stale", () => {
  const c = concern();
  assert.equal(dataState(c, { revision: 3 }), "current");
  assert.equal(dataState(c, { revision: 2 }), "stale");
  assert.equal(dataState(c, { revision: 0 }), "stale");
});

test("data from a newer build is `ahead`, and is never offered a remedy", () => {
  const c = concern();
  assert.equal(dataState(c, { revision: 4 }), "ahead");
  // The point of the separate state: rebuilding newer data with older rules would replace the better
  // answer with a worse one, so a downgrade must be told apart from staleness rather than lumped in.
  assert.equal(needsAction({ concern: c, state: "ahead" }), false);
  assert.equal(needsAction({ concern: c, state: "stale" }), true);
});

test("an unstamped file is assumed current unless the concern says otherwise", () => {
  // The default matters more than it looks: the day stamping ships, nothing on disk has a stamp, and
  // flagging every store at once would be noise about data that is in fact fine.
  assert.equal(dataState(concern(), undefined), "current");
  // Set below the revision only when a bump is known to predate stamping — then it really is old.
  assert.equal(dataState(concern({ unstamped: 1 }), undefined), "stale");
});

test("no file at all is `absent`, which is not a fault and not a chore", () => {
  const c = concern({ unstamped: 1 });
  // Even for a concern whose unstamped data would be stale: there is nothing there to be stale.
  assert.equal(dataState(c, undefined, false), "absent");
  assert.equal(needsAction({ concern: c, state: "absent" }), false);
});

test("a remedy nobody can act on is not counted as an action", () => {
  // `rescan` the app does by itself and `unrecoverable` cannot be done at all — a count that included
  // them would be a badge you can never clear.
  const rows = [
    { concern: concern({ id: "a", remedy: "re-eat" as const }), state: "stale" as const },
    { concern: concern({ id: "b", remedy: "script" as const }), state: "stale" as const },
    { concern: concern({ id: "c", remedy: "rescan" as const }), state: "stale" as const },
    { concern: concern({ id: "d", remedy: "unrecoverable" as const }), state: "stale" as const },
    { concern: concern({ id: "e", remedy: "re-eat" as const }), state: "current" as const },
  ];
  assert.equal(actionsNeeded(rows), 2);
});

test("the shipped table is self-consistent", () => {
  // A data-integrity test over a committed artefact — the category `specs/testing` says we lack.
  const ids = new Set<string>();
  for (const c of DATA_CONCERNS) {
    assert.ok(!ids.has(c.id), `duplicate concern id ${c.id}`);
    ids.add(c.id);
    assert.ok(c.revision >= 1, `${c.id} has no revision`);
    assert.ok(c.label && c.blurb, `${c.id} is missing its wording`);
    // An `unstamped` above the current revision would report every existing file as `ahead`.
    if (c.unstamped !== undefined) assert.ok(c.unstamped <= c.revision, `${c.id} unstamped > revision`);
    // A stale row has to be able to say what changed, or the flag is a chore with no information.
    if (dataState(c, undefined) === "stale") assert.ok(c.changed, `${c.id} is stale by default but says no reason`);
    // A script remedy without the command is a row that tells you to run something unnamed.
    if (c.remedy === "script") assert.ok(c.command, `${c.id} needs a command`);
    assert.equal(concernById(c.id), c);
  }
});

// ── the stamp, on disk ────────────────────────────────────────────────────────

test("a store stamps itself, and the stamp survives the round trip", () => {
  const dir = tempDir();
  setAppVersion("0.1.42");
  const file = path.join(dir, "combat-history.json");
  createSaver(file, "fights", () => ({ fights: [{ id: "f1" }] }), 10, { concern: "combat-history" }).flush();

  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  // Merged into the object rather than wrapping it, so every existing reader sees the shape it always did.
  assert.deepEqual(raw.fights, [{ id: "f1" }]);
  const stamp = raw.provenance as { revision: number; appVersion: string; at: string };
  assert.equal(stamp.revision, concernById("combat-history")!.revision);
  assert.equal(stamp.appVersion, "0.1.42");
  assert.ok(stamp.at);

  // And read back as current, which is the whole round trip this feature rests on.
  const row = dataReport(dir).find((r) => r.concern.id === "combat-history");
  assert.equal(row?.state, "current");
  assert.equal(row?.stamp?.appVersion, "0.1.42");
});

test("an unstamped file on disk reports against the concern's own assumption", () => {
  const dir = tempDir();
  // What an older build left behind: real data, no stamp.
  writeJson(path.join(dir, "combat-history.json"), { fights: [] });
  writeJson(path.join(dir, "loot-log.json"), { loot: [] });
  const rows = dataReport(dir);
  // `combat-history` declares `unstamped: 1` because ADR 0095's bump predates stamping.
  assert.equal(rows.find((r) => r.concern.id === "combat-history")?.state, "stale");
  // `loot-log` hasn't changed, so an unstamped file is simply current.
  assert.equal(rows.find((r) => r.concern.id === "loot-log")?.state, "current");
});

test("a store with no file yet is absent rather than stale", () => {
  const rows = dataReport(tempDir());
  for (const row of rows.filter((r) => r.concern.file)) {
    assert.equal(row.state, "absent", `${row.concern.id} should be absent in an empty dir`);
  }
  assert.equal(actionsNeeded(rows), 0); // a fresh install must not open with a list of chores
});

test("a stamp is found in a big file without reading the file", () => {
  const dir = tempDir();
  setAppVersion("0.1.99");
  const file = path.join(dir, "combat-history.json");
  // Far bigger than the read window, which is the case that matters: a real history is megabytes and
  // a report about it must not cost megabytes of parsing.
  const fights = Array.from({ length: 20_000 }, (_, i) => ({ id: `f${i}`, filler: "x".repeat(60) }));
  createSaver(file, "fights", () => ({ fights }), 10, { concern: "combat-history" }).flush();
  assert.ok(fs.statSync(file).size > 1_000_000, "fixture should exceed the read window");

  const row = dataReport(dir).find((r) => r.concern.id === "combat-history");
  assert.equal(row?.state, "current");
  assert.equal(row?.stamp?.appVersion, "0.1.99");
});

test("a file that won't parse is reported, never rewritten", () => {
  const dir = tempDir();
  const file = path.join(dir, "combat-history.json");
  fs.writeFileSync(file, "{ this is not json", "utf8");
  const before = fs.readFileSync(file, "utf8");
  // No stamp to find, so it falls back to the concern's assumption — and the file is left exactly as
  // it is, because every remedy here is somebody's decision and this module only ever describes.
  assert.equal(dataReport(dir).find((r) => r.concern.id === "combat-history")?.state, "stale");
  assert.equal(fs.readFileSync(file, "utf8"), before);
});

test("an unregistered concern writes the data anyway, without a stamp", () => {
  const dir = tempDir();
  const file = path.join(dir, "whatever.json");
  // A wiring mistake must never be the reason data fails to reach disk.
  assert.equal(writeJson(file, { kept: true }, { concern: "no-such-thing" }), true);
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  assert.equal(raw.kept, true);
  assert.equal(raw.provenance, undefined);
});

test("an array-shaped store is written untouched rather than reshaped to fit a stamp", () => {
  const dir = tempDir();
  const file = path.join(dir, "list.json");
  writeJson(file, [1, 2, 3], { concern: "combat-history" });
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), [1, 2, 3]);
});
