/**
 * Your tradeskills from your log (ADR 0303): the two line types (`log-parser.ts`), the reducer that
 * turns them into a skill and a measured pace (`skill-progress.ts`), where a guide step stands for
 * you (`step-cost.ts`), and the tracker reading a log once and following it (`electron/skill-progress.ts`).
 * The sample lines are verbatim from a real log.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseLine } from "../../src/shared/parse-line";
import { parseCombine, parseSkillUp, splitLine } from "../../src/shared/log-parser";
import { emptyProgress, logSkillName, measuredRate, noteEvent, SESSION_GAP_MS } from "../../src/shared/tradeskills/skill-progress";
import { combineRange, placeStep, rateFactor } from "../../src/shared/tradeskills/step-cost";
import { createSkillProgress } from "../skill-progress";
import { emptyCraftingLog, noteCraft, summarizeCrafting, successText } from "../../src/shared/tradeskills/crafting-log";
import type { CombineEvent, SkillUpEvent } from "../../src/shared/types";

const line = (text: string) => splitLine(text, 1)!;

// ─── The lines ──────────────────────────────────────────────────────────────────────────────────

test("a skill-up states the skill and its new value", () => {
  const e = parseSkillUp(line("[Wed Aug 26 01:12:08 2026] You have become better at Blacksmithing! (60)"));
  assert.deepEqual([e?.kind, e?.skill, e?.value, e?.at], ["skillup", "Blacksmithing", 60, "2026-08-26T01:12:08"]);
  assert.equal(parseSkillUp(line("[Wed Aug 26 01:12:08 2026] You have become better at 1H Slashing! (162)"))?.skill, "1H Slashing");
});

test("a combine's success and failure both name the item", () => {
  const ok = parseCombine(line("[Wed Aug 26 01:11:47 2026] You have fashioned the items together to create something new: Sheet Metal."));
  assert.deepEqual([ok?.item, ok?.ok], ["Sheet Metal", true]);
  const fail = parseCombine(line("[Wed Aug 26 01:12:06 2026] You lacked the skills to fashion Forged Javelin."));
  assert.deepEqual([fail?.item, fail?.ok], ["Forged Javelin", false]);
});

test("both reach the parser chain", () => {
  assert.equal(parseLine("[Wed Aug 26 01:12:08 2026] You have become better at Blacksmithing! (60)")?.kind, "skillup");
  assert.equal(parseLine("[Wed Aug 26 01:12:06 2026] You lacked the skills to fashion Forged Javelin.")?.kind, "combine");
});

// ─── The reducer ────────────────────────────────────────────────────────────────────────────────

const at = (sec: number) => new Date(Date.UTC(2026, 7, 26, 0, 0, sec)).toISOString().slice(0, 19);
const up = (sec: number, value: number, skill = "Blacksmithing"): SkillUpEvent => ({ kind: "skillup", skill, value, at: at(sec), logId: 0, raw: "" });
const combine = (sec: number, ok = true): CombineEvent => ({ kind: "combine", item: "Sheet Metal", ok, at: at(sec), logId: 0, raw: "" });

test("the latest skill-up is the skill", () => {
  const p = emptyProgress();
  noteEvent(p, up(0, 2));
  noteEvent(p, up(10, 3));
  assert.equal(p.skills.Blacksmithing.value, 3);
});

test("a sitting's combines are credited to the skill-up they led to; the ones after it aren't", () => {
  const p = emptyProgress();
  [combine(0), combine(5), combine(10)].forEach((e) => noteEvent(p, e));
  noteEvent(p, up(12, 5));
  // Two trivial combines after the last point: they raised nothing.
  [combine(20), combine(25)].forEach((e) => noteEvent(p, e));
  assert.deepEqual({ combines: p.rates.Blacksmithing.combines, points: p.rates.Blacksmithing.points }, { combines: 3, points: 1 });
});

test("a skill-up logged before its combine still counts as a point", () => {
  // Verbatim order from the real log: (59), (60), then the combine that earned 60.
  const p = emptyProgress();
  noteEvent(p, combine(0, false));
  noteEvent(p, up(0, 59));
  noteEvent(p, up(2, 60));
  noteEvent(p, combine(2));
  assert.equal(p.rates.Blacksmithing.points, 2);
});

test("a long gap ends the sitting: what came before it can't be claimed", () => {
  const p = emptyProgress();
  noteEvent(p, combine(0));
  const later = SESSION_GAP_MS / 1000 + 60;
  noteEvent(p, combine(later));
  noteEvent(p, up(later + 5, 10));
  assert.equal(p.rates.Blacksmithing.combines, 1);
});

test("a combat skill-up is not a tradeskill", () => {
  const p = emptyProgress();
  noteEvent(p, combine(0));
  noteEvent(p, up(1, 150, "Dual Wield"));
  assert.equal(p.rates["Dual Wield"], undefined);
});

test("a rate needs enough points to mean anything", () => {
  assert.equal(measuredRate({ combines: 5, points: 2, from: 1, to: 3, lastAt: 0 }), undefined);
  assert.equal(measuredRate({ combines: 147, points: 58, from: 2, to: 60, lastAt: 0 }), 147 / 58);
  assert.equal(logSkillName("Jewelcrafting"), "Jewelry Making");
  assert.equal(logSkillName("Baking"), "Baking");
});

// ─── A step, for you ────────────────────────────────────────────────────────────────────────────

test("a step is done, current (with what's left of it) or ahead", () => {
  assert.deepEqual(placeStep({ from: 1, to: 17 }, 60), { at: "done" });
  assert.deepEqual(placeStep({ from: 34, to: 74 }, 60), { at: "current", remaining: { from: 60, to: 74 } });
  assert.deepEqual(placeStep({ from: 74, to: 84 }, 60), { at: "ahead" });
  assert.deepEqual(placeStep({ from: 74, to: 84 }, undefined), { at: "unknown" });
});

test("your pace scales the model; the real Blacksmithing evening lands at the guides' pace", () => {
  const factor = rateFactor({ combines: 147, points: 58, from: 2, to: 60 }, 10)!;
  assert.ok(Math.abs(factor - 1) < 0.05, `factor ${factor}`);
  assert.equal(rateFactor({ combines: 5, points: 2, from: 1, to: 3 }, 10), undefined);
  // Twice as slow below 150 is taken as twice as slow above it too.
  assert.deepEqual(combineRange({ from: 158, to: 190 }, 2), { low: 32, high: 480 });
});

// ─── The tracker ────────────────────────────────────────────────────────────────────────────────

const LOG = [
  "[Wed Aug 26 01:11:47 2026] You have fashioned the items together to create something new: Sheet Metal.",
  "[Wed Aug 26 01:11:50 2026] You slash a gnoll for 12 points of damage.",
  "[Wed Aug 26 01:12:02 2026] You have become better at Blacksmithing! (58)",
  "[Wed Aug 26 01:12:02 2026] You have become better at 1H Slashing! (100)",
  "",
].join("\n");

async function settled(t: ReturnType<typeof createSkillProgress>): Promise<void> {
  for (let i = 0; i < 100 && t.view().scanning; i++) await new Promise((r) => setTimeout(r, 10));
}

test("the tracker reads a log's history once, then only what's new", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eql-skills-"));
  const file = path.join(dir, "eqlog_Kainos_qeynos.txt");
  fs.writeFileSync(file, LOG);
  const t = createSkillProgress(dir);
  t.setFile(file);
  await settled(t);
  assert.equal(t.view().character, "Kainos");
  assert.deepEqual(t.view().skills, { Blacksmithing: { value: 58, at: "2026-08-26T01:12:02" } }, "a combat skill isn't a tradeskill");

  // The watcher catches up on a line the scan already read: no double count.
  t.note({ kind: "skillup", skill: "Blacksmithing", value: 58, at: "2026-08-26T01:12:02", logId: 0, raw: "" });
  assert.equal(t.view().rates.Blacksmithing?.points ?? 0, 1);

  // The log grows; a fresh start reads on from where the last one stopped.
  fs.appendFileSync(file, "[Wed Aug 26 01:12:06 2026] You lacked the skills to fashion Forged Javelin.\n[Wed Aug 26 01:12:06 2026] You have become better at Blacksmithing! (59)\n");
  const again = createSkillProgress(dir);
  again.setFile(file);
  await settled(again);
  assert.equal(again.view().skills.Blacksmithing.value, 59);
  assert.equal(again.view().rates.Blacksmithing.points, 2);
  assert.equal(again.view().rates.Blacksmithing.combines, 2);
});

// ─── The crafting log ───────────────────────────────────────────────────────────────────────────


/** Feed events the way the tracker does: the log sees the skills as they were, then progress moves. */
function craft(events: (SkillUpEvent | CombineEvent)[]) {
  const p = emptyProgress();
  const log = emptyCraftingLog();
  for (const e of events) {
    noteCraft(log, e, p.skills);
    noteEvent(p, e);
  }
  return summarizeCrafting(log);
}
const made = (sec: number, item: string, ok = true): CombineEvent => ({ kind: "combine", item, ok, at: at(sec), logId: 0, raw: "" });

test("a combine is credited to its sitting's skill, at the skill you had when you made it", () => {
  const s = craft([up(0, 20), made(5, "Sheet Metal", false), made(10, "Sheet Metal"), up(12, 21), made(15, "Sheet Metal")]);
  const sheet = s.items.find((i) => i.item === "Sheet Metal")!;
  assert.equal(sheet.skill, "Blacksmithing");
  assert.deepEqual(sheet.levels.map((l) => [l.level, l.ok, l.attempts]), [[20, 1, 2], [21, 1, 1]]);
});

test("a sitting rolls up its combines, success and skill-ups", () => {
  const s = craft([made(0, "Metal Bits"), up(1, 2), made(2, "Metal Bits", false), up(3, 3)]);
  assert.equal(s.sittings.length, 1);
  assert.deepEqual(
    { skill: s.sittings[0].skill, attempts: s.sittings[0].attempts, ok: s.sittings[0].ok, points: s.sittings[0].points, from: s.sittings[0].from, to: s.sittings[0].to },
    { skill: "Blacksmithing", attempts: 2, ok: 1, points: 2, from: 1, to: 3 },
  );
  assert.equal(successText(s.sittings[0]), "50%");
});

test("a trivial sitting borrows the item's skill and your skill at the time", () => {
  const later = SESSION_GAP_MS / 1000 + 600;
  const s = craft([made(0, "Ore Brick"), up(1, 60), made(later, "Ore Brick"), made(later + 5, "Ore Brick")]);
  assert.equal(s.sittings.length, 2);
  assert.equal(s.sittings[0].skill, "Blacksmithing", "newest first, and the trivial one still names its skill");
  const brick = s.items.find((i) => i.item === "Ore Brick")!;
  assert.deepEqual(brick.levels.map((l) => [l.level, l.attempts]), [[59, 1], [60, 2]]);
});

test("a combine no sitting ever ties to a skill stays without one", () => {
  const s = craft([made(0, "Staff of the Wheel"), made(5, "Star of Eyes")]);
  assert.equal(s.items.find((i) => i.item === "Staff of the Wheel")?.skill, undefined);
  assert.equal(s.sittings[0].skill, undefined);
});

test("a combat skill-up neither joins the log nor ends a sitting", () => {
  const s = craft([made(0, "Sheet Metal"), up(1, 150, "Dual Wield"), up(2, 30)]);
  assert.equal(s.sittings[0].points, 1);
  assert.equal(s.items[0].skill, "Blacksmithing");
});
