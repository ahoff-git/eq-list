/**
 * Tests for the inferred maximum-hit-points bounds. The log never states health, so
 * everything here is about squeezing it from what you survived and what killed you —
 * and, just as importantly, about *refusing* to infer from a window that healing, a
 * lull, or a buff change made meaningless.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHpEstimate } from "../hp-estimate";
import { parseCombat } from "../../src/shared/combat-parser";
import { splitLine } from "../../src/shared/log-parser";
import type { CombatEvent } from "../../src/shared/types";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-hp-"));
}

/** `sec` seconds past midnight as a real clock time. */
function clock(sec: number): string {
  return `00:${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function tracker(dir = tempDir()) {
  const hp = createHpEstimate(dir, () => "2026-07-29T01:00:00.000Z");
  hp.setPlayer("Kainos");
  return hp;
}

/** Feed log lines through the real parser, `sec` seconds past midnight. */
function feed(hp: ReturnType<typeof createHpEstimate>, lines: [sec: number, message: string][]): void {
  for (const [sec, message] of lines) {
    const event = parseCombat(splitLine(`[Wed Jul 29 ${clock(sec)} 2026] ${message}`, 1)!) as CombatEvent;
    assert.ok(event, `expected to parse: ${message}`);
    hp.record(event);
  }
}

test("nothing is claimed before any evidence", () => {
  const hp = tracker();
  assert.equal(hp.state().atLeast, 0);
  assert.equal(hp.state().atMost, undefined);
});

test("damage survived in one stretch sets the floor", () => {
  const hp = tracker();
  feed(hp, [
    [1, "A skeleton punches YOU for 40 points of damage."],
    [3, "A skeleton punches YOU for 30 points of damage."],
    [5, "A coyote bites YOU for 20 points of damage."],
    // A lull banks the window: you took 90 and lived, so you have more than 90.
    [40, "A coyote bites YOU for 5 points of damage."],
  ]);
  assert.equal(hp.state().atLeast, 90);
});

test("damage on other people is ignored", () => {
  const hp = tracker();
  feed(hp, [
    [1, "A skeleton punches Bunnyslayer for 400 points of damage."],
    [2, "A coyote bites Kainos`s warder for 300 points of damage."],
    [30, "A coyote bites YOU for 5 points of damage."],
  ]);
  assert.equal(hp.state().atLeast, 0);
});

test("a heal ends the floor window — you can absorb more than you have", () => {
  const hp = tracker();
  feed(hp, [
    [1, "A skeleton punches YOU for 60 points of damage."],
    [2, "Bunnyslayer healed Kainos for 50 hit points."],
    [3, "A skeleton punches YOU for 60 points of damage."],
    [40, "A coyote bites YOU for 1 point of damage."],
  ]);
  // 60 then 60, but healing in between: the most demonstrably survived is 60, not 120.
  assert.equal(hp.state().atLeast, 60);
});

test("a lull ends the window, because health regenerates in the gap", () => {
  const hp = tracker();
  feed(hp, [
    [1, "A skeleton punches YOU for 50 points of damage."],
    [30, "A skeleton punches YOU for 50 points of damage."], // 29s later: new window
    [60, "A coyote bites YOU for 1 point of damage."],
  ]);
  assert.equal(hp.state().atLeast, 50);
});

test("dying from full health sets the ceiling", () => {
  const hp = tracker();
  feed(hp, [
    // An overheal proves you finished full: the surplus had nowhere to go.
    [1, "Bunnyslayer healed Kainos for 5 (60) hit points."],
    [2, "Minotaur Lord hits YOU for 400 points of damage."],
    [4, "Minotaur Lord hits YOU for 380 points of damage."],
    [5, "You have been slain by Minotaur Lord!"],
  ]);
  assert.equal(hp.state().atMost, 780);
});

test("dying without a known-full start only raises the floor", () => {
  const hp = tracker();
  feed(hp, [
    [1, "Minotaur Lord hits YOU for 120 points of damage."],
    [2, "Minotaur Lord hits YOU for 200 points of damage."],
    [3, "You have been slain by Minotaur Lord!"],
  ]);
  // Nothing is known about the ceiling without a full-health start — and the floor counts
  // only the 120 you lived through, never the 200 that killed you.
  assert.equal(hp.state().atMost, undefined);
  assert.equal(hp.state().atLeast, 120);
});

test("the killing blow is never counted as damage survived", () => {
  // Overkill is the trap: a 900-point hit on a 100-point character would otherwise claim
  // a 900 floor.
  const hp = tracker();
  feed(hp, [
    [1, "A skeleton punches YOU for 30 points of damage."],
    [2, "Minotaur Lord hits YOU for 900 points of damage."],
    [3, "You have been slain by Minotaur Lord!"],
  ]);
  assert.equal(hp.state().atLeast, 30);
});

test("a respawn counts as full, so the next death gives a ceiling", () => {
  const hp = tracker();
  feed(hp, [
    [1, "A skeleton punches YOU for 10 points of damage."],
    [2, "You died."],
    // Back at full after respawning…
    [30, "Minotaur Lord hits YOU for 500 points of damage."],
    [32, "Minotaur Lord hits YOU for 450 points of damage."],
    [33, "You have been slain by Minotaur Lord!"],
  ]);
  // Full at respawn, then 950 of damage proved fatal → the maximum is at or below it.
  assert.equal(hp.state().atMost, 950);
  // …and 500 of that was demonstrably absorbed, which is the floor.
  assert.equal(hp.state().atLeast, 500);
});

test("healing between full and death is subtracted from the ceiling", () => {
  const hp = tracker();
  feed(hp, [
    [1, "Bunnyslayer healed Kainos for 5 (60) hit points."], // full
    [2, "Minotaur Lord hits YOU for 500 points of damage."],
    [3, "Bunnyslayer healed Kainos for 200 hit points."], // put 200 back
    [4, "Minotaur Lord hits YOU for 400 points of damage."],
    [5, "You have been slain by Minotaur Lord!"],
  ]);
  // 900 damage taken, but 200 was healed: only 700 net was needed to kill you.
  assert.equal(hp.state().atMost, 700);
});

test("the bounds converge from both sides", () => {
  const hp = tracker();
  feed(hp, [
    [1, "Bunnyslayer healed Kainos for 5 (60) hit points."],
    [2, "A skeleton punches YOU for 700 points of damage."],
    [20, "A coyote bites YOU for 1 point of damage."], // lull banks the 700 floor
    [40, "Bunnyslayer healed Kainos for 5 (60) hit points."],
    [41, "Minotaur Lord hits YOU for 800 points of damage."],
    [42, "You have been slain by Minotaur Lord!"],
  ]);
  const s = hp.state();
  assert.equal(s.atLeast, 700);
  assert.equal(s.atMost, 800);
});

test("one of your buffs fading discards the window; a pet's does not", () => {
  const hp = tracker();
  feed(hp, [
    [1, "A skeleton punches YOU for 100 points of damage."],
    [2, "Your pet's Burst of Strength spell has worn off."], // not yours — window survives
    [3, "A skeleton punches YOU for 100 points of damage."],
    [30, "A coyote bites YOU for 1 point of damage."],
  ]);
  assert.equal(hp.state().atLeast, 200);

  const mine = tracker();
  feed(mine, [
    [1, "A skeleton punches YOU for 100 points of damage."],
    [2, "Your Turtle Skin spell has worn off."], // your maximum just changed
    [3, "A skeleton punches YOU for 100 points of damage."],
    [30, "A coyote bites YOU for 1 point of damage."],
  ]);
  assert.equal(mine.state().atLeast, 100);
});

test("a fading buff also voids the known-full anchor, so no ceiling is claimed", () => {
  const hp = tracker();
  feed(hp, [
    [1, "Bunnyslayer healed Kainos for 5 (60) hit points."], // full…
    [2, "Your Turtle Skin spell has worn off."], // …but the maximum moved
    [3, "Minotaur Lord hits YOU for 300 points of damage."],
    [4, "You have been slain by Minotaur Lord!"],
  ]);
  assert.equal(hp.state().atMost, undefined);
});

test("stated regeneration is discounted from a long window", () => {
  // A sustained fight: hits every 8s, so nothing breaks the window, and it runs 32s —
  // five ~6s ticks. At 10 a tick that's 50 health that came back, so 300 absorbed only
  // proves 250. Without a stated rate, nothing is assumed.
  const fight: [number, string][] = [
    [1, "A skeleton punches YOU for 60 points of damage."],
    [9, "A skeleton punches YOU for 60 points of damage."],
    [17, "A skeleton punches YOU for 60 points of damage."],
    [25, "A skeleton punches YOU for 60 points of damage."],
    [33, "A skeleton punches YOU for 60 points of damage."],
    [80, "A coyote bites YOU for 1 point of damage."], // the lull banks the window
  ];

  const blind = tracker();
  feed(blind, fight);
  assert.equal(blind.state().atLeast, 300);

  const informed = tracker();
  informed.setRegen(10);
  feed(informed, fight);
  assert.equal(informed.state().atLeast, 250);
  assert.equal(informed.state().regenPerTick, 10);
});

test("regeneration is discounted from the ceiling too", () => {
  const hp = tracker();
  hp.setRegen(10);
  feed(hp, [
    [1, "Bunnyslayer healed Kainos for 5 (60) hit points."], // full
    [2, "Minotaur Lord hits YOU for 400 points of damage."],
    [32, "Minotaur Lord hits YOU for 400 points of damage."], // 30s later: five ticks
    [33, "You have been slain by Minotaur Lord!"],
  ]);
  // 800 damage killed you, but ~50 ticked back on the way, so 750 was enough.
  assert.equal(hp.state().atMost, 750);
});

test("a stated regeneration of zero is treated as unknown, not as none", () => {
  const hp = tracker();
  hp.setRegen(0);
  assert.equal(hp.state().regenPerTick, undefined);
});

test("levelling up discards everything, including a stated figure", () => {
  const hp = tracker();
  feed(hp, [[1, "A skeleton punches YOU for 300 points of damage."]]);
  hp.set(900);
  hp.levelUp(15);

  const s = hp.state();
  assert.equal(s.atLeast, 0);
  assert.equal(s.atMost, undefined);
  assert.equal(s.stated, undefined);
  assert.equal(s.level, 15);
});

test("the player's own figure is kept alongside the evidence", () => {
  const hp = tracker();
  feed(hp, [
    [1, "A skeleton punches YOU for 100 points of damage."],
    [30, "A coyote bites YOU for 1 point of damage."],
  ]);
  hp.set(850);
  assert.equal(hp.state().stated, 850);
  assert.equal(hp.state().atLeast, 100); // the inference is still there to disagree with
});

test("a floor above the ceiling drops the stale ceiling", () => {
  // Buffs the log never announced can leave an impossible ceiling behind. What you
  // demonstrably survived is the more trustworthy of the two.
  const hp = tracker();
  feed(hp, [
    [1, "Bunnyslayer healed Kainos for 5 (60) hit points."],
    [2, "Minotaur Lord hits YOU for 300 points of damage."],
    [3, "You have been slain by Minotaur Lord!"], // ceiling 300
    [40, "A skeleton punches YOU for 500 points of damage."],
    [80, "A coyote bites YOU for 1 point of damage."], // floor 500 — impossible together
  ]);
  const s = hp.state();
  assert.equal(s.atLeast, 500);
  assert.equal(s.atMost, undefined);
});

test("the estimate survives a restart", () => {
  const dir = tempDir();
  const first = tracker(dir);
  feed(first, [
    [1, "A skeleton punches YOU for 120 points of damage."],
    [40, "A coyote bites YOU for 1 point of damage."],
  ]);
  first.set(700);
  first.flush();

  const reopened = createHpEstimate(dir);
  assert.equal(reopened.state().atLeast, 120);
  assert.equal(reopened.state().stated, 700);
});

test("a corrupt file is survivable", () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, "hp-estimate.json"), "{nope");
  assert.equal(createHpEstimate(dir).state().atLeast, 0);
});

// A camp chains pull after pull with gaps under the idle cut, so an "unhealed stretch" can run
// for minutes — and you regenerate throughout. Summing it claims you absorbed the lot on one
// health bar; a real log produced "survived at least 815" that way, for a level 2 character.
test("a stretch too long to be one health bar is discarded, not banked", () => {
  const long: [number, string][] = [];
  for (let sec = 1; sec <= 91; sec += 5) long.push([sec, "A skeleton punches YOU for 20 points of damage."]);
  long.push([200, "A coyote bites YOU for 1 point of damage."]); // the lull tries to bank it

  const hp = tracker();
  feed(hp, long);
  assert.equal(hp.state().atLeast, 0, "90 seconds of chained pulls proves nothing about the maximum");
});

test("…but a stretch inside the limit still counts", () => {
  const hp = tracker();
  const fight: [number, string][] = [];
  for (let sec = 1; sec <= 41; sec += 8) fight.push([sec, "A skeleton punches YOU for 20 points of damage."]);
  fight.push([200, "A coyote bites YOU for 1 point of damage."]); // the lull banks a 40s window
  feed(hp, fight);
  assert.equal(hp.state().atLeast, 120);
});

// A floor could only ever rise, so one reading from a fight the game kept you alive through
// was permanent — and could sit above a ceiling measured from an actual death.
test("a measured ceiling below the floor discards the floor rather than itself", () => {
  const hp = tracker();
  feed(hp, [
    // A scripted mauling: 300 absorbed inside the window, survived.
    [1, "Minotaur Lord hits YOU for 150 points of damage."],
    [3, "Minotaur Lord hits YOU for 150 points of damage."],
    [5, "You healed Kainos for 1 (99) hit points."], // overheal → banks the floor, anchors full
  ]);
  assert.equal(hp.state().atLeast, 300);

  // Then, from that known-full anchor, 90 damage is fatal — so the maximum is at most 90.
  feed(hp, [
    [7, "A skeleton punches YOU for 90 points of damage."],
    [8, "You have been slain by a skeleton!"],
  ]);
  assert.equal(hp.state().atMost, 90);
  assert.equal(hp.state().atLeast, 0, "the floor was the unsound half and is dropped");
});
