/**
 * Black-box tests for when a stats read has stopped being true (`src/shared/items/stats-drift.ts`).
 *
 * The cases are the real ones from a player's log: level 32 arriving at 15:00:24 between two reads, and
 * `Symphonic Aura: Enabled` repeating at no cost.
 * Only need re-running if that module or `stat-buffs.ts` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  basisChange,
  basisOf,
  driftLabel,
  driftReasons,
  movesBetween,
  noteChange,
  noteMoves,
  type BoardEntry,
  type BuffMove,
  type StatChange,
  type StatsStamp,
} from "../../src/shared/items/stats-drift";

/** The log's clock, as the app stores it: ISO with no zone. */
const t = (clock: string) => `2026-11-08T${clock}`;
const READ_AT = Date.parse(t("14:39:19"));
const stamp = (over: Partial<StatsStamp> = {}): StatsStamp => ({ at: READ_AT, basis: basisOf("HUM", ["Wizard", "Druid", "Magician"], 60), ...over });
const reasons = (over: { changes?: StatChange[]; moves?: BuffMove[]; basisNow?: ReturnType<typeof basisOf>; stamp?: StatsStamp } = {}) =>
  driftReasons({ stamp: over.stamp ?? stamp(), changes: over.changes ?? [], moves: over.moves ?? [], basisNow: over.basisNow });
const move = (clock: string, spell: string, up: boolean): BuffMove => ({ at: t(clock), key: spell.toLowerCase(), spell, up });

// ── nothing happened ──

test("with nothing newer than the read, there is nothing to say", () => {
  assert.deepEqual(reasons(), []);
  assert.deepEqual(reasons({ changes: [{ at: t("14:00:00"), kind: "level", level: 31 }], moves: [move("14:10:00", "Skin like Wood", false)] }), [], "everything before the read is in the read");
});

// ── levels ──

test("a level after the read is a reason, and says which", () => {
  const [r] = reasons({ changes: [{ at: t("15:00:24"), kind: "level", level: 32 }] });
  assert.deepEqual([r.kind, r.short, r.text], ["level", "level up", "reached level 32"]);
});

test("several levels are one reason with a count", () => {
  const [r] = reasons({ changes: [{ at: t("15:00:24"), kind: "level", level: 32 }, { at: t("16:00:00"), kind: "level", level: 33 }] });
  assert.equal(r.text, "gained 2 levels (now 33)");
});

test("a level line that names no number is still a level", () => {
  assert.equal(reasons({ changes: [{ at: t("15:00:24"), kind: "level" }] })[0].text, "gained a level");
});

test("a level that is only a lower per-class number still counts — EQL levels each class", () => {
  const [r] = reasons({ changes: [{ at: t("15:00:24"), kind: "level", level: 13 }] });
  assert.equal(r.kind, "level");
});

// ── abilities ──

test("a stat-moving ability bought after the read is a reason; the same one ranked up twice is named once", () => {
  const [r] = reasons({
    changes: [
      { at: t("15:01:00"), kind: "ability", name: "Innate Eminence", rank: 1 },
      { at: t("15:02:00"), kind: "ability", name: "Innate Eminence", rank: 2 },
    ],
  });
  assert.deepEqual([r.kind, r.text], ["ability", "bought Innate Eminence"]);
});

test("an ability that moves no stat, and a free toggle, are not reasons", () => {
  assert.deepEqual(
    reasons({
      changes: [
        { at: t("15:01:00"), kind: "ability", name: "Mental Clarity", rank: 2 },
        { at: t("15:01:05"), kind: "ability", name: "Symphonic Aura: Enabled", rank: 2 },
      ],
    }),
    [],
  );
});

test("several abilities are listed, the long list cut short", () => {
  const names = ["Innate Eminence", "Natural Durability", "Innate Spell Resistance", "Combat Stability", "Unbound Strikethrough"];
  const [r] = reasons({ changes: names.map((name, i) => ({ at: t(`15:0${i}:00`), kind: "ability" as const, name })) });
  assert.match(r.text, /^bought Innate Eminence, Natural Durability, Innate Spell Resistance and 2 more$/);
});

// ── buffs, then against now ──

test("a stat buff that fades after the read is a reason, even one the board never saw land", () => {
  // A fade is proof it was up — which is what the read captured.
  const [r] = reasons({ moves: [move("15:20:00", "Skin like Wood", false)] });
  assert.deepEqual([r.kind, r.text], ["buffs", "Skin like Wood has gone"]);
});

test("a buff that fades and is recast is the same as it was: no reason at all", () => {
  assert.deepEqual(reasons({ moves: [move("14:00:00", "Skin like Wood", true), move("15:20:00", "Skin like Wood", false), move("15:21:00", "Skin like Wood", true)] }), []);
});

test("…but while it is down, it is a reason — and it heals itself when it comes back", () => {
  const down = [move("14:00:00", "Skin like Wood", true), move("15:20:00", "Skin like Wood", false)];
  assert.equal(reasons({ moves: down }).length, 1);
  assert.equal(reasons({ moves: [...down, move("15:25:00", "Skin like Wood", true)] }).length, 0);
});

test("a new stat buff after the read is a reason", () => {
  const [r] = reasons({ moves: [move("15:20:00", "Spirit of Cat", true)] });
  assert.equal(r.text, "Spirit of Cat is up that wasn't");
});

test("a buff cast and gone again entirely after the read changed nothing", () => {
  assert.deepEqual(reasons({ moves: [move("15:20:00", "Spirit of Cat", true), move("15:50:00", "Spirit of Cat", false)] }), []);
});

test("a buff that was up at the read and is still up after a refresh is not a reason", () => {
  assert.deepEqual(reasons({ moves: [move("14:00:00", "Skin like Wood", true), move("15:20:00", "Skin like Wood", true)] }), []);
});

test("gone and new together are said together", () => {
  const [r] = reasons({ moves: [move("15:20:00", "Skin like Wood", false), move("15:21:00", "Spirit of Cat", true)] });
  assert.equal(r.text, "Skin like Wood has gone; Spirit of Cat is up that wasn't");
});

// ── the plan's own inputs ──

test("basis is the race, the classes in any order, and the level", () => {
  assert.deepEqual(basisOf("HUM", ["Wizard", "Druid"], 60), basisOf("HUM", ["druid", "WIZARD"], 60));
  assert.equal(basisChange(basisOf("HUM", ["Wizard"], 60), basisOf("HUM", ["Wizard"], 60)), null);
});

test("ticking a race after a read is a change — the offset was measured with no race's attributes in it", () => {
  const text = basisChange(basisOf(undefined, ["Wizard"], 60), basisOf("HUM", ["Wizard"], 60));
  assert.match(text!, /^your race changed/);
});

test("classes and level changes say so, in the planner's words", () => {
  assert.match(basisChange(basisOf("HUM", ["Wizard"], 60), basisOf("HUM", ["Wizard", "Druid"], 60))!, /^your classes changed/);
  assert.match(basisChange(basisOf("HUM", ["Wizard"], 60), basisOf("HUM", ["Wizard"], 32))!, /the planner's level \(60 → 32\) changed/);
  assert.match(basisChange(basisOf(undefined, ["Wizard"], 60), basisOf("HUM", ["Wizard", "Druid"], 32))!, /^your race and your classes and the planner's level/);
});

test("a changed basis is a reason, first", () => {
  const r = reasons({ basisNow: basisOf("DWF", ["Wizard", "Druid", "Magician"], 60), changes: [{ at: t("15:00:24"), kind: "level", level: 32 }] });
  assert.deepEqual(r.map((x) => x.kind), ["basis", "level"]);
});

test("an unchanged basis, or none given, says nothing", () => {
  assert.deepEqual(reasons({ basisNow: stamp().basis }), []);
  assert.deepEqual(reasons({}), []);
});

// ── the pill's words ──

test("the pill says the first couple of reasons and counts the rest", () => {
  const all = reasons({
    basisNow: basisOf("DWF", ["Wizard"], 32),
    changes: [{ at: t("15:00:24"), kind: "level", level: 32 }, { at: t("15:01:00"), kind: "ability", name: "Innate Eminence" }],
    moves: [move("15:20:00", "Skin like Wood", false)],
  });
  assert.equal(all.length, 4);
  assert.equal(driftLabel(all), "Re-read your stats · race/class/level changed · level up · +2");
  assert.equal(driftLabel(all.slice(1, 2)), "Re-read your stats · level up");
});

// ── journals ──

test("a change is noted once however many times the log is read, and the journal stays in order", () => {
  const level = { at: t("15:00:24"), kind: "level", level: 32 } as const;
  let journal = noteChange([], { at: t("16:00:00"), kind: "level", level: 33 });
  journal = noteChange(journal, level);
  journal = noteChange(journal, level);
  assert.deepEqual(journal.map((c) => c.at), [t("15:00:24"), t("16:00:00")]);
});

test("the change journal is capped, oldest dropped", () => {
  let journal: StatChange[] = [];
  for (let i = 0; i < 5; i++) journal = noteChange(journal, { at: t(`1${i}:00:00`), kind: "level", level: i }, 3);
  assert.deepEqual(journal.map((c) => c.at), [t("12:00:00"), t("13:00:00"), t("14:00:00")]);
});

test("buff moves dedupe the same move at the same moment", () => {
  const a = move("15:20:00", "Skin like Wood", false);
  assert.equal(noteMoves(noteMoves([], [a]), [a, a]).length, 1);
  assert.equal(noteMoves([a], [move("15:20:00", "Skin like Wood", true)]).length, 2, "the same moment, the other way, is another move");
});

// ── watching the board ──

const entry = (spell: string, up: boolean, clock: string): BoardEntry => ({ key: spell.toLowerCase(), spell, up, at: t(clock) });

test("a new row, a flipped row and a refreshed row are moves; an unchanged one and a vanished one are not", () => {
  const before = [entry("Skin like Wood", true, "14:00:00"), entry("Spirit of Cat", true, "14:00:00"), entry("Resist Fire", true, "14:00:00"), entry("Clarity", true, "14:00:00")];
  const after = [
    entry("Skin like Wood", false, "15:20:00"), // faded
    entry("Spirit of Cat", true, "15:21:00"), // refreshed
    entry("Resist Fire", true, "14:00:00"), // untouched
    entry("Aegolism", true, "15:22:00"), // new
    // Clarity left the board — dismissed or forgotten; nothing happened to you
  ];
  assert.deepEqual(movesBetween(before, after).map((m) => `${m.spell}:${m.up ? "up" : "down"}`), ["Skin like Wood:down", "Spirit of Cat:up", "Aegolism:up"]);
});

test("a moves list carries the board's own moment, not the time it was noticed", () => {
  const [m] = movesBetween([], [entry("Skin like Wood", false, "15:20:00")]);
  assert.equal(m.at, t("15:20:00"));
});
