/**
 * Black-box tests for the kept stats record on disk (`electron/stats-record.ts`) and for the `stats` peer kind:
 * that the record survives a restart, that a bad one is refused, and that what a peer sends is checked by the
 * same gate and never carries the figures still awaiting the player's yes. Real disk (a temp directory), no
 * Electron. Only need re-running if those modules, `stats-record.ts` or the `stats` entry in `peer-share.ts` change.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStatsRecord } from "../stats-record";
import { sharing, shareKind } from "../../src/shared/peers/peer-share";
import { shareSources } from "../../src/shared/peers/peer-share-hub";
import { nextStatsRecord, type StatsRecord } from "../../src/shared/items/stats-record";

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "eql-statsrecord-"));
const TRIO = ["Wizard", "Druid", "Magician"];
const AT = Date.parse("2026-11-08T14:39:19.000Z");
const record = (held = {}): StatsRecord => nextStatsRecord(null, { at: AT, classes: TRIO, level: 31, race: "ERU", applied: { hp: 1976, int: 214, svFire: 19 }, held });
const stats = shareKind("stats")!;
const newId = () => "id";

// ── on disk ──

test("a record survives a restart: written on flush, read back as it was — held figures included", () => {
  const dir = tempDir();
  const first = createStatsRecord(dir);
  first.set(record({ mana: 2924 }));
  first.flush();
  assert.deepEqual(createStatsRecord(dir).get(), record({ mana: 2924 }));
});

test("before any read there is nothing to keep, and nothing to offer", () => {
  const store = createStatsRecord(tempDir());
  assert.equal(store.get(), null);
  assert.deepEqual(store.shareRows(), []);
});

test("a damaged or hand-edited file costs the record, not the app", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "stats-record.json"), "{ this is not json");
  assert.equal(createStatsRecord(dir).get(), null);
  fs.writeFileSync(path.join(dir, "stats-record.json"), JSON.stringify({ asOf: "yesterday", figures: { hp: 1 } }));
  assert.equal(createStatsRecord(dir).get(), null);
  fs.writeFileSync(path.join(dir, "stats-record.json"), JSON.stringify({ asOf: "2026-11-08T14:39:19Z", figures: { hp: 1976, evil: 5 }, classes: ["Wizard", "Jedi"] }));
  assert.deepEqual(createStatsRecord(dir).get()?.figures, { hp: 1976 }, "known stats only");
});

test("a bad record from the renderer is refused, and only an explicit null forgets", () => {
  const store = createStatsRecord(tempDir());
  store.set(record());
  assert.deepEqual(store.set({ nonsense: true }), record(), "refused: what is held stays held");
  assert.deepEqual(store.get(), record());
  assert.equal(store.set(null), null);
  assert.equal(store.get(), null);
});

test("it says so when the record changed, and stays quiet when it didn't", () => {
  const store = createStatsRecord(tempDir());
  let said = 0;
  store.onChange(() => (said += 1));
  store.set(record());
  store.set(record());
  assert.equal(said, 1);
  store.set(record({ mana: 2924 }));
  assert.equal(said, 2);
});

// ── to the room ──

test("stats are a live kind that is on unless switched off — and the switch wins, both ways", () => {
  assert.equal(stats.family, "live");
  assert.equal(sharing(undefined, "stats"), true, "nobody has said either way");
  assert.equal(sharing({}, "stats"), true);
  assert.equal(sharing({ stats: false }, "stats"), false, "off stays off");
  assert.equal(sharing({ stats: true }, "stats"), true);
  assert.equal(stats.rowKey?.({}), "stats");
});

test("what is offered is the record without the figures awaiting a yes — a peer never sees a guess", () => {
  const store = createStatsRecord(tempDir());
  store.set(record({ mana: 2924 }));
  const [row] = store.shareRows() as StatsRecord[];
  assert.equal(row.held, undefined);
  assert.deepEqual(row.figures, { hp: 1976, int: 214, svFire: 19 });
  assert.deepEqual(stats.read([row], newId), [row], "our own row passes the reader a peer would run it through");
});

test("a peer's row is checked: held figures, unknown stats and impossible numbers don't arrive", () => {
  const rows = stats.read(
    [{ asOf: "2026-11-08T14:39:19Z", level: 31, classes: ["Wizard"], race: "ERU", figures: { hp: 1976, evil: 1, mana: -3 }, held: { ac: 242 } }],
    newId,
  ) as StatsRecord[];
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].figures, { hp: 1976 });
  assert.equal(rows[0].held, undefined, "a peer that sends a guess as a figure has it dropped, not believed");
});

test("a peer's junk is nothing, and only one row is ever read", () => {
  assert.deepEqual(stats.read("not a list", newId), []);
  assert.deepEqual(stats.read([null, 3, { figures: { hp: 1 } }], newId), [], "no date: nothing");
  const two = stats.read([record(), { ...record(), level: 32 }], newId) as StatsRecord[];
  assert.equal(two.length, 1, "a second row would just be a lie somebody sent");
});

test("the source the hub offers from is the record", () => {
  const store = createStatsRecord(tempDir());
  store.set(record());
  const sources = shareSources({
    getList: () => ({ entries: [] }),
    getSettings: () => ({}) as never,
    killLog: { placedKills: () => [], observations: () => [], version: () => 0 },
    mobKnowledge: { pooled: () => [], version: () => 0 },
    factionLog: { version: () => 0 },
    factionObservations: { mine: () => [], pooled: () => [], version: () => 0 },
    peerKills: { all: () => [], version: () => 0 },
    peerRespawns: { all: () => [] },
    crafting: { mine: () => [], pooled: () => [] },
    factions: { rows: () => [] },
    spawns: { view: () => ({ running: [], known: [] }) },
    buffs: { view: () => ({ active: [] }) },
    scores: { board: () => ({ scores: [] }) },
    fight: { current: () => undefined },
    gameClock: { reading: () => null },
    celebrations: { current: () => undefined },
    inventory: { rows: () => [] },
    statsRecord: { rows: () => store.shareRows() },
  });
  assert.deepEqual(sources.stats.rows(), store.shareRows());
  assert.equal(sources.stats.rows().length, 1);
});
