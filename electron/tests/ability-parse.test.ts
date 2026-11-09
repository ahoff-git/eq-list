/**
 * Black-box tests for reading ability purchases out of the log (`parseAbility`, via the line parser that
 * routes it). Every positive line is verbatim from a real EQL log.
 * Only need re-running if `log-parser.ts` or `parse-line.ts` changes.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLine } from "../../src/shared/parse-line";

test("a new ability: its name and what it cost", () => {
  const e = parseLine('[Sat Nov 07 13:48:53 2026] You have gained the ability "Soul Abrasion" at a cost of 3 ability points.');
  assert.deepEqual(e && { kind: e.kind, ...("name" in e && { name: e.name, cost: e.cost }) }, { kind: "ability", name: "Soul Abrasion", cost: 3 });
  assert.equal(e?.at, "2026-11-07T13:48:53");
  assert.ok(e && !("rank" in e), "a new ability has no rank yet");
});

test("a rank bought: the number after the name is the rank, not part of the name", () => {
  const e = parseLine("[Tue Nov 03 16:48:53 2026] You have improved Jewel Craft Mastery 3 at a cost of 6 ability points.");
  assert.ok(e?.kind === "ability");
  assert.deepEqual([e.name, e.rank, e.cost], ["Jewel Craft Mastery", 3, 6]);
});

test("a free upgrade at a level-up is the same shape at a cost of 0", () => {
  const e = parseLine("[Sat Nov 07 23:19:02 2026] You have improved Unbound Companion 2 at a cost of 0 ability points.");
  assert.ok(e?.kind === "ability");
  assert.deepEqual([e.name, e.rank, e.cost], ["Unbound Companion", 2, 0]);
});

test("a toggle's name keeps its ': Enabled' — it is the toggle's, not a rank", () => {
  const e = parseLine("[Sat Nov 07 23:19:02 2026] You have improved Symphonic Aura: Enabled 2 at a cost of 0 ability points.");
  assert.ok(e?.kind === "ability");
  assert.deepEqual([e.name, e.rank], ["Symphonic Aura: Enabled", 2]);
});

test("one point is 'point', not 'points'", () => {
  const e = parseLine('[Sat Nov 07 13:48:53 2026] You have gained the ability "Quick Buff" at a cost of 1 ability point.');
  assert.ok(e?.kind === "ability");
  assert.equal(e.cost, 1);
});

test("earning a point is not spending one", () => {
  assert.equal(parseLine("[Sat Nov 07 22:58:26 2026] You have gained an ability point! You now have 3 ability points."), null);
});

test("the sentence in someone's chat is chat, not a purchase", () => {
  assert.equal(parseLine('[Sat Nov 07 13:48:53 2026] Bob tells you, \'You have gained the ability "Soul Abrasion" at a cost of 3 ability points.\''), null);
});

test("a level-up beside it is still a level", () => {
  assert.equal(parseLine("[Sun Nov 08 15:00:24 2026] You have gained a level! Welcome to level 32!")?.kind, "level");
});
