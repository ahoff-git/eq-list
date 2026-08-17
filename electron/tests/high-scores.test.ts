/**
 * Tests for the scoreboard — the pure reading of events and fights
 * ([src/shared/high-scores.ts](../../src/shared/high-scores.ts)), and the keeper that decides what's
 * a record and what's worth announcing ([electron/high-scores.ts](../high-scores.ts)).
 *
 * The keeper's tests touch a real temp userData dir, like the other stores': persisting and reloading
 * per character *is* the feature, and a board that comes back as somebody else's is the failure that
 * matters most.
 *
 * The four rules from the keeper's own header get a test each, because every one of them is a thing
 * that reads as a bug when it's missing: a board per character, a first score that sets the bar
 * silently, replayed history that never celebrates, and a streak that speaks once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHighScores } from "../high-scores";
import {
  MIN_DPS_SEC,
  beats,
  categoryOf,
  eventCandidates,
  fightCandidates,
  formatScore,
  meleeCategory,
  qualCategory,
} from "../../src/shared/high-scores";
import type {
  CombatantStat,
  DamageCell,
  DamageEvent,
  DamageKind,
  FightStats,
  HealEvent,
  HighScore,
  StoredFight,
} from "../../src/shared/types";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "eql-scores-"));
}

const AT = "2026-08-17T21:00:00.000Z";

/** You, your pet, and nobody else — the predicate the tracker supplies live. */
const mine = (name: string): boolean => name === "Kainos" || name === "Kainos`s warder";

// ── the pure reading ──────────────────────────────────────────────────────────

test("a hit you land is offered to every category it belongs to", () => {
  const event = damage({ attacker: "Kainos", target: "a froglok shaman", amount: 412, verb: "crushes", melee: true, qualifier: "Critical" });
  const ids = eventCandidates(event, mine).map((c) => c.categoryId);
  // The same hit is a biggest-hit, a biggest-crush and a biggest-critical at once. They overlap on
  // purpose: "what is the hardest I have ever hit" and "how hard does my off-hand get" are different
  // questions about one number.
  assert.deepEqual(ids.sort(), ["biggest-hit", meleeCategory("Crush"), qualCategory("Critical")].sort());
  assert.equal(eventCandidates(event, mine)[0].detail, "Crush on a froglok shaman");
});

test("a spell landing and a DoT tick are different records", () => {
  const spell = (tick: boolean): DamageEvent =>
    damage({ attacker: "Kainos", target: "a froglok shaman", amount: 300, spell: "Ice Comet", tick });
  assert.ok(eventCandidates(spell(false), mine).some((c) => c.categoryId === "biggest-nuke"));
  assert.ok(eventCandidates(spell(true), mine).some((c) => c.categoryId === "biggest-tick"));
  // …and never both, or a slow burn's best six seconds would flatter the nuke record.
  assert.ok(!eventCandidates(spell(true), mine).some((c) => c.categoryId === "biggest-nuke"));
});

test("a hit on you is a survival record; ours-on-ours is neither", () => {
  const hit = (attacker: string, target: string): DamageEvent =>
    damage({ attacker, target, amount: 188, spell: "Ice Comet" });
  assert.deepEqual(
    eventCandidates(hit("a froglok shaman", "Kainos"), mine).map((c) => ({ id: c.categoryId, detail: c.detail })),
    [{ id: "biggest-hit-taken", detail: "a froglok shaman’s Ice Comet" }],
  );
  // A damage shield firing on your pet's attacker: ours dealing to ours is not a hit landed on an
  // enemy, and not one taken from one either.
  assert.equal(eventCandidates(hit("Kainos`s warder", "Kainos"), mine).length, 0);
  // Somebody else's fight entirely.
  assert.equal(eventCandidates(hit("a rat", "Galactic"), mine).length, 0);
});

test("only heals you cast count, and a heal names its target", () => {
  const heal = (healer: string): HealEvent => ({
    kind: "heal",
    at: AT,
    logId: 1,
    raw: `${healer} healed Kainos for 275 hit points by Superior Healing.`,
    healer,
    target: "Kainos",
    amount: 275,
    spell: "Superior Healing",
  });
  assert.deepEqual(eventCandidates(heal("Kainos"), mine), [
    { categoryId: "biggest-heal", value: 275, at: AT, detail: "Superior Healing on Kainos" },
  ]);
  // A group's cleric healing you is their record, not yours.
  assert.equal(eventCandidates(heal("Galactic"), mine).length, 0);
});

test("a fight's own figures, and the two it refuses to state", () => {
  const short = fight({ durationSec: MIN_DPS_SEC - 1, yourDealt: 5000 });
  const long = fight({ durationSec: MIN_DPS_SEC, yourDealt: 5000 });
  // A rate over a fight too short to have one is not a rate; the damage still counts.
  assert.ok(!fightCandidates(short).some((c) => c.categoryId === "fight-dps"));
  assert.ok(fightCandidates(short).some((c) => c.categoryId === "fight-damage"));
  assert.equal(fightCandidates(long).find((c) => c.categoryId === "fight-dps")?.value, 500);

  // "Survived" is the fight's account of how it ended, so a death and a cut-short fight both refuse.
  const survived = (endReason: FightStats["endReason"]) =>
    fightCandidates(fight({ yourTaken: 1800, endReason })).some((c) => c.categoryId === "taken-survived");
  assert.ok(survived("kill"));
  assert.ok(survived("timeout"));
  assert.ok(!survived("death"));
  assert.ok(!survived("cut"));
});

test("a fight is read for the biggest hits inside it, from its cells", () => {
  const banked = fight({
    byCombatant: [row("Kainos", true), row("a froglok shaman", false)],
    damageCells: [
      cell("a froglok shaman", "Kainos", "Melee", "Slash", 210),
      cell("a froglok shaman", "Kainos", "Spell", "Ice Comet", 640),
      cell("Kainos", "a froglok shaman", "Melee", "Bash", 155),
    ],
  });
  const found = new Map(fightCandidates(banked).map((c) => [c.categoryId, c.value]));
  // This is what lets a board be seeded from fights already on disk rather than starting empty.
  assert.equal(found.get("biggest-hit"), 640);
  assert.equal(found.get(meleeCategory("Slash")), 210);
  assert.equal(found.get("biggest-nuke"), 640);
  assert.equal(found.get("biggest-hit-taken"), 155);
});

test("a cell that is nothing but ticks is a DoT, and its biggest hit is a tick", () => {
  // Once your own ticks are read (ADR 0095) a DoT source appears as a cell whose hits are all ticks —
  // so the cell's maximum *is* the biggest tick, and the category stops being live-only.
  const allTicks = { ...cell("a froglok shaman", "Kainos", "Spell", "Stinging Swarm", 84), hits: 12, ticks: 12 };
  // A spell with a landing among its hits could have its maximum be that landing, not a tick.
  const mixed = { ...cell("a froglok shaman", "Kainos", "Spell", "Choke", 300), hits: 6, ticks: 5 };
  const banked = fight({ byCombatant: [row("Kainos", true)], damageCells: [allTicks, mixed] });
  const found = new Map(fightCandidates(banked).map((c) => [c.categoryId, c.value]));
  assert.equal(found.get("biggest-tick"), 84);
  assert.equal(found.get("biggest-nuke"), 300);
  assert.equal(categoryOf("biggest-tick").liveOnly, undefined);
});

test("a floor is what stops a trivial sample owning a category", () => {
  const at = AT;
  // One kill is not a streak, and the catalog says where a streak starts.
  assert.ok(!beats({ categoryId: "kill-streak", value: 1, at }, undefined));
  assert.ok(beats({ categoryId: "kill-streak", value: categoryOf("kill-streak").floor, at }, undefined));
  // A tie is not a record — which is also what keeps a fight's coarse re-reading of its own hits
  // from displacing the precise live candidate that already recorded them.
  const standing: HighScore = { categoryId: "biggest-hit", value: 400, at, beaten: 1 };
  assert.ok(!beats({ categoryId: "biggest-hit", value: 400, at }, standing));
  assert.ok(beats({ categoryId: "biggest-hit", value: 401, at }, standing));
});

test("a family id describes itself, and an unknown one still shows", () => {
  assert.equal(categoryOf(meleeCategory("Backstab")).label, "Biggest backstab");
  assert.equal(categoryOf(qualCategory("Crippling Blow")).label, "Biggest Crippling Blow");
  // A record on disk for a category we no longer ship has to be *shown*, not dropped.
  assert.equal(categoryOf("retired-thing").label, "retired-thing");
  assert.equal(formatScore("dps", 1234), "1,234/s");
  assert.equal(formatScore("sec", 95), "1m 35s");
});

// ── the keeper ────────────────────────────────────────────────────────────────

test("the first score in a category sets the bar silently; the next one is news", () => {
  const scores = createHighScores(tempDir());
  scores.setPlayer("Kainos");
  const announced: HighScore[] = [];
  scores.onRecord((r) => announced.push(r));

  scores.offer([{ categoryId: "biggest-hit", value: 400, at: AT }], "Lake of Ill Omen");
  // Rule 2: nothing to beat, so nothing to shout about — but it's on the board.
  assert.equal(announced.length, 0);
  assert.equal(scores.board().scores.find((s) => s.categoryId === "biggest-hit")?.value, 400);
  assert.equal(scores.board().scores[0].previous, undefined);

  scores.offer([{ categoryId: "biggest-hit", value: 512, at: AT }], "Lake of Ill Omen");
  assert.equal(announced.length, 1);
  assert.equal(announced[0].previous, 400);
  assert.equal(announced[0].value, 512);
  assert.equal(announced[0].beaten, 2);
  assert.equal(announced[0].zone, "Lake of Ill Omen");
});

test("a replayed gap is filed and never announced", () => {
  const scores = createHighScores(tempDir());
  scores.setPlayer("Kainos");
  const announced: HighScore[] = [];
  scores.onRecord((r) => announced.push(r));

  scores.setQuiet(true);
  scores.offer([{ categoryId: "biggest-hit", value: 400, at: AT }]);
  scores.offer([{ categoryId: "biggest-hit", value: 900, at: AT }]);
  // Rule 3: both landed, neither spoke — a banner for last night's hit is a lie about the present.
  assert.equal(announced.length, 0);
  assert.equal(scores.board().scores[0].value, 900);

  scores.setQuiet(false);
  scores.offer([{ categoryId: "biggest-hit", value: 901, at: AT }]);
  assert.equal(announced.length, 1);
});

test("a board belongs to a character, and comes back to the right one", () => {
  const dir = tempDir();
  const scores = createHighScores(dir);
  scores.setPlayer("Kainos");
  scores.offer([{ categoryId: "biggest-hit", value: 400, at: AT }]);

  scores.setPlayer("Newbie");
  // Rule 1: a fresh alt is not measured against a level 50's bar, and does not inherit it.
  assert.equal(scores.board().scores.length, 0);
  scores.offer([{ categoryId: "biggest-hit", value: 12, at: AT }]);
  assert.equal(scores.board().scores[0].value, 12);

  scores.setPlayer("Kainos");
  assert.equal(scores.board().scores[0].value, 400);
  scores.flush();

  // …and both survive a reload, keyed by name rather than by whoever was logged in last.
  const reopened = createHighScores(dir);
  reopened.setPlayer("kainos"); // the log capitalises a name to start a sentence
  assert.equal(reopened.board().scores[0].value, 400);
  reopened.setPlayer("Newbie");
  assert.equal(reopened.board().scores[0].value, 12);
});

test("a kill streak announces the crossing and then keeps quiet", () => {
  const scores = createHighScores(tempDir());
  scores.setPlayer("Kainos");
  const announced: HighScore[] = [];
  scores.onRecord((r) => announced.push(r));

  const floor = categoryOf("kill-streak").floor;
  for (let n = 0; n < floor; n++) scores.noteKill(AT);
  // The floor's own kill sets the bar (rule 2), so nothing has been said yet.
  assert.equal(announced.length, 0);
  assert.equal(scores.board().streak, floor);

  scores.noteKill(AT); // the crossing
  assert.equal(announced.length, 1);
  assert.equal(announced[0].value, floor + 1);

  // Rule 4: this streak already holds the record, so it climbs in silence rather than chanting.
  for (let n = 0; n < 10; n++) scores.noteKill(AT);
  assert.equal(announced.length, 1);
  assert.equal(scores.board().scores.find((s) => s.categoryId === "kill-streak")?.value, floor + 11);

  // Dying ends the streak, and makes the next crossing news again.
  scores.noteDeath();
  assert.equal(scores.board().streak, 0);
  for (let n = 0; n < floor + 12; n++) scores.noteKill(AT);
  assert.equal(announced.length, 2);
  assert.equal(announced[1].value, floor + 12);
});

test("a board is seeded from this character's past fights, once, in silence", () => {
  const scores = createHighScores(tempDir());
  const announced: HighScore[] = [];
  scores.onRecord((r) => announced.push(r));
  scores.setPlayer("Kainos");

  scores.seed([
    stored("eqlog_Kainos_legends.txt", fight({ yourDealt: 900, durationSec: 60 })),
    stored("eqlog_Kainos_legends.txt", fight({ yourDealt: 4000, durationSec: 60 })),
    // Another character's evening, which must not land on this board (rule 1's other half).
    stored("eqlog_Someone_legends.txt", fight({ yourDealt: 99_999, durationSec: 60 })),
  ]);
  const board = scores.board();
  assert.ok(board.seeded);
  assert.equal(announced.length, 0);
  assert.equal(board.scores.find((s) => s.categoryId === "fight-damage")?.value, 4000);
  // Oldest first, so the board's history of itself is true: 900 set the bar, 4000 beat it.
  assert.equal(board.scores.find((s) => s.categoryId === "fight-damage")?.previous, 900);

  // Seeding is once ever, so a second log-file change doesn't re-read the whole history.
  scores.seed([stored("eqlog_Kainos_legends.txt", fight({ yourDealt: 8000, durationSec: 60 }))]);
  assert.equal(scores.board().scores.find((s) => s.categoryId === "fight-damage")?.value, 4000);
  // …whereas eating a log explicitly asks for them to be read in, and still says nothing.
  scores.absorb([stored("eqlog_Kainos_legends.txt", fight({ yourDealt: 8000, durationSec: 60 }))]);
  assert.equal(scores.board().scores.find((s) => s.categoryId === "fight-damage")?.value, 8000);
  assert.equal(announced.length, 0);
});

test("clearing a board leaves it cleared, rather than re-seeding itself", () => {
  const scores = createHighScores(tempDir());
  scores.setPlayer("Kainos");
  scores.offer([{ categoryId: "biggest-hit", value: 400, at: AT }]);
  const cleared = scores.clear();
  assert.equal(cleared.scores.length, 0);
  assert.equal(cleared.streak, 0);
  // "Forget my records" plainly doesn't mean "put most of them straight back from history".
  scores.seed([stored("eqlog_Kainos_legends.txt", fight({ yourDealt: 4000, durationSec: 60 }))]);
  assert.equal(scores.board().scores.length, 0);
});

// ── fixtures ──────────────────────────────────────────────────────────────────

/** A damage line, with only what a given test cares about set. */
function damage(over: Partial<DamageEvent> & Pick<DamageEvent, "attacker" | "target" | "amount">): DamageEvent {
  return {
    kind: "damage",
    at: AT,
    logId: 1,
    raw: `${over.attacker} hits ${over.target} for ${over.amount} points of damage.`,
    melee: false,
    ...over,
  };
}

function row(name: string, isMine: boolean): CombatantStat {
  return {
    name,
    dealt: 0,
    taken: 0,
    healed: 0,
    hits: 1,
    misses: 0,
    crits: 0,
    maxHit: 0,
    activeSec: 1,
    dps: 0,
    mine: isMine,
    byStance: [],
    byType: [],
    bySpell: [],
    specials: [],
  };
}

function cell(target: string, attacker: string, kind: DamageKind, source: string, maxHit: number): DamageCell {
  return { target, attacker, kind, source, damage: maxHit, hits: 1, ticks: 0, misses: 0, crits: 0, maxHit };
}

/** A banked fight, with only the fields a given test cares about set. */
function fight(over: Partial<FightStats> = {}): FightStats {
  return {
    startedAt: AT,
    endedAt: AT,
    durationSec: 60,
    spanSec: 60,
    totalDealt: 0,
    yourDealt: 0,
    yourTaken: 0,
    byCombatant: [],
    spells: [],
    byMob: [],
    kills: 0,
    xpPct: 0,
    xpGains: 0,
    soloXp: 0,
    partyXp: 0,
    copper: 0,
    soldCopper: 0,
    yourPerSec: [],
    deaths: [],
    invocations: [],
    endReason: "kill",
    ...over,
  };
}

/**
 * A stored fight from one character's log. The **log file** is what attributes it, which is the whole
 * mechanism keeping one character's history off another's board.
 */
let seq = 0;
function stored(logFile: string, stats: FightStats): StoredFight {
  seq += 1;
  // Distinct start times, in order, so "oldest first" has something to sort by.
  const at = `2026-08-1${Math.min(9, seq)}T21:00:00.000Z`;
  return {
    id: `f${seq}`,
    sessionId: "s1",
    label: "a froglok shaman",
    zone: "Lake of Ill Omen",
    logFile,
    stats: { ...stats, startedAt: at, endedAt: at },
  };
}
