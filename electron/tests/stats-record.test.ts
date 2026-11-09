/**
 * Black-box tests for the kept record of a stats read (`src/shared/items/stats-record.ts`): what a record may
 * be (the one gate for the disk and for a peer's wire), how a new read folds into the held one, and what leaves.
 * Only need re-running if that module or `stat-base.ts`'s `CALIBRATED` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { answeredStatsRecord, nextStatsRecord, readOfRecord, readStatsRecord, shareableStats, whoText, RECORDED_STATS, type StatsRecord } from "../../src/shared/items/stats-record";

const AT = Date.parse("2026-11-08T14:39:19.000Z");
const TRIO = ["Wizard", "Druid", "Magician"];
const update = (over: Partial<Parameters<typeof nextStatsRecord>[1]> = {}) => ({ at: AT, classes: TRIO, level: 31, race: "ERU", applied: { hp: 1976, int: 214 }, held: {}, ...over });

// ── the gate ──

test("a record read back is what was written, with its date made canonical", () => {
  const record: StatsRecord = { asOf: "2026-11-08T14:39:19.000Z", level: 31, classes: TRIO, race: "ERU", figures: { hp: 1976, svFire: 19, hpRegen: 18 } };
  assert.deepEqual(readStatsRecord(JSON.parse(JSON.stringify(record))), record);
  assert.equal(readStatsRecord({ ...record, asOf: "2026-11-08T14:39:19Z" })?.asOf, "2026-11-08T14:39:19.000Z");
});

test("a record with no date, or nothing in it, is nothing", () => {
  assert.equal(readStatsRecord(null), null);
  assert.equal(readStatsRecord("junk"), null);
  assert.equal(readStatsRecord({ figures: { hp: 1 }, classes: [] }), null, "no date");
  assert.equal(readStatsRecord({ asOf: "not a date", figures: { hp: 1 } }), null);
  assert.equal(readStatsRecord({ asOf: "2026-11-08T14:39:19Z", figures: {}, classes: [] }), null, "nothing worth keeping");
  assert.ok(readStatsRecord({ asOf: "2026-11-08T14:39:19Z", figures: {}, classes: ["Wizard"] }), "classes alone are something");
});

test("only known stats pass, as whole non-negative numbers in range — a hostile peer's extras are dropped", () => {
  const r = readStatsRecord({
    asOf: "2026-11-08T14:39:19Z",
    figures: { hp: 1976.4, mana: -5, ac: 1e12, str: "74", sta: Number.NaN, int: 214, haste: 100, __proto__: { x: 1 }, evil: 9 },
  });
  assert.deepEqual(r?.figures, { hp: 1976, int: 214 });
});

test("classes are spelled the app's way, distinct, known and at most three; a level is a real one", () => {
  const r = readStatsRecord({ asOf: "2026-11-08T14:39:19Z", figures: { hp: 1 }, classes: ["wizard", "DRUID", "Druid", "Jedi", "Magician", "Cleric"], level: 61 });
  assert.deepEqual(r?.classes, ["Wizard", "Druid", "Magician"]);
  assert.equal(r?.level, undefined, "past the cap is no level");
  assert.equal(readStatsRecord({ asOf: "2026-11-08T14:39:19Z", figures: { hp: 1 }, level: 31.5 })?.level, undefined);
  assert.equal(readStatsRecord({ asOf: "2026-11-08T14:39:19Z", figures: { hp: 1 }, level: 0 })?.level, undefined);
});

test("a race is a short code or nothing", () => {
  const base = { asOf: "2026-11-08T14:39:19Z", figures: { hp: 1 } };
  assert.equal(readStatsRecord({ ...base, race: "eru" })?.race, "ERU");
  assert.equal(readStatsRecord({ ...base, race: "<script>" })?.race, undefined);
  assert.equal(readStatsRecord({ ...base, race: 7 })?.race, undefined);
});

test("the stats a record may carry are the calibrated ones and the regen rows — nothing else", () => {
  assert.ok(RECORDED_STATS.includes("hp") && RECORDED_STATS.includes("svVoid") && RECORDED_STATS.includes("hpRegen"));
  assert.ok(!(RECORDED_STATS as readonly string[]).includes("haste"));
});

// ── what leaves ──

test("the figures still awaiting the player's yes do not leave", () => {
  const record: StatsRecord = { asOf: "2026-11-08T14:39:19.000Z", classes: TRIO, figures: { hp: 1976 }, held: { mana: 2924 } };
  assert.deepEqual(shareableStats(record), { asOf: "2026-11-08T14:39:19.000Z", classes: TRIO, figures: { hp: 1976 } });
  assert.equal(readStatsRecord(shareableStats(record))?.held, undefined, "so a peer's copy has none to read back");
});

// ── folding a read in ──

test("a first read becomes the record", () => {
  assert.deepEqual(nextStatsRecord(null, update()), { asOf: "2026-11-08T14:39:19.000Z", level: 31, classes: TRIO, race: "ERU", figures: { hp: 1976, int: 214 } });
});

test("a second read of the same character adds to what is held — half a page doesn't forget the other half", () => {
  const first = nextStatsRecord(null, update());
  const second = nextStatsRecord(first, update({ at: AT + 60_000, applied: { hp: 2034, svFire: 19 } }));
  assert.deepEqual(second.figures, { hp: 2034, int: 214, svFire: 19 });
  assert.equal(second.asOf, "2026-11-08T14:40:19.000Z");
});

test("a read as a different character replaces it — the old figures were someone else's totals", () => {
  const first = nextStatsRecord(null, update());
  for (const changed of [update({ level: 32 }), update({ classes: ["Cleric"] }), update({ race: "DEF" }), update({ race: undefined })]) {
    assert.deepEqual(nextStatsRecord(first, { ...changed, applied: { hp: 5 } }).figures, { hp: 5 });
  }
  assert.deepEqual(nextStatsRecord(first, update({ classes: ["Magician", "Wizard", "Druid"], applied: { hp: 5 } })).figures, { hp: 5, int: 214 }, "the same classes in another order are the same character");
});

test("what the newest read wasn't sure of is held, replacing the last read's", () => {
  const first = nextStatsRecord(null, update({ held: { mana: 2924 } }));
  assert.deepEqual(first.held, { mana: 2924 });
  assert.equal(nextStatsRecord(first, update({ held: {} })).held, undefined);
});

test("a yes keeps the held figures as the game's own, a no drops them", () => {
  const record = nextStatsRecord(null, update({ held: { mana: 2924 } }));
  assert.deepEqual(answeredStatsRecord(record, true).figures, { hp: 1976, int: 214, mana: 2924 });
  assert.equal(answeredStatsRecord(record, true).held, undefined);
  assert.deepEqual(answeredStatsRecord(record, false).figures, { hp: 1976, int: 214 });
  assert.equal(answeredStatsRecord(record, false).held, undefined);
});

// ── as a read ──

test("a record is a read again: who it describes, and what it showed, none of it in doubt", () => {
  const read = readOfRecord(nextStatsRecord(null, update()));
  assert.deepEqual(read.who, { classes: TRIO, level: 31, unsure: [] });
  assert.deepEqual([read.values, read.doubtful, read.repaired, read.missing], [{ hp: 1976, int: 214 }, [], [], []]);
  assert.equal(readOfRecord({ asOf: "2026-11-08T14:39:19.000Z", classes: [], figures: { hp: 1 } }).who, undefined);
});

test("who a record describes reads as a phrase, with as much as it knows", () => {
  assert.equal(whoText({ classes: TRIO, level: 31 }), "Wizard / Druid / Magician, level 31");
  assert.equal(whoText({ classes: ["Bard"] }), "Bard");
  assert.equal(whoText({ classes: [], level: 12 }), "level 12");
  assert.equal(whoText({ classes: [] }), "an unknown character");
});
