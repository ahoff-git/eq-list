/**
 * Tests for what gets recorded as a kill, where it gets placed, and how much the placement is
 * trusted. The whole point is honesty about a guess: EQ only reports a position when the player
 * asks it to, and it reports every death in earshot rather than only yours — so these pin the
 * *confidence* and *ownership* rules as much as the arithmetic.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createKillLog, type KillLog } from "../kill-log";
import type { CoinEvent, LocEvent, LootEvent } from "../../src/shared/types";

const ZONE = "Steamfont Mountains";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-kills-"));
}

/** `sec` seconds past midnight, as the parsers write timestamps. */
function stamp(sec: number): string {
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  return `2026-07-29T00:${mm}:${String(sec % 60).padStart(2, "0")}`;
}

function loc(y: number, x: number, sec: number): LocEvent {
  return { kind: "loc", y, x, z: 0, logId: 1, raw: "Your Location is", at: stamp(sec) };
}

function looted(item: string, source: string, sec: number): LootEvent {
  return { kind: "loot", item, qty: 1, source, fate: "kept", logId: 1, raw: "looted", at: stamp(sec) };
}

function coin(copper: number, sec: number, from: CoinEvent["from"] = "corpse"): CoinEvent {
  return { kind: "coin", from, copper, logId: 1, raw: "You receive", at: stamp(sec) };
}

/** A kill by you, which is what most of these are about. */
function kill(k: KillLog, mob: string, sec: number, zone: string | null = ZONE): void {
  k.record(mob, "You", zone, stamp(sec), sec);
}

test("a kill with no position yet is still recorded, with no confidence", () => {
  const k = createKillLog(tempDir());
  kill(k, "a coyote", 10);

  const [only] = k.kills();
  assert.equal(only.mob, "a coyote");
  assert.equal(only.y, undefined);
  assert.equal(only.confidence, 0);
});

test("a fresh fix from a stationary player is trusted completely", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(100, 200, 10), ZONE);
  k.noteLoc(loc(100, 200, 20), ZONE); // same spot: parked
  kill(k, "a coyote", 25);

  const [only] = k.kills();
  assert.equal(only.y, 100);
  assert.equal(only.x, 200);
  assert.equal(only.fixAgeSec, 5);
  assert.equal(only.speed, 0);
  assert.equal(only.confidence, 1);
});

test("confidence decays as the fix goes stale, and is gone past the horizon", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(0, 0, 0), ZONE);
  kill(k, "mid", 35); // 35s old: partway down
  kill(k, "stale", 90); // past a minute: don't plot as fact

  const [stale, mid] = k.kills(); // newest first
  assert.ok(mid.confidence > 0 && mid.confidence < 1, `expected a middling score, got ${mid.confidence}`);
  assert.equal(stale.confidence, 0);
  // Both are still recorded — the position is kept even when it isn't to be believed.
  assert.equal(stale.y, 0);
});

test("a player who was moving is trusted less than one who was parked", () => {
  const moving = createKillLog(tempDir());
  moving.noteLoc(loc(0, 0, 0), ZONE);
  moving.noteLoc(loc(300, 0, 10), ZONE); // covered ground
  kill(moving, "a coyote", 12);

  const parked = createKillLog(tempDir());
  parked.noteLoc(loc(0, 0, 0), ZONE);
  parked.noteLoc(loc(0, 0, 10), ZONE);
  kill(parked, "a coyote", 12);

  assert.equal(moving.kills()[0].speed, 30); // 300 units in 10s
  assert.ok(
    moving.kills()[0].confidence < parked.kills()[0].confidence,
    "movement should cost confidence",
  );
});

// A slow shuffle used to round to "speed 0" and read as parked — a real /loc pair 149 units
// apart over 23 minutes scored as a stationary camp. Distance decides, not rounded speed.
test("a slow crawl still counts as movement, however small the rounded speed", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(0, 0, 0), ZONE);
  k.noteLoc(loc(60, 0, 600), ZONE); // 60 units in 10 minutes — 0.1 units/s
  kill(k, "a coyote", 605);

  const [only] = k.kills();
  assert.equal(only.speed, 0, "the displayed speed does round to zero");
  assert.ok(only.confidence < 1, "but it should not be credited as a parked player");
});

test("a moving player gets a dead-reckoned guess as well as the raw fix", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(0, 0, 0), ZONE);
  k.noteLoc(loc(100, 50, 10), ZONE); // 10 units/s north, 5 east
  kill(k, "a coyote", 14); // 4s past the fix

  const [only] = k.kills();
  assert.equal(only.y, 100); // the fix itself, untouched
  assert.equal(only.guessedY, 140); // …and where the course would have taken them
  assert.equal(only.guessedX, 70);
  assert.equal(only.movedUnits, 112);
});

test("a stationary player gets no guess — there's no course to extend", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(10, 10, 0), ZONE);
  k.noteLoc(loc(10, 10, 10), ZONE);
  kill(k, "a coyote", 12);
  assert.equal(k.kills()[0].guessedY, undefined);
});

test("kills can be read back per zone, newest first", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(1, 1, 0), "Ak'Anon");
  kill(k, "first", 1, "Ak'Anon");
  kill(k, "second", 2, ZONE);
  kill(k, "third", 3, "Ak'Anon");

  assert.deepEqual(
    k.kills("Ak'Anon").map((x) => x.mob),
    ["third", "first"],
  );
  assert.equal(k.kills().length, 3);
});

// The zone a map draws is one place, however hard the door was set (ADR 0059). Asking the map's
// name for it — no article, no number, no ruleset — has to reach every variant's kills.
test("a zone's difficulty variants read back as one zone", () => {
  const k = createKillLog(tempDir());
  kill(k, "first", 1, "The Steamfont Mountains");
  kill(k, "second", 2, "The Steamfont Mountains 2 (Adaptive)");
  kill(k, "third", 3, "Steamfont Mountains 3");
  kill(k, "elsewhere", 4, "Ak'Anon");

  assert.deepEqual(
    k.kills(ZONE).map((x) => x.mob),
    ["third", "second", "first"],
  );
  // The record keeps the log's own wording — the fold is in the question, not the answer.
  assert.equal(k.kills(ZONE)[0].zone, "Steamfont Mountains 3");
  // Folding must not turn the query into a substring match: a zone is not its neighbour.
  assert.deepEqual(k.kills("Ak'Anon").map((x) => x.mob), ["elsewhere"]);
});

// The name the map window asks with is usually a map pack's label, not the log's wording — so a pack
// that spells the forest with one x has to reach an evening recorded with two (ADR 0075).
test("a zone asked for a letter out still answers with its kills", () => {
  const k = createKillLog(tempDir());
  kill(k, "a kerran", 1, "Toxxulia Forest");
  kill(k, "elsewhere", 2, "East Commonlands");

  assert.deepEqual(k.kills("Toxulia Forest").map((x) => x.mob), ["a kerran"]);
  // And the looseness stops at a misspelling: two real zones are still two zones.
  assert.deepEqual(k.kills("West Commonlands").map((x) => x.mob), []);
});

// Zoning teleports you, and stepping between two difficulties of one zone is no exception: you
// arrive at the zone-in point, so the fix you took on the other side is wrong rather than stale.
test("a fix from another difficulty of the same zone can't place a kill", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(100, 200, 0), "Steamfont Mountains");
  kill(k, "a rat", 1, "Steamfont Mountains 2 (Adaptive)");

  const [only] = k.kills();
  assert.equal(only.y, undefined);
  assert.equal(only.confidence, 0);
});

test("the log survives a restart, and a corrupt file is not fatal", () => {
  const dir = tempDir();
  const first = createKillLog(dir);
  first.noteLoc(loc(5, 5, 0), "Ak'Anon");
  kill(first, "a coyote", 2, "Ak'Anon");
  first.flush();
  assert.equal(createKillLog(dir).kills().length, 1);

  const broken = tempDir();
  fs.writeFileSync(path.join(broken, "kill-log.json"), "{nope");
  assert.deepEqual(createKillLog(broken).kills(), []);
});

// ── whose kill was it ──

test("your own pet dying is not a kill", () => {
  const k = createKillLog(tempDir());
  k.setPlayer("Kainos");
  k.record("Kainos`s warder", "a kobold", ZONE, stamp(10), 1);
  k.record("Kainos", "a kobold", ZONE, stamp(20), 2); // and neither is your own death
  kill(k, "a kobold", 30);

  assert.deepEqual(
    k.kills().map((x) => x.mob),
    ["a kobold"],
  );
});

// Records filed before the killer was captured include your pet's deaths. Learning your name
// is the first moment they can be recognised, so that's when they go.
test("your own deaths already in the log are dropped once your name is known", () => {
  const dir = tempDir();
  const first = createKillLog(dir);
  first.record("Kainos`s warder", "a kobold", ZONE, stamp(10), 1); // no player set yet
  kill(first, "a kobold", 20);
  first.flush();

  const second = createKillLog(dir);
  assert.equal(second.kills().length, 2, "both are there until we know who you are");
  second.setPlayer("Kainos");
  assert.deepEqual(
    second.kills().map((k) => k.mob),
    ["a kobold"],
  );
});

test("someone else's kill is recorded, but marked as theirs", () => {
  const k = createKillLog(tempDir());
  k.setPlayer("Kainos");
  kill(k, "a kobold", 10);
  k.record("a kobold", "Bunnyslayer", ZONE, stamp(20), 2);

  const [theirs, mine] = k.kills();
  assert.equal(mine.mine, true);
  assert.equal(mine.killer, "You");
  assert.equal(theirs.mine, false);
  assert.equal(theirs.killer, "Bunnyslayer");
});

test("your pet's kill is yours", () => {
  const k = createKillLog(tempDir());
  k.setPlayer("Kainos");
  k.record("a kobold", "Kainos`s warder", ZONE, stamp(10), 1);
  assert.equal(k.kills()[0].mine, true);
});

test("someone else's kill is placed less confidently — your /loc was about you", () => {
  const k = createKillLog(tempDir());
  k.setPlayer("Kainos");
  k.noteLoc(loc(50, 50, 0), ZONE);
  k.noteLoc(loc(50, 50, 5), ZONE); // parked, fresh fix: as good as it gets
  kill(k, "a kobold", 8);
  k.record("a kobold", "Bunnyslayer", ZONE, stamp(9), 9);

  const [theirs, mine] = k.kills();
  assert.equal(mine.confidence, 1);
  assert.equal(theirs.confidence, 0.5);
  assert.equal(theirs.y, 50, "the position is still recorded, just believed less");
});

// ── one mob, one name ──

test("the two spellings EQ gives a mob become one name", () => {
  const k = createKillLog(tempDir());
  kill(k, "rogue clockwork", 10); // "You have slain a rogue clockwork!"
  k.record("Rogue clockwork", "Jarn", ZONE, stamp(20), 2); // "Rogue clockwork has been slain by…"

  assert.deepEqual(new Set(k.kills().map((x) => x.mob)), new Set(["rogue clockwork"]));
});

test("the canonical spelling survives a restart", () => {
  const dir = tempDir();
  const first = createKillLog(dir);
  kill(first, "obsolete model", 10);
  first.flush();

  const second = createKillLog(dir);
  kill(second, "Obsolete model", 20);
  assert.deepEqual(new Set(second.kills().map((x) => x.mob)), new Set(["obsolete model"]));
});

// ── placing a kill after zoning ──

test("a fix from the zone you just left does not place a kill in the new one", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(500, 500, 0), "The Steamfont Mountains");
  kill(k, "a kerran", 5, "Kerra Isle"); // zoned, no /loc since

  const [only] = k.kills();
  assert.equal(only.y, undefined, "a Steamfont position says nothing about Kerra Isle");
  assert.equal(only.confidence, 0);
});

// From a real log: the app started mid-session, the catch-up found a `/loc` but no zone line
// (`log-watcher.ts`), and that zone-less fix went on to place nine Kerra Isle kills at a Steamfont
// camp's exact coordinates — three minutes after zoning, on a 47-minute-old fix. "We don't know
// where this was" is not "this was everywhere".
test("a fix taken before the zone was known can't place a kill in a named zone", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(-420, 1757, 0), null);
  kill(k, "a kerran", 5, "Kerra Isle");

  const [only] = k.kills();
  assert.equal(only.y, undefined);
  assert.equal(only.confidence, 0);
});

test("a zone-less fix still places a kill whose zone is equally unknown", () => {
  // Same state, not a guess across one: neither says which zone, so the fix is the best there is.
  const k = createKillLog(tempDir());
  k.noteLoc(loc(10, 20, 0), null);
  kill(k, "something", 5, null);

  const [only] = k.kills();
  assert.deepEqual([only.y, only.x], [10, 20]);
});

test("zoning back makes the old fix usable again, aged as usual", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(500, 500, 0), ZONE);
  kill(k, "a kerran", 5, "Kerra Isle");
  kill(k, "a kobold", 8, ZONE);

  const [back] = k.kills();
  assert.equal(back.mob, "a kobold");
  assert.equal(back.y, 500);
});

// ── which corpse a drop came from ──

test("identical drops spread across the corpses that could have given them", () => {
  const k = createKillLog(tempDir());
  kill(k, "minotaur slaver", 10);
  kill(k, "minotaur slaver", 20);
  k.noteLoot(looted("Minotaur Blood", "minotaur slaver", 30));
  k.noteLoot(looted("Minotaur Blood", "minotaur slaver", 31));

  const [second, first] = k.kills();
  assert.deepEqual(first.drops, ["Minotaur Blood"]);
  assert.deepEqual(second.drops, ["Minotaur Blood"], "the older corpse should not be left empty");
});

test("a corpse that really gave two of something keeps both", () => {
  const k = createKillLog(tempDir());
  kill(k, "a rock spider", 10);
  k.noteLoot(looted("Spiderling Silk", "a rock spider", 14));
  k.noteLoot(looted("Spiderling Silk", "a rock spider", 15));

  assert.deepEqual(k.kills()[0].drops, ["Spiderling Silk", "Spiderling Silk"]);
});

test("different items from one corpse all attach to it", () => {
  const k = createKillLog(tempDir());
  kill(k, "a kobold", 10);
  k.noteLoot(looted("Bone Chips", "a kobold", 12));
  k.noteLoot(looted("Rusty Dagger", "a kobold", 13));

  assert.deepEqual(k.kills()[0].drops, ["Bone Chips", "Rusty Dagger"]);
});

test("a drop from a corpse nobody killed recently is dropped on the floor", () => {
  const k = createKillLog(tempDir());
  kill(k, "a kobold", 10);
  k.noteLoot(looted("Bone Chips", "a coyote", 12)); // never killed a coyote
  assert.equal(k.kills()[0].drops, undefined);
});

test("clearing the log forgets where the player was, too", () => {
  const k = createKillLog(tempDir());
  k.noteLoc(loc(100, 100, 0), ZONE);
  kill(k, "a kobold", 5);
  k.clear();
  kill(k, "a kobold", 8);

  const [only] = k.kills();
  assert.equal(only.y, undefined, "a cleared log shouldn't place the next kill from old evidence");
});

// ── eating a log twice changes nothing (dedup) ──
// A kill/loot line's identity is the line itself, so a re-import — or a log eaten after it was
// watched live — records each real event exactly once. record()/noteLoot() say whether they
// actually added, so an importer can report only what was new.

test("the same kill line read twice records one kill", () => {
  const k = createKillLog(tempDir());
  assert.equal(k.record("a kobold", "You", ZONE, stamp(10), 1), true);
  assert.equal(k.record("a kobold", "You", ZONE, stamp(10), 1), false, "the replay is a no-op");
  assert.equal(k.kills().length, 1);
});

test("two real kills of the same mob a second apart are both kept", () => {
  const k = createKillLog(tempDir());
  assert.equal(k.record("a kobold", "You", ZONE, stamp(10), 1), true);
  assert.equal(k.record("a kobold", "You", ZONE, stamp(11), 2), true, "a different line, a real kill");
  assert.equal(k.kills().length, 2);
});

test("the same loot line read twice adds one drop", () => {
  const k = createKillLog(tempDir());
  kill(k, "a kobold", 10);
  assert.equal(k.noteLoot(looted("Bone Chips", "a kobold", 12)), true);
  assert.equal(k.noteLoot(looted("Bone Chips", "a kobold", 12)), false, "same line, no second drop");
  assert.deepEqual(k.kills()[0].drops, ["Bone Chips"]);
});

test("re-eating the same sequence changes nothing, even across a restart", () => {
  const dir = tempDir();
  const first = createKillLog(dir);
  first.record("a kobold", "You", ZONE, stamp(10), 1);
  first.noteLoot(looted("Bone Chips", "a kobold", 12));
  first.flush();

  const again = createKillLog(dir); // keys were persisted, so the replay recognises both lines
  assert.equal(again.record("a kobold", "You", ZONE, stamp(10), 1), false, "kill already known");
  assert.equal(again.noteLoot(looted("Bone Chips", "a kobold", 12)), false, "drop already known");
  assert.equal(again.kills().length, 1);
  assert.deepEqual(again.kills()[0].drops, ["Bone Chips"]);
});

test("a drop already on a pre-keying corpse is not duplicated by a re-read", () => {
  const dir = tempDir();
  // Data stored before loot keys existed: a corpse holding a drop but no dropKeys to prove it.
  fs.writeFileSync(
    path.join(dir, "kill-log.json"),
    JSON.stringify({
      kills: [
        { id: "x", logId: 1, at: stamp(10), mob: "a kobold", killer: "You", mine: true, confidence: 0, drops: ["Bone Chips"] },
      ],
    }),
  );
  const k = createKillLog(dir);
  assert.equal(k.noteLoot(looted("Bone Chips", "a kobold", 12)), false, "a re-read of a known drop");
  assert.deepEqual(k.kills()[0].drops, ["Bone Chips"], "the rate isn't inflated by the replay");
});

// ── coin off a corpse ──
//
// Harder than a drop: the line names nothing at all, so these pin *which corpse gets credited*
// and — the part that would quietly corrupt every figure — which coin isn't a mob's at all.

test("coin off a corpse is credited to the mob that died", () => {
  const k = createKillLog(tempDir());
  kill(k, "a kobold", 10);
  assert.equal(k.noteCoin(coin(32, 12)), true);
  assert.equal(k.kills()[0].coin, 32);
});

test("an auto-sold item's coin is not the mob's money", () => {
  const k = createKillLog(tempDir());
  kill(k, "a kobold", 10);
  assert.equal(k.noteCoin(coin(4, 12, "item")), false, "the loot line already priced it");
  assert.equal(k.kills()[0].coin, undefined);
});

test("coin follows the corpse you were just looting, not merely the newest kill", () => {
  const k = createKillLog(tempDir());
  kill(k, "a kobold", 10);
  kill(k, "a gnoll", 20); // died later, so it's the newest corpse…
  k.noteLoot(looted("Bone Chips", "a kobold", 24)); // …but the kobold is the one being looted
  k.noteCoin(coin(50, 25));

  const byMob = new Map(k.kills().map((x) => [x.mob, x.coin]));
  assert.equal(byMob.get("a kobold"), 50, "the item line names the corpse the coin came off");
  assert.equal(byMob.get("a gnoll"), undefined);
});

test("with nothing being looted, coin goes to the newest kill of yours", () => {
  const k = createKillLog(tempDir());
  k.setPlayer("Kainos");
  kill(k, "a kobold", 10);
  k.record("a gnoll", "Bunnyslayer", ZONE, stamp(20), 2); // a stranger's corpse, never yours to loot
  k.noteCoin(coin(50, 22));

  const byMob = new Map(k.kills().map((x) => [x.mob, x.coin]));
  assert.equal(byMob.get("a kobold"), 50);
  assert.equal(byMob.get("a gnoll"), undefined, "you didn't loot a corpse you didn't kill");
});

test("coin with no corpse behind it is dropped rather than guessed at", () => {
  const k = createKillLog(tempDir());
  assert.equal(k.noteCoin(coin(50, 10)), false);
  assert.equal(k.kills().length, 0);
});

test("two coin lines off one corpse add up", () => {
  const k = createKillLog(tempDir());
  kill(k, "a kobold", 10);
  k.noteCoin(coin(30, 12));
  k.noteCoin(coin(4, 13));
  assert.equal(k.kills()[0].coin, 34);
});

test("the same coin line read twice adds the money once", () => {
  const dir = tempDir();
  const first = createKillLog(dir);
  first.record("a kobold", "You", ZONE, stamp(10), 1);
  assert.equal(first.noteCoin(coin(32, 12)), true);
  assert.equal(first.noteCoin(coin(32, 12)), false, "same line, same money");
  first.flush();

  const again = createKillLog(dir); // the coin keys were persisted with the corpse
  assert.equal(again.noteCoin(coin(32, 12)), false, "a re-import must not double the coin");
  assert.equal(again.kills()[0].coin, 32);
});

/**
 * The log is bounded, so records leave it — and what leaves has to take its line-identity with
 * it while every surviving record keeps its own. Getting that wrong is invisible in ordinary
 * play and shows up as either a doubled kill or a permanently swallowed line after a trim.
 */
test("the cap forgets the lines it drops and keeps the lines it doesn't", () => {
  const k = createKillLog(tempDir());
  // A distinct second per kill, well past the cap. Not `stamp`, which only spans an hour.
  const at = (i: number) => new Date(Date.parse("2026-07-29T00:00:00Z") + i * 1000).toISOString();
  const OVER = 5300;
  for (let i = 0; i < OVER; i++) k.record(`a kobold ${i}`, "You", ZONE, at(i), i);

  const kept = k.kills(); // newest first
  assert.ok(kept.length < OVER, "the log is capped rather than growing without bound");

  // A record that survived the trim still recognises its own line, and the drop hung on it.
  const newest = kept[0];
  const drop: LootEvent = { ...looted("Bone Chips", newest.mob, 0), at: newest.at };
  assert.equal(k.noteLoot(drop), true);
  assert.equal(k.noteLoot(drop), false, "its loot line still dedups");
  assert.equal(k.record(newest.mob, "You", ZONE, newest.at, 1), false, "its kill line still dedups");

  // The oldest was trimmed away, so its line is unread again — an index entry pointing at a
  // record that no longer exists would block it forever.
  assert.equal(k.record("a kobold 0", "You", ZONE, at(0), 1), true, "a trimmed line can be recorded again");
});

/**
 * The cap bounds the *detail*, never the knowledge. What a trimmed record taught — that the mob
 * was killed, what it dropped, roughly where it lives — has to survive it, or a long-running log
 * quietly forgets drop rates and roam areas as it goes (ADR 0056).
 */
test("a trimmed record keeps its kill, its drop and its position, as an observation", () => {
  const dir = tempDir();
  const k = createKillLog(dir);
  const at = (i: number) => new Date(Date.parse("2026-07-29T00:00:00Z") + i * 1000).toISOString();
  const OVER = 5300;

  // One rare mob, killed early with a drop and a position — the record that will be trimmed.
  k.noteLoc({ kind: "loc", y: 100, x: 200, z: 0, logId: 1, raw: "loc", at: at(0) }, ZONE);
  k.record("a gnoll king", "You", ZONE, at(1), 1);
  k.noteLoot({ kind: "loot", item: "Crown", qty: 1, source: "a gnoll king", fate: "kept", logId: 1, raw: "x", at: at(2) });
  // …then enough ordinary kills to push it out.
  for (let i = 0; i < OVER; i++) k.record(`a kobold ${i}`, "You", ZONE, at(10 + i), i);

  assert.equal(k.kills().some((r) => r.mob === "a gnoll king"), false, "its record is gone");

  const king = k.observations().find((o) => o.mob === "a gnoll king");
  assert.ok(king, "but what it taught is not");
  assert.equal(king!.kills, 1);
  assert.deepEqual(king!.drops, { Crown: 1 });
  assert.deepEqual({ y: king!.area?.y, x: king!.area?.x }, { y: 100, x: 200 }, "and roughly where it lives");

  // It survives a restart, and adds to — rather than replaces — a later kill of the same mob.
  k.flush();
  const reopened = createKillLog(dir);
  reopened.record("a gnoll king", "You", ZONE, at(99_999), 1);
  const after = reopened.observations().find((o) => o.mob === "a gnoll king")!;
  assert.equal(after.kills, 2, "the retired kill and the fresh one are one tally");
  assert.deepEqual(after.drops, { Crown: 1 });

  // Clearing the *records* keeps what they taught — that's the whole point of retiring them, and
  // a wipe of the records is not a request to unlearn a fortnight of drop rates.
  reopened.clear();
  assert.deepEqual(reopened.kills(), []);
  assert.equal(reopened.observations().find((o) => o.mob === "a gnoll king")?.kills, 2);

  // Only the second, explicit answer takes the observations too.
  reopened.clear("everything");
  assert.deepEqual(reopened.observations(), []);
});

/**
 * The property the whole arrangement rests on: kills and drops are **conserved** across the cap.
 * Asserted in bulk rather than on one record, because an off-by-one in the fold is invisible on a
 * single mob and turns a drop rate into a lie over a fortnight.
 */
test("kills and drops are conserved across the cap, however many records are trimmed", () => {
  const k = createKillLog(tempDir());
  const at = (i: number) => new Date(Date.parse("2026-07-29T00:00:00Z") + i * 1000).toISOString();
  const MOBS = ["a gnoll", "a kobold", "a rat"];
  const TOTAL = 12_000; // well past two full trims

  k.noteLoc({ kind: "loc", y: 10, x: 20, z: 0, logId: 1, raw: "loc", at: at(0) }, ZONE);
  for (let i = 0; i < TOTAL; i++) {
    const mob = MOBS[i % MOBS.length];
    k.record(mob, "You", ZONE, at(i + 1), i);
    // Every fourth kill of each mob drops something.
    if (i % 4 === 0) {
      k.noteLoot({ kind: "loot", item: "Ear", qty: 1, source: mob, fate: "kept", logId: 1, raw: "x", at: at(i + 1) });
    }
  }

  const obs = k.observations();
  assert.equal(
    obs.reduce((n, o) => n + o.kills, 0),
    TOTAL,
    "every kill is still counted somewhere",
  );
  assert.equal(
    obs.reduce((n, o) => n + (o.drops.Ear ?? 0), 0),
    TOTAL / 4,
    "and so is every drop",
  );
  assert.ok(k.kills().length <= 5000, "while the records themselves stay bounded");
});
