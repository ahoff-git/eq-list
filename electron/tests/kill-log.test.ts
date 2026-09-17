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
import { createKillLog, KILL_LOG_MIGRATIONS, type KillLog } from "../kill-log";
import { openAppDatabase } from "../sqlite-store";
import type { CoinEvent, LocEvent, LootEvent } from "../../src/shared/types";

const ZONE = "Steamfont Mountains";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-kills-"));
}

/** A kill log over a real file — several tests below reuse the same `dir` across more than one
 *  call to simulate a restart, which an in-memory database can't demonstrate. */
function freshKillLog(dir = tempDir()): KillLog {
  const db = openAppDatabase(dir, KILL_LOG_MIGRATIONS);
  return createKillLog(db, dir);
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
  const k = freshKillLog();
  kill(k, "a coyote", 10);

  const [only] = k.kills();
  assert.equal(only.mob, "a coyote");
  assert.equal(only.y, undefined);
  assert.equal(only.confidence, 0);
});

test("a fresh fix from a stationary player is trusted completely", () => {
  const k = freshKillLog();
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
  const k = freshKillLog();
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
  const moving = freshKillLog();
  moving.noteLoc(loc(0, 0, 0), ZONE);
  moving.noteLoc(loc(300, 0, 10), ZONE); // covered ground
  kill(moving, "a coyote", 12);

  const parked = freshKillLog();
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
  const k = freshKillLog();
  k.noteLoc(loc(0, 0, 0), ZONE);
  k.noteLoc(loc(60, 0, 600), ZONE); // 60 units in 10 minutes — 0.1 units/s
  kill(k, "a coyote", 605);

  const [only] = k.kills();
  assert.equal(only.speed, 0, "the displayed speed does round to zero");
  assert.ok(only.confidence < 1, "but it should not be credited as a parked player");
});

test("a moving player gets a dead-reckoned guess as well as the raw fix", () => {
  const k = freshKillLog();
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
  const k = freshKillLog();
  k.noteLoc(loc(10, 10, 0), ZONE);
  k.noteLoc(loc(10, 10, 10), ZONE);
  kill(k, "a coyote", 12);
  assert.equal(k.kills()[0].guessedY, undefined);
});

test("kills can be read back per zone, newest first", () => {
  const k = freshKillLog();
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

// The map window's incremental refresh (ADR 0253) asks for exactly what changed instead of
// refetching a whole camp's history — `drainTouched`/`byIds` are its two halves.
test("record/noteLoot/noteCoin each touch an id, drained once and then forgotten", () => {
  const k = freshKillLog();
  assert.deepEqual(k.drainTouched(), []); // nothing touched yet

  kill(k, "a coyote", 1);
  const afterKill = k.drainTouched();
  assert.equal(afterKill.length, 1);
  const killedId = k.kills(ZONE)[0].id;
  assert.deepEqual(afterKill, [killedId]);
  assert.deepEqual(k.drainTouched(), []); // draining empties it

  k.noteLoot(looted("a shiny bauble", "a coyote", 2));
  assert.deepEqual(k.drainTouched(), [killedId]); // the same kill's row was updated with a drop

  k.noteCoin(coin(5, 3));
  assert.deepEqual(k.drainTouched(), [killedId]); // and again for coin

  // A recorded kill that never gets a drop/coin only ever touches its own id, once.
  kill(k, "a second coyote", 10);
  assert.equal(k.drainTouched().length, 1);
});

test("byIds answers with exactly the requested records, in no particular zone-filtered order", () => {
  const k = freshKillLog();
  kill(k, "first", 1, ZONE);
  kill(k, "second", 2, "Ak'Anon");
  const [a, b] = k.kills();
  const ids = [a.id, b.id];

  const byIds = k.byIds(ids);
  assert.equal(byIds.length, 2);
  assert.deepEqual(
    byIds.map((r) => r.mob).sort(),
    ["first", "second"],
  );
  // Zone-agnostic on purpose: filtering by zone is `useKills`' own job on the client, matching
  // `samePlace` the same way `kills(zone)` resolves it server-side (ADR 0253).
  assert.equal(byIds.find((r) => r.mob === "second")?.zone, "Ak'Anon");

  assert.deepEqual(k.byIds([]), []);
  assert.deepEqual(k.byIds(["not-a-real-id"]), []);
});

// The zone a map draws is one place, however hard the door was set (ADR 0059). Asking the map's
// name for it — no article, no number, no ruleset — has to reach every variant's kills.
test("a zone's difficulty variants read back as one zone", () => {
  const k = freshKillLog();
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
  const k = freshKillLog();
  kill(k, "a kerran", 1, "Toxxulia Forest");
  kill(k, "elsewhere", 2, "East Commonlands");

  assert.deepEqual(k.kills("Toxulia Forest").map((x) => x.mob), ["a kerran"]);
  // And the looseness stops at a misspelling: two real zones are still two zones.
  assert.deepEqual(k.kills("West Commonlands").map((x) => x.mob), []);
});

// Zoning teleports you, and stepping between two difficulties of one zone is no exception: you
// arrive at the zone-in point, so the fix you took on the other side is wrong rather than stale.
test("a fix from another difficulty of the same zone can't place a kill", () => {
  const k = freshKillLog();
  k.noteLoc(loc(100, 200, 0), "Steamfont Mountains");
  kill(k, "a rat", 1, "Steamfont Mountains 2 (Adaptive)");

  const [only] = k.kills();
  assert.equal(only.y, undefined);
  assert.equal(only.confidence, 0);
});

test("the log survives a restart, and a corrupt file is not fatal", () => {
  const dir = tempDir();
  const first = freshKillLog(dir);
  first.noteLoc(loc(5, 5, 0), "Ak'Anon");
  kill(first, "a coyote", 2, "Ak'Anon");
  first.flush();
  assert.equal(freshKillLog(dir).kills().length, 1);

  const broken = tempDir();
  fs.writeFileSync(path.join(broken, "kill-log.json"), "{nope");
  assert.deepEqual(freshKillLog(broken).kills(), []);
});

test("the admin panel shows named/killerNamed/mine as real booleans, not raw 0/1", () => {
  // `named`/`killerNamed`/`mine` are stored as SQLite integers (`kill_records` has no boolean
  // column type), but the hidden admin panel's field-typing infers a field's type from its live JS
  // value — a raw `0`/`1` reads as "number", which would put a plain number box where the true/false
  // toggle these fields showed before this store moved off a plain JS array.
  const k = freshKillLog();
  k.record("a gnoll", "You", ZONE, stamp(10), 1, true, false);
  const [record] = k.admin.list();
  const byKey = Object.fromEntries(record.fields.map((f) => [f.key, f]));
  assert.deepEqual(byKey.named, { key: "named", value: true, type: "boolean" });
  assert.deepEqual(byKey.killerNamed, { key: "killerNamed", value: false, type: "boolean" });
  // Never determined (not passed at all) reads as absent, the same as it always has.
  assert.deepEqual(byKey.mine, { key: "mine", value: true, type: "boolean" });

  // A patch round-trips as a real boolean too, not a stray "true"/"false" string or a bare 1/0.
  assert.deepEqual(k.admin.patch(record.id, "named", "false"), { ok: true });
  const after = k.admin.list()[0];
  assert.equal(after.fields.find((f) => f.key === "named")?.value, false);
  assert.equal(k.kills()[0].named, false);
});

test("setting a never-determined boolean field to 'false' via admin doesn't read back as true", () => {
  // The field-typing that makes `named`/`killerNamed`/`mine` show as a true/false toggle
  // (`adminFieldType`, `src/shared/admin.ts`) infers a field's type from its *current* value — a
  // field that's still `null` (never captured) reads as "null" type, not "boolean", so
  // `coerceAdminValue` falls through to its free-text branch and hands back the literal STRING
  // "false" instead of the boolean `false`. Left uncorrected, that string binds into the `INTEGER`
  // column as text, and reading it back (`!!"false"`) says `true` — typing "false" produces the
  // opposite of what was typed. `killerNamed` is never passed here, so it starts out `null`.
  const k = freshKillLog();
  k.record("a gnoll", "You", ZONE, stamp(10), 1, true /* named */);
  const [record] = k.admin.list();
  assert.equal(record.fields.find((f) => f.key === "killerNamed")?.value, null, "starts undetermined");

  assert.deepEqual(k.admin.patch(record.id, "killerNamed", "false"), { ok: true });
  const after = k.admin.list()[0];
  assert.equal(after.fields.find((f) => f.key === "killerNamed")?.value, false, "not true");
  assert.equal(k.kills()[0].killerNamed, false);
});

// ── whose kill was it ──

test("your own pet dying is not a kill", () => {
  const k = freshKillLog();
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
  const first = freshKillLog(dir);
  first.record("Kainos`s warder", "a kobold", ZONE, stamp(10), 1); // no player set yet
  kill(first, "a kobold", 20);
  first.flush();

  const second = freshKillLog(dir);
  assert.equal(second.kills().length, 2, "both are there until we know who you are");
  second.setPlayer("Kainos");
  assert.deepEqual(
    second.kills().map((k) => k.mob),
    ["a kobold"],
  );
});

test("someone else's kill is recorded, but marked as theirs", () => {
  const k = freshKillLog();
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
  const k = freshKillLog();
  k.setPlayer("Kainos");
  k.record("a kobold", "Kainos`s warder", ZONE, stamp(10), 1);
  assert.equal(k.kills()[0].mine, true);
});

test("someone else's kill is placed less confidently — your /loc was about you", () => {
  const k = freshKillLog();
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
  const k = freshKillLog();
  kill(k, "rogue clockwork", 10); // "You have slain a rogue clockwork!"
  k.record("Rogue clockwork", "Jarn", ZONE, stamp(20), 2); // "Rogue clockwork has been slain by…"

  assert.deepEqual(new Set(k.kills().map((x) => x.mob)), new Set(["rogue clockwork"]));
});

test("the canonical spelling survives a restart", () => {
  const dir = tempDir();
  const first = freshKillLog(dir);
  kill(first, "obsolete model", 10);
  first.flush();

  const second = freshKillLog(dir);
  kill(second, "Obsolete model", 20);
  assert.deepEqual(new Set(second.kills().map((x) => x.mob)), new Set(["obsolete model"]));
});

// ── placing a kill after zoning ──

test("a fix from the zone you just left does not place a kill in the new one", () => {
  const k = freshKillLog();
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
  const k = freshKillLog();
  k.noteLoc(loc(-420, 1757, 0), null);
  kill(k, "a kerran", 5, "Kerra Isle");

  const [only] = k.kills();
  assert.equal(only.y, undefined);
  assert.equal(only.confidence, 0);
});

test("a zone-less fix still places a kill whose zone is equally unknown", () => {
  // Same state, not a guess across one: neither says which zone, so the fix is the best there is.
  const k = freshKillLog();
  k.noteLoc(loc(10, 20, 0), null);
  kill(k, "something", 5, null);

  const [only] = k.kills();
  assert.deepEqual([only.y, only.x], [10, 20]);
});

test("zoning back makes the old fix usable again, aged as usual", () => {
  const k = freshKillLog();
  k.noteLoc(loc(500, 500, 0), ZONE);
  kill(k, "a kerran", 5, "Kerra Isle");
  kill(k, "a kobold", 8, ZONE);

  const [back] = k.kills();
  assert.equal(back.mob, "a kobold");
  assert.equal(back.y, 500);
});

// ── which corpse a drop came from ──

test("identical drops spread across the corpses that could have given them", () => {
  const k = freshKillLog();
  kill(k, "minotaur slaver", 10);
  kill(k, "minotaur slaver", 20);
  k.noteLoot(looted("Minotaur Blood", "minotaur slaver", 30));
  k.noteLoot(looted("Minotaur Blood", "minotaur slaver", 31));

  const [second, first] = k.kills();
  assert.deepEqual(first.drops, ["Minotaur Blood"]);
  assert.deepEqual(second.drops, ["Minotaur Blood"], "the older corpse should not be left empty");
});

test("a corpse that really gave two of something keeps both", () => {
  const k = freshKillLog();
  kill(k, "a rock spider", 10);
  k.noteLoot(looted("Spiderling Silk", "a rock spider", 14));
  k.noteLoot(looted("Spiderling Silk", "a rock spider", 15));

  assert.deepEqual(k.kills()[0].drops, ["Spiderling Silk", "Spiderling Silk"]);
});

test("different items from one corpse all attach to it", () => {
  const k = freshKillLog();
  kill(k, "a kobold", 10);
  k.noteLoot(looted("Bone Chips", "a kobold", 12));
  k.noteLoot(looted("Rusty Dagger", "a kobold", 13));

  assert.deepEqual(k.kills()[0].drops, ["Bone Chips", "Rusty Dagger"]);
});

test("a drop from a corpse nobody killed recently is dropped on the floor", () => {
  const k = freshKillLog();
  kill(k, "a kobold", 10);
  k.noteLoot(looted("Bone Chips", "a coyote", 12)); // never killed a coyote
  assert.equal(k.kills()[0].drops, undefined);
});

test("clearing the log forgets where the player was, too", () => {
  const k = freshKillLog();
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

// A replay only has to recognise what a signature **before it began** already accounted for — two
// occurrences that both arise *inside* one replay, with nothing recorded before it, are trusted as
// two real kills for the same reason live-watching trusts them (see below): nothing here can tell
// a duplicated line from a genuine AoE double-kill sharing one second, so only "was this already on
// record before this pass started" is ever grounds to refuse one.
test("a kill line already recorded is recognised as a duplicate on a later replay", () => {
  const k = freshKillLog();
  assert.equal(k.record("a kobold", "You", ZONE, stamp(10), 1), true);
  k.startReplay(); // as log-import.ts does before walking a file that may repeat this line
  assert.equal(k.record("a kobold", "You", ZONE, stamp(10), 1), false, "already recorded before this replay began");
  assert.equal(k.kills().length, 1);
});

// The reason a replay has to announce itself: live-watching never revisits a line, so two calls
// sharing one signature outside a replay are trusted as two genuinely different kills — an AoE mez
// landing on two same-named mobs in the same second is exactly this shape (ADR 0207, "Same second,
// different mob").
test("the same signature recorded twice outside a replay is trusted as two real kills", () => {
  const k = freshKillLog();
  assert.equal(k.record("a kobold", "You", ZONE, stamp(10), 1), true);
  assert.equal(k.record("a kobold", "You", ZONE, stamp(10), 1), true, "no replay in progress to doubt it");
  assert.equal(k.kills().length, 2);
});

test("two real kills of the same mob a second apart are both kept", () => {
  const k = freshKillLog();
  assert.equal(k.record("a kobold", "You", ZONE, stamp(10), 1), true);
  assert.equal(k.record("a kobold", "You", ZONE, stamp(11), 2), true, "a different line, a real kill");
  assert.equal(k.kills().length, 2);
});

test("a loot line already recorded is recognised as a duplicate on a later replay", () => {
  const k = freshKillLog();
  kill(k, "a kobold", 10);
  assert.equal(k.noteLoot(looted("Bone Chips", "a kobold", 12)), true);
  k.startReplay();
  assert.equal(k.noteLoot(looted("Bone Chips", "a kobold", 12)), false, "already recorded before this replay began");
  assert.deepEqual(k.kills()[0].drops, ["Bone Chips"]);
});

test("re-eating the same sequence changes nothing, even across a restart", () => {
  const dir = tempDir();
  const first = freshKillLog(dir);
  first.record("a kobold", "You", ZONE, stamp(10), 1);
  first.noteLoot(looted("Bone Chips", "a kobold", 12));
  first.flush();

  const again = freshKillLog(dir); // keys were persisted, so the replay recognises both lines
  again.startReplay(); // a re-import always announces itself first, same as log-import.ts
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
  const k = freshKillLog(dir);
  assert.equal(k.noteLoot(looted("Bone Chips", "a kobold", 12)), false, "a re-read of a known drop");
  assert.deepEqual(k.kills()[0].drops, ["Bone Chips"], "the rate isn't inflated by the replay");
});

// ── coin off a corpse ──
//
// Harder than a drop: the line names nothing at all, so these pin *which corpse gets credited*
// and — the part that would quietly corrupt every figure — which coin isn't a mob's at all.

test("coin off a corpse is credited to the mob that died", () => {
  const k = freshKillLog();
  kill(k, "a kobold", 10);
  assert.equal(k.noteCoin(coin(32, 12)), true);
  assert.equal(k.kills()[0].coin, 32);
});

test("an auto-sold item's coin is not the mob's money", () => {
  const k = freshKillLog();
  kill(k, "a kobold", 10);
  assert.equal(k.noteCoin(coin(4, 12, "item")), false, "the loot line already priced it");
  assert.equal(k.kills()[0].coin, undefined);
});

test("coin follows the corpse you were just looting, not merely the newest kill", () => {
  const k = freshKillLog();
  kill(k, "a kobold", 10);
  kill(k, "a gnoll", 20); // died later, so it's the newest corpse…
  k.noteLoot(looted("Bone Chips", "a kobold", 24)); // …but the kobold is the one being looted
  k.noteCoin(coin(50, 25));

  const byMob = new Map(k.kills().map((x) => [x.mob, x.coin]));
  assert.equal(byMob.get("a kobold"), 50, "the item line names the corpse the coin came off");
  assert.equal(byMob.get("a gnoll"), undefined);
});

test("coin doesn't follow a corpse you looted but didn't kill", () => {
  // The doc comment on `noteCoin` promises "strangers' corpses are never candidates" for *either*
  // signal, but only the fallback loop checked `mine` — the stronger, "corpse you were just
  // looting" signal skipped the check entirely and would credit a stranger's kill with money you
  // never took, the exact figure the rule exists to protect.
  const k = freshKillLog();
  k.setPlayer("Kainos");
  k.record("a gnoll", "Bunnyslayer", ZONE, stamp(20), 20); // a stranger's kill
  k.noteLoot(looted("Bone Chips", "a gnoll", 24)); // you looted it anyway
  assert.equal(k.noteCoin(coin(50, 25)), false, "no corpse of yours to credit it to");

  const byMob = new Map(k.kills().map((x) => [x.mob, x.coin]));
  assert.equal(byMob.get("a gnoll"), undefined, "you didn't kill it, so its coin isn't credited to it");
});

test("an admin edit to 'mine' between a drop and its coin is honored, not a stale snapshot", () => {
  // `lastLooted` doesn't cache the corpse's `mine` at attach time — it re-reads the row fresh when
  // a coin line actually arrives, the same as the old array-backed store's `lastLooted.kill` (a live
  // object reference) would have seen an admin edit made to it in between. Two candidates make the
  // two paths distinguishable: the corpse being looted (older, not yours until the edit) versus the
  // newer kill of yours the fallback path would otherwise prefer.
  const k = freshKillLog();
  k.record("a gnoll", "a stranger", ZONE, stamp(10), 10); // the corpse about to be looted — not yours yet
  k.record("a kobold", "You", ZONE, stamp(20), 20); // newer, and already yours — what the fallback would pick
  k.noteLoot(looted("Bone Chips", "a gnoll", 24)); // looting the gnoll, not the kobold

  const gnollId = k.admin.list().find((r) => r.summary.startsWith("a gnoll"))!.id;
  assert.deepEqual(k.admin.patch(gnollId, "mine", "true"), { ok: true }); // corrected after the fact

  assert.equal(k.noteCoin(coin(50, 25)), true);
  const byMob = new Map(k.kills().map((x) => [x.mob, x.coin]));
  assert.equal(byMob.get("a gnoll"), 50, "the corpse actually being looted, once its 'mine' is fresh");
  assert.equal(byMob.get("a kobold"), undefined, "not the newer kill the fallback path would have preferred");
});

test("the admin store's counts() matches a plain list().length/filter(edited).length", () => {
  // `stores()` (`electron/admin.ts`) prefers this over scanning `list()` on every admin-panel open
  // and every `app.onDataChanged` broadcast — its own numbers still have to agree with what `list()`
  // itself would say, both before and after a real edit.
  const k = freshKillLog();
  kill(k, "a coyote", 10);
  kill(k, "a gnoll", 20);
  assert.deepEqual(k.admin.counts!(), { total: 2, edited: 0 });

  const [record] = k.admin.list();
  assert.deepEqual(k.admin.patch(record.id, "confidence", "0.5"), { ok: true });
  assert.deepEqual(k.admin.counts!(), { total: 2, edited: 1 });
  assert.equal(k.admin.counts!().total, k.admin.list().length);
  assert.equal(k.admin.counts!().edited, k.admin.list().filter((r) => r.edited).length);
});

test("with nothing being looted, coin goes to the newest kill of yours", () => {
  const k = freshKillLog();
  k.setPlayer("Kainos");
  kill(k, "a kobold", 10);
  k.record("a gnoll", "Bunnyslayer", ZONE, stamp(20), 2); // a stranger's corpse, never yours to loot
  k.noteCoin(coin(50, 22));

  const byMob = new Map(k.kills().map((x) => [x.mob, x.coin]));
  assert.equal(byMob.get("a kobold"), 50);
  assert.equal(byMob.get("a gnoll"), undefined, "you didn't loot a corpse you didn't kill");
});

test("coin with no corpse behind it is dropped rather than guessed at", () => {
  const k = freshKillLog();
  assert.equal(k.noteCoin(coin(50, 10)), false);
  assert.equal(k.kills().length, 0);
});

test("two coin lines off one corpse add up", () => {
  const k = freshKillLog();
  kill(k, "a kobold", 10);
  k.noteCoin(coin(30, 12));
  k.noteCoin(coin(4, 13));
  assert.equal(k.kills()[0].coin, 34);
});

test("the same coin line read twice adds the money once", () => {
  const dir = tempDir();
  const first = freshKillLog(dir);
  first.record("a kobold", "You", ZONE, stamp(10), 1);
  assert.equal(first.noteCoin(coin(32, 12)), true);
  assert.equal(first.noteCoin(coin(32, 12)), false, "same line, same money");
  first.flush();

  const again = freshKillLog(dir); // the coin keys were persisted with the corpse
  assert.equal(again.noteCoin(coin(32, 12)), false, "a re-import must not double the coin");
  assert.equal(again.kills()[0].coin, 32);
});

/**
 * `kill_records` had a cap once (`MAX_KILLS`, removed in ADR 0243) — this is the direct check that
 * it's actually gone: recording well past the old bound evicts nothing, and a zone-scoped read still
 * finds every one of them.
 */
test("kill_records keeps every kill forever — recording well past the old cap evicts nothing", () => {
  const k = freshKillLog();
  const at = (i: number) => new Date(Date.parse("2026-07-29T00:00:00Z") + i * 1000).toISOString();
  const OVER_OLD_CAP = 5300; // more than the removed MAX_KILLS (5000)
  for (let i = 0; i < OVER_OLD_CAP; i++) k.record(`a kobold ${i}`, "You", ZONE, at(i), i);

  const held = k.kills(ZONE); // a real zone reaches the whole ledger, not a fetched window
  assert.equal(held.length, OVER_OLD_CAP, "nothing was evicted, however many kills piled up");
  assert.equal(held.some((r) => r.mob === "a kobold 0"), true, "the very first kill is still on record");
});

/**
 * `kills()` with no zone is the one caller (`SpawnPanel`'s "recent camps") that only ever wants a
 * recent window, not the ledger's whole history — bounded by `DEFAULT_LIMIT` (ADR 0243) rather than
 * fetching everything just to look at the front of it.
 */
test("kills() with no zone is a bounded recent window, not the whole ledger", () => {
  const k = freshKillLog();
  const at = (i: number) => new Date(Date.parse("2026-07-29T00:00:00Z") + i * 1000).toISOString();
  const TOTAL = 250; // more than DEFAULT_LIMIT (200)
  for (let i = 0; i < TOTAL; i++) k.record(`a kobold ${i}`, "You", ZONE, at(i), i);

  const recent = k.kills();
  assert.equal(recent.length, 200, "bounded at DEFAULT_LIMIT, not every kill ever recorded");
  assert.equal(recent[0].mob, "a kobold 249", "newest first");
  assert.equal(recent.some((r) => r.mob === "a kobold 0"), false, "the oldest kill isn't in a 200-deep recent window");
  // Scoped to the zone, every one of them is still reachable.
  assert.equal(k.kills(ZONE).length, TOTAL);
});

// Before ADR 0207, a record's dedup key was forgotten along with the record itself, so a re-read
// (or a log eaten a second time after `clear("records")` had already retired it) recorded — then
// re-retired — the same history again, silently doubling the observation. Keys now outlive the
// record they came from, so a replay recognises a cleared line exactly as well as a held one.
test("a kill's key survives clearing the records that carried it", () => {
  const k = freshKillLog();
  k.record("a kobold", "You", ZONE, stamp(0), 0);
  const drop: LootEvent = looted("Bone Chips", "a kobold", 1);
  assert.equal(k.noteLoot(drop), true, "first sight of this drop line, live");

  k.clear(); // default "records" scope — forgets the detail, keeps the knowledge and the keys

  k.startReplay(); // as log-import.ts always does before re-walking a file's lines
  assert.equal(k.noteLoot(drop), false, "a cleared record's drop line still dedups on replay");
  assert.equal(
    k.record("a kobold", "You", ZONE, stamp(0), 0),
    false,
    "a cleared record's kill line still dedups — its key was never forgotten",
  );
});

/**
 * `clear("records")` bounds the *detail*, never the knowledge. What a cleared record taught — that
 * the mob was killed, what it dropped, roughly where it lives — has to survive it, or asking to
 * forget the ledger's detail would also quietly forget drop rates and roam areas (ADR 0056). Also
 * the conservation property the whole arrangement rests on: asserted in bulk across several mobs,
 * since an off-by-one in the fold is invisible on one record and turns a drop rate into a lie.
 */
test("clear(\"records\") keeps every held kill and drop as an observation", () => {
  const dir = tempDir();
  const k = freshKillLog(dir);
  const at = (i: number) => new Date(Date.parse("2026-07-29T00:00:00Z") + i * 1000).toISOString();

  // One rare mob with a drop and a position — checked individually, below.
  k.noteLoc({ kind: "loc", y: 100, x: 200, z: 0, logId: 1, raw: "loc", at: at(0) }, ZONE);
  k.record("a gnoll king", "You", ZONE, at(1), 1);
  k.noteLoot({ kind: "loot", item: "Crown", qty: 1, source: "a gnoll king", fate: "kept", logId: 1, raw: "x", at: at(2) });

  // Plenty of ordinary kills alongside it, checked in bulk.
  const MOBS = ["a gnoll", "a kobold", "a rat"];
  const TOTAL = 300; // divides evenly by 4, so the drop count below is exact
  for (let i = 0; i < TOTAL; i++) {
    const mob = MOBS[i % MOBS.length];
    k.record(mob, "You", ZONE, at(10 + i), 10 + i);
    if (i % 4 === 0) {
      k.noteLoot({ kind: "loot", item: "Ear", qty: 1, source: mob, fate: "kept", logId: 1, raw: "x", at: at(10 + i) });
    }
  }

  k.clear(); // default "records" scope

  assert.deepEqual(k.kills(), [], "the records themselves are gone");

  const obs = k.observations();
  assert.equal(obs.reduce((n, o) => n + o.kills, 0), TOTAL + 1, "every kill is still counted somewhere");
  assert.equal(obs.reduce((n, o) => n + (o.drops.Ear ?? 0), 0), TOTAL / 4, "and so is every drop");

  const king = obs.find((o) => o.mob === "a gnoll king");
  assert.ok(king, "the rare mob's own observation is not lost among the bulk");
  assert.equal(king!.kills, 1);
  assert.deepEqual(king!.drops, { Crown: 1 });
  assert.deepEqual({ y: king!.area?.y, x: king!.area?.x }, { y: 100, x: 200 }, "and roughly where it lives");

  // It survives a restart, and adds to — rather than replaces — a later kill of the same mob.
  k.flush();
  const reopened = freshKillLog(dir);
  reopened.record("a gnoll king", "You", ZONE, at(99_999), 1);
  const after = reopened.observations().find((o) => o.mob === "a gnoll king")!;
  assert.equal(after.kills, 2, "the retired kill and the fresh one are one tally");
  assert.deepEqual(after.drops, { Crown: 1 });

  // Only the second, explicit answer takes the observations too.
  reopened.clear("everything");
  assert.deepEqual(reopened.observations(), []);
});

// `migrations.ts`'s own repair still runs against the legacy JSON file *before* this store ever
// sees it (main.ts calls `runMigrations` first), so `schema` still does its job of not re-reading
// every log on the one launch where the file briefly exists. What replaces the old "schema survives
// a save" guarantee once this store no longer keeps writing that file at all is simpler: the file is
// consumed once and renamed, so there is nothing left for a later launch to misread as unrepaired.
test("a pre-ADR-0232 kill-log.json is folded in once; the file survives as a provenance stub", () => {
  const dir = tempDir();
  const legacyFile = path.join(dir, "kill-log.json");
  fs.writeFileSync(
    legacyFile,
    JSON.stringify({
      schema: 3,
      kills: [
        { id: "x", logId: 1, at: stamp(10), mob: "a gnoll", killer: "You", mine: true, confidence: 0 },
      ],
      retired: [],
      provenance: { revision: 2, appVersion: "0.0.0", at: "2026-01-01T00:00:00.000Z" },
    }),
  );

  const k = freshKillLog(dir);
  assert.deepEqual(k.kills().map((r) => r.mob), ["a gnoll"]);
  // The file isn't renamed away: `data-health.ts` still reads its `provenance` field directly off
  // disk (see the module doc). `migrations.ts`'s own `schema` field is dropped rather than carried
  // forward — this store never reads it, and a stub with no `kills` array reads as nothing left for
  // `fillMissingKillZones` to repair either, so losing it costs nothing.
  assert.equal(fs.existsSync(legacyFile), true);
  const stub = JSON.parse(fs.readFileSync(legacyFile, "utf8"));
  assert.deepEqual(stub, { provenance: { revision: 2, appVersion: "0.0.0", at: "2026-01-01T00:00:00.000Z" } });

  // Reopening the same directory's database must not double the migrated kill — the stub has no
  // `kills` array left for a second construction to (re-)migrate from.
  const again = freshKillLog(dir);
  assert.equal(again.kills().length, 1, "still just the one migrated kill");
});

test("a kill/loot/coin that had already retired before migrating is still recognised as a duplicate on replay", () => {
  // ADR 0207's whole point: identity survives longer than the record does. `seenKillKeys`/
  // `seenLootKeys`/`seenCoinKeys` are the *only* place this history lives once a kill has retired
  // past the cap — `kills` (empty here) can't recover it, only `retired` (the aggregate) and these
  // three permanent sets can. A migration that only reconstructed keys from `kills` would silently
  // drop this and reintroduce ADR 0207's own double-count-on-replay bug the moment it upgraded.
  const dir = tempDir();
  const file = path.join(dir, "kill-log.json");
  const at = stamp(10);
  const mob = "a gnoll";
  const killerName = "You";
  const item = "a bone chip";
  const copper = 12;

  fs.writeFileSync(
    file,
    JSON.stringify({
      schema: 3,
      kills: [],
      retired: [
        {
          mob,
          zone: ZONE,
          kills: 1,
          drops: { [item]: 1 },
          copper,
          areas: [{ y: 10, x: 20, spread: 0, samples: 1 }],
          lastAt: at,
        },
      ],
      seenKillKeys: [`${at}\0${mob.toLowerCase()}\0${killerName.toLowerCase()}#0`],
      seenLootKeys: [`${at}\0${item.toLowerCase()}\0${mob.toLowerCase()}#0`],
      seenCoinKeys: [`${at}\0coin\0${copper}`],
    }),
  );

  const k = freshKillLog(dir);
  assert.equal(k.kills().length, 0, "nothing held — it all retired before this file was ever written");
  assert.equal(k.observations().find((o) => o.mob === mob)?.kills, 1, "but what it taught survived");

  // Re-eat the exact same log lines, as an unattended re-read (ADR 0129) after a revision bump
  // would. Every one of these must be refused as already-seen, or the observation above doubles.
  k.startReplay();
  assert.equal(k.record(mob, killerName, ZONE, at, 1), false, "the kill already happened, long before this session");
  assert.equal(k.noteLoot(looted(item, mob, 10)), false, "so did the drop");
  assert.equal(k.noteCoin(coin(copper, 10)), false, "and the coin off the same corpse");

  assert.equal(k.observations().find((o) => o.mob === mob)?.kills, 1, "replaying the same log must not double it");
});

test("a `retired` observation written before ADR 0228 (only `area`, no `areas`) still reads fine", () => {
  const dir = tempDir();
  const file = path.join(dir, "kill-log.json");
  fs.writeFileSync(
    file,
    JSON.stringify({
      schema: 2,
      kills: [],
      retired: [
        {
          mob: "a gnoll",
          zone: ZONE,
          kills: 5,
          drops: {},
          area: { y: 10, x: 20, spread: 3, samples: 5 },
          lastAt: "2026-07-29T00:00:00.000Z",
        },
      ],
    }),
    "utf8",
  );

  const k = freshKillLog(dir);
  const obs = k.observations().find((o) => o.mob === "a gnoll");
  assert.equal(obs?.kills, 5, "the retired tally itself is untouched");
  assert.deepEqual(obs?.areas, [{ y: 10, x: 20, spread: 3, samples: 5 }], "normalized up to today's shape");
  assert.deepEqual(obs?.area, { y: 10, x: 20, spread: 3, samples: 5 }, "and `area` still reads the same as before");
});

test("an old blended average is kept as-is, and a genuinely new camp shows up beside it — no reset needed", () => {
  // The realistic case: months of play retired long ago under the old single-average algorithm,
  // sitting at some centroid that may or may not still mean anything. A `retired` observation like
  // this can never be re-split — the raw positions behind it are gone (ADR 0228) — but it doesn't
  // have to be: `observations()` folds it together with whatever's freshly recorded *live*, and a
  // fresh kill far enough away simply becomes its own row on the very next read.
  const dir = tempDir();
  const file = path.join(dir, "kill-log.json");
  const oldAverage = { y: 0, x: 0, spread: 40, samples: 60 };
  fs.writeFileSync(
    file,
    JSON.stringify({
      schema: 2,
      kills: [],
      retired: [{ mob: "a gnoll", zone: ZONE, kills: 60, drops: {}, area: oldAverage, lastAt: stamp(0) }],
    }),
    "utf8",
  );

  const k = freshKillLog(dir);
  // A fresh kill, today, at a spot well past the old average's own spread and past the clustering
  // threshold — a real second camp this mob apparently also has.
  k.noteLoc(loc(2000, 2000, 0), ZONE);
  kill(k, "a gnoll", 5);

  const obs = k.observations().find((o) => o.mob === "a gnoll")!;
  assert.equal(obs.areas?.length, 2, "the stale average and the fresh camp both show, immediately");
  assert.deepEqual(obs.areas?.[0], oldAverage, "the old, larger sample still leads");
  assert.equal(obs.areas?.[1].samples, 1, "the fresh kill is its own small, honestly-thin second row");
});

/**
 * The property `record()`'s old cap-eviction logic used to have to get right on every insert — a
 * kill just recorded must never disappear again the instant it's looted — has nothing left to get
 * wrong now that nothing evicts (ADR 0243). Still worth a check on the write path itself: a corpse
 * has to stay findable an instant after the kill that created it, cap or no cap.
 */
test("a kill just recorded is immediately findable — its own corpse can attach a drop", () => {
  const k = freshKillLog();
  const SAME_SECOND = "2026-07-29T12:00:00.000Z";
  // Several kills sharing one logged second (EQ's own resolution — any AoE pull produces these),
  // then one more the drop below has to find among them.
  for (let i = 0; i < 20; i++) k.record(`filler ${i}`, "You", ZONE, SAME_SECOND, i);
  assert.equal(k.record("TargetBoss", "You", ZONE, SAME_SECOND, 20), true);

  assert.equal(k.kills(ZONE).some((r) => r.mob === "TargetBoss"), true, "the kill just recorded is on record");
  assert.equal(
    k.noteLoot({ kind: "loot", item: "Boss Drop", qty: 1, source: "TargetBoss", fate: "kept", logId: 21, raw: "looted", at: SAME_SECOND }),
    true,
    "its corpse is still here a moment later to attach the drop to",
  );
});

/**
 * `observations()` moved its actual computation to a background worker thread, so the read that
 * used to block the process this store's IPC handlers all share now usually doesn't — but every
 * test in this file (including this one) always uses a real, file-backed database (see
 * `freshKillLog`'s own doc), so this exercises the *real* worker, not a stand-in for it. The
 * synchronous fallback in `observations()` means correctness never depends on the worker actually
 * finishing in time — this just confirms the background half of the mechanism genuinely runs, not
 * only the fallback that already covers every other test in this file.
 */
test("a background refresh eventually confirms the same answer the synchronous path already gave", async () => {
  const k = freshKillLog();
  let changed = 0;
  k.onObservationsChanged(() => changed++);

  for (let i = 0; i < 30; i++) k.record("a kobold", "You", ZONE, stamp(i), i);

  const immediate = k.observations();
  assert.equal(immediate[0]?.kills, 30, "correct immediately, before any background refresh could possibly have run");

  // Polled, not awaited directly: the worker is a real background thread doing real (if tiny) I/O,
  // not a mocked timer — generous enough to never be flaky, short enough to fail fast if the
  // mechanism is genuinely broken.
  const deadline = Date.now() + 5000;
  while (changed === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(changed > 0, "the background worker never confirmed a refresh within 5s");
  assert.equal(k.observations()[0]?.kills, 30, "the background-confirmed answer agrees with the synchronous one");
});
