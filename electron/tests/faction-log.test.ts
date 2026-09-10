/**
 * Black-box test for the always-on faction ledger: it records hits, hands them back newest-first
 * (bounded by the caller's limit), folds them to a net standing per faction, survives a restart, and
 * treats a corrupt file as empty rather than fatal. Mirrors `loot-log.test.ts`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createFactionLog } from "../faction-log";
import type { FactionEvent } from "../../src/shared/types";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-faction-"));
}

function hit(faction: string, sec: number, delta: number | null, direction: FactionEvent["direction"]): FactionEvent {
  return {
    kind: "faction",
    faction,
    delta,
    direction,
    logId: sec,
    raw: `faction hit ${faction}`,
    at: `2026-07-29T00:00:${String(sec).padStart(2, "0")}`,
  };
}

const raised = (faction: string, sec: number, delta: number) => hit(faction, sec, delta, "raised");
const lowered = (faction: string, sec: number, delta: number) => hit(faction, sec, delta, "lowered");

test("the same faction line twice is one hit — a replayed gap isn't a second adjustment", () => {
  const l = createFactionLog(tempDir());
  assert.equal(l.add(lowered("Agents of Mistmoore", 1, -3)), "added");
  assert.equal(l.add(lowered("Agents of Mistmoore", 1, -3)), "known", "the same line says so rather than landing twice");
  assert.deepEqual(l.recent().map((e) => e.faction), ["Agents of Mistmoore"]);
  // A genuinely later hit against the same faction is a different line, and counts.
  assert.equal(l.add(lowered("Agents of Mistmoore", 2, -1)), "added");
  assert.equal(l.recent().length, 2);
});

test("recent returns hits newest first, capped at the limit", () => {
  const l = createFactionLog(tempDir());
  l.add(raised("Circle of Unseen Hands", 1, 2));
  l.add(lowered("Agents of Mistmoore", 2, -3));
  l.add(raised("Circle of Unseen Hands", 3, 4));
  assert.deepEqual(l.recent().map((e) => e.at.slice(-2)), ["03", "02", "01"]);
  assert.deepEqual(l.recent(2).map((e) => e.at.slice(-2)), ["03", "02"]);
});

test("the faction ledger survives a restart", () => {
  const dir = tempDir();
  const first = createFactionLog(dir);
  first.add(lowered("Agents of Mistmoore", 1, -3));
  first.flush();
  assert.deepEqual(createFactionLog(dir).recent().map((e) => e.faction), ["Agents of Mistmoore"]);
});

test("clearing empties the feed but keeps standings, and a corrupt file is not fatal", () => {
  const dir = tempDir();
  const l = createFactionLog(dir);
  l.add(lowered("Agents of Mistmoore", 1, -3));
  l.clear();
  assert.deepEqual(l.recent(), []);
  // What the ledger taught survives a plain clear — the same rule a loot price gets (ADR 0056).
  assert.equal(l.standings()[0]?.net, -3);

  // Only the second, explicit answer unlearns it.
  l.clear("everything");
  assert.deepEqual(l.standings(), []);

  const broken = tempDir();
  fs.writeFileSync(path.join(broken, "faction-log.json"), "{nope");
  assert.deepEqual(createFactionLog(broken).recent(), []);
});

test("a standing outlives the hits that built it once the feed fills up", () => {
  const l = createFactionLog(tempDir());
  l.add(lowered("Agents of Mistmoore", 1, -3));
  l.add(raised("Agents of Mistmoore", 2, 1));
  // Push both hits out of the feed. The ledger forgets the lines; the net standing they built stays.
  for (let i = 0; i < 5_002; i++) l.add(lowered("filler", 1000 + i, -1));
  assert.equal(
    l.recent(10_000).some((e) => e.faction === "Agents of Mistmoore"),
    false,
    "the hits aged out",
  );
  const standing = l.standings().find((s) => s.faction === "Agents of Mistmoore");
  assert.deepEqual(
    [standing?.net, standing?.raises, standing?.lowers],
    [-2, 1, 1],
    "aging out of the feed must not silently shrink the standing it built",
  );
});

test("standings fold every stated delta, and count floor/ceiling hits apart from them", () => {
  const l = createFactionLog(tempDir());
  l.add(lowered("Agents of Mistmoore", 1, -3));
  l.add(lowered("Agents of Mistmoore", 2, -5));
  l.add(raised("Agents of Mistmoore", 3, 1));
  l.add(hit("Agents of Mistmoore", 4, null, "floor"));
  l.add(raised("Priests of Marr", 5, 10));
  l.add(hit("Priests of Marr", 6, null, "ceiling"));

  const [mistmoore, marr] = l.standings().sort((a, b) => a.faction.localeCompare(b.faction));
  assert.deepEqual(
    [mistmoore.faction, mistmoore.net, mistmoore.raises, mistmoore.lowers, mistmoore.floors, mistmoore.ceilings],
    ["Agents of Mistmoore", -7, 1, 2, 1, 0],
  );
  assert.deepEqual(
    [marr.faction, marr.net, marr.raises, marr.lowers, marr.floors, marr.ceilings],
    ["Priests of Marr", 10, 1, 0, 0, 1],
  );
  assert.equal(mistmoore.firstAt.slice(-2), "01");
  assert.equal(mistmoore.lastAt.slice(-2), "04");
});

test("standings are ordered most-recently-touched first", () => {
  const l = createFactionLog(tempDir());
  l.add(lowered("Agents of Mistmoore", 1, -3));
  l.add(raised("Priests of Marr", 2, 5));
  assert.deepEqual(l.standings().map((s) => s.faction), ["Priests of Marr", "Agents of Mistmoore"]);
});
