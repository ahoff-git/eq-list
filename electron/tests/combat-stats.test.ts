/**
 * Black-box tests for the damage meter's tracker. Timing comes from the log's own
 * timestamps, so these are exact — no clocks, no sleeps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCombatStats } from "../combat-stats";
import { drillDown, sumDamage } from "../../src/shared/damage-tree";
import type { DamageAxis } from "../../src/shared/types";
import { parseCombat } from "../../src/shared/combat-parser";
import { parseParty, splitLine } from "../../src/shared/log-parser";
import type { CoinEvent, CombatEvent, LootEvent, XpEvent } from "../../src/shared/types";

/** `sec` seconds past midnight as mm:ss — seconds roll into minutes, as a clock does. */
function clock(sec: number): string {
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `00:${mm}:${ss}`;
}

/** A log timestamp `sec` seconds past midnight, in the shape the parsers produce. */
const stamp = (sec: number) => `2026-07-29T${clock(sec)}`;

/** An experience gain, as the watcher would hand it over. */
function xp(pct: number, sec: number, party = false): XpEvent {
  return { kind: "xp", party, pct, logId: 1, raw: "You gain experience!", at: stamp(sec) };
}

/** Coin off a corpse (or, with `from: "item"`, an auto-sold item's). */
function coin(copper: number, sec: number, from: CoinEvent["from"] = "corpse"): CoinEvent {
  return { kind: "coin", from, copper, logId: 1, raw: "You receive", at: stamp(sec) };
}

/** An auto-sold drop, as `parseLoot` hands it over — priced, and naming the corpse. */
function sold(item: string, source: string, copper: number, sec: number): LootEvent {
  return {
    kind: "loot",
    item,
    qty: 1,
    source,
    fate: "sold",
    soldFor: copper,
    logId: 1,
    raw: "You looted",
    at: stamp(sec),
  };
}

/** Feed lines as if they were tailed from a log, `sec` seconds past midnight. */
function feed(tracker: ReturnType<typeof createCombatStats>, lines: [sec: number, message: string][]): void {
  for (const [sec, message] of lines) {
    const event = parseCombat(splitLine(`[Wed Jul 29 ${clock(sec)} 2026] ${message}`, 1)!) as CombatEvent;
    assert.ok(event, `expected to parse: ${message}`);
    tracker.record(event);
  }
}

const tracker = () => createCombatStats(() => "2026-07-29T00:00:00.000Z");

/** The Targets view's drill order — the one the panel opens on. */
const VICTIM_FIRST: DamageAxis[] = ["attacker", "kind", "source"];

test("tallies damage dealt and taken per combatant", () => {
  const t = tracker();
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    [2, "You pierce a coyote for 20 points of damage."],
    [3, "A coyote bites YOU for 5 points of damage."],
  ]);

  const rows = t.snapshot().fight.byCombatant;
  const you = rows.find((r) => r.name === "You")!;
  const coyote = rows.find((r) => r.name === "a coyote")!;
  assert.equal(you.dealt, 30);
  assert.equal(you.taken, 5);
  assert.equal(you.maxHit, 20);
  assert.equal(coyote.dealt, 5);
  assert.equal(coyote.taken, 30);
  // Biggest dealer first.
  assert.equal(rows[0].name, "You");
});

test("DPS uses the span of that combatant's own damage", () => {
  const t = tracker();
  feed(t, [
    [10, "You pierce a coyote for 30 points of damage."],
    [20, "You pierce a coyote for 30 points of damage."],
  ]);
  const you = t.snapshot().fight.byCombatant.find((r) => r.name === "You")!;
  assert.equal(you.activeSec, 10);
  assert.equal(you.dps, 6); // 60 damage over 10s
});

test("a single hit doesn't read as infinite DPS", () => {
  const t = tracker();
  feed(t, [[5, "You pierce a coyote for 42 points of damage."]]);
  const you = t.snapshot().fight.byCombatant.find((r) => r.name === "You")!;
  assert.equal(you.activeSec, 1);
  assert.equal(you.dps, 42);
});

test("misses count toward accuracy but add no damage", () => {
  const t = tracker();
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    [2, "You try to pierce a coyote, but miss!"],
  ]);
  const you = t.snapshot().fight.byCombatant.find((r) => r.name === "You")!;
  assert.equal(you.hits, 1);
  assert.equal(you.misses, 1);
  assert.equal(you.dealt, 10);
});

test("a lull does not split a fight while the enemy is still up — it chases until dead", () => {
  const t = tracker();
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    [30, "You pierce a coyote for 7 points of damage."], // 29s later, nothing died: still one fight
  ]);

  const s = t.snapshot();
  assert.equal(s.fight.totalDealt, 17); // one continuous fight through the lull, not two
  assert.equal(s.session.totalDealt, 17);
});

test("once the mob is dead, a lull starts the next fight", () => {
  const t = tracker();
  feed(t, [[1, "You pierce a coyote for 10 points of damage."]]);
  t.recordKill("a coyote", stamp(1)); // the coyote dies — the fight is resolved
  feed(t, [[20, "You pierce a rat for 7 points of damage."]]); // 19s after the kill: a new pull, a new fight

  const s = t.snapshot();
  assert.equal(s.fight.totalDealt, 7); // just the new pull
  assert.deepEqual(
    s.fight.byCombatant.map((r) => r.name),
    ["You", "a rat"],
  );
  assert.equal(s.session.totalDealt, 17);
  assert.equal(s.session.byCombatant.length, 3); // you + both mobs, across the session
});

test("damage inside the idle window stays in one fight", () => {
  const t = tracker();
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    [9, "You pierce a coyote for 10 points of damage."],
  ]);
  assert.equal(t.snapshot().fight.totalDealt, 20);
});

test("session DPS counts combat time, not the calendar span", () => {
  const t = tracker();
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    [3, "You pierce a coyote for 10 points of damage."], // 2s of fighting
    [50, "You pierce a rat for 10 points of damage."], // …then 47s of downtime
    [52, "You pierce a rat for 10 points of damage."], // …then 2s more
  ]);

  const s = t.snapshot();
  assert.equal(s.session.durationSec, 4); // 2 + 2, downtime excluded
  const you = s.session.byCombatant.find((r) => r.name === "You")!;
  assert.equal(you.activeSec, 4);
  assert.equal(you.dps, 10); // 40 damage in 4s of swinging
});

test("downtime healing lands in the session but invents no fight", () => {
  const t = tracker();
  feed(t, [[1, "You healed Kainos`s warder for 8 hit points."]]);

  const s = t.snapshot();
  assert.equal(s.fight.byCombatant.length, 0);
  assert.equal(s.session.byCombatant.find((r) => r.name === "You")!.healed, 8);
});

test("healing during a fight belongs to that fight", () => {
  const t = tracker();
  feed(t, [
    [1, "A coyote bites Kainos`s warder for 4 points of damage."],
    [2, "You healed Kainos`s warder for 8 hit points."],
  ]);
  assert.equal(t.snapshot().fight.byCombatant.find((r) => r.name === "You")!.healed, 8);
});

test("your rows are flagged — you and your pet, not the mobs", () => {
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    [2, "Kainos`s warder bites a coyote for 4 points of damage."],
    [3, "A coyote bites YOU for 5 points of damage."],
  ]);

  const s = t.snapshot();
  const mine = s.fight.byCombatant.filter((r) => r.mine).map((r) => r.name);
  assert.deepEqual(mine.sort(), ["Kainos`s warder", "You"]);
  assert.equal(s.fight.yourDealt, 14);
  assert.equal(s.fight.yourTaken, 5);
});

test("a named pet's damage is dropped until the game says the pet is yours", () => {
  // The bug this pins: a pet with its own name is written exactly like a stranger, so with
  // neither side of the exchange recognised as ours, `fight-scope` reads the whole fight as
  // somebody else's and drops it — the damage went *missing*, not merely onto the wrong row.
  const before = tracker();
  before.setPlayer("Kainos");
  feed(before, [[1, "Garn hits a coyote for 12 points of damage."]]);
  assert.equal(before.snapshot().fight.yourDealt, 0, "a name alone must never be claimed as yours");

  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    // The game addresses this to the pet's owner and nobody else, which is what makes it proof.
    [1, "Garn told you, 'Attacking a coyote Master.'"],
    [2, "Garn hits a coyote for 12 points of damage."],
    [3, "A coyote bites Garn for 3 points of damage."],
  ]);

  const s = t.snapshot();
  assert.equal(s.fight.yourDealt, 12);
  assert.ok(
    s.fight.byCombatant.find((r) => r.name === "Garn")?.mine,
    "the pet's row should be flagged as yours",
  );
});

test("a pet's engage names the enemy, so the pet can open the fight alone", () => {
  // A pet sent in ahead of you swings first. Without the engage line admitting the coyote,
  // that first hit would have to open a fight on its own — and it can't, because at that
  // moment nothing has established the coyote is anyone's enemy.
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    [1, "Garn told you, 'Attacking a coyote Master.'"],
    [2, "Garn hits a coyote for 7 points of damage."],
    [9, "You pierce a coyote for 10 points of damage."],
  ]);

  const s = t.snapshot();
  assert.equal(s.fight.yourDealt, 17, "both the pet's opener and your own swing are one fight");
});

test("a group-mate is not adopted as a pet by having a pet-shaped name", () => {
  // The trap the registry exists to avoid: in a damage line "Galactic" and "Garn" are the
  // same shape, so anything that guessed from the name would quietly count a group-mate's
  // damage as your own.
  const t = tracker();
  t.setPlayer("Kainos");
  t.recordParty(parseParty(splitLine("[Wed Jul 29 00:00:01 2026] Galactic has joined the group.", 1)!)!);
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    [2, "Galactic hits a coyote for 40 points of damage."],
  ]);

  const s = t.snapshot();
  // The group-mate's damage counts toward the fight (it's your side's fight) but is not yours.
  assert.equal(s.fight.yourDealt, 10);
  assert.equal(s.fight.byCombatant.find((r) => r.name === "Galactic")?.mine, false);
});

test("switching character forgets the last one's pets", () => {
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [[1, "Garn told you, 'Attacking a coyote Master.'"]]);
  t.setPlayer("Someone");
  feed(t, [[2, "Garn hits a coyote for 12 points of damage."]]);

  assert.equal(t.snapshot().fight.yourDealt, 0, "the old character's pet is not this one's");
});

/** The reasons banked fights ended with, in order — what `fightEnd` carried. */
function endReasons(t: ReturnType<typeof createCombatStats>): (string | undefined)[] {
  const seen: (string | undefined)[] = [];
  t.onFightEnd((f) => seen.push(f.endReason));
  return seen;
}

test("a fight that ended in a kill says so", () => {
  const t = tracker();
  const reasons = endReasons(t);
  feed(t, [[1, "You pierce a coyote for 10 points of damage."]]);
  t.recordKill("a coyote", stamp(2));
  // Past SETTLED_END_MS, so the resolved fight closes and the next swing opens a new one.
  feed(t, [[40, "You pierce a rat for 10 points of damage."]]);
  assert.deepEqual(reasons, ["kill"]);
});

test("a fight that ended in your death says so", () => {
  const t = tracker();
  t.setPlayer("Kainos");
  const reasons = endReasons(t);
  feed(t, [
    [1, "A coyote bites YOU for 5 points of damage."],
    [2, "You have been slain by a coyote!"],
    [40, "You pierce a rat for 10 points of damage."],
  ]);
  assert.deepEqual(reasons, ["death"]);
});

test("a fight nothing resolved is a timeout, not a kill", () => {
  // The mob was still up when the log went quiet — it fled, you zoned, or the log lagged.
  // It takes the *long* gap to close, which is what tells it apart from a settled fight.
  const t = tracker();
  const reasons = endReasons(t);
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    [200, "You pierce a rat for 10 points of damage."],
  ]);
  assert.deepEqual(reasons, ["timeout"]);
});

test("a reset banks the fight as cut, not as something the log ended", () => {
  const t = tracker();
  const reasons = endReasons(t);
  feed(t, [[1, "You pierce a coyote for 10 points of damage."]]);
  t.reset();
  assert.deepEqual(reasons, ["cut"]);
});

test("the later of a kill and a death is what ended the fight", () => {
  // You kill one, its friend kills you: the death is the last word.
  const t = tracker();
  t.setPlayer("Kainos");
  const reasons = endReasons(t);
  feed(t, [[1, "You pierce a coyote for 10 points of damage."]]);
  t.recordKill("a coyote", stamp(2));
  feed(t, [
    [3, "A rat bites YOU for 5 points of damage."],
    [4, "You have been slain by a rat!"],
    [40, "You pierce a bat for 10 points of damage."],
  ]);
  assert.deepEqual(reasons, ["death"]);
});

test("fight duration and window timestamps come from the log", () => {
  const t = tracker();
  feed(t, [
    [4, "You pierce a coyote for 10 points of damage."],
    [12, "You pierce a coyote for 10 points of damage."],
  ]);
  const f = t.snapshot().fight;
  assert.equal(f.durationSec, 8);
  assert.match(f.startedAt, /T/);
  assert.notEqual(f.startedAt, f.endedAt);
});

test("reset clears both windows", () => {
  const t = tracker();
  feed(t, [[1, "You pierce a coyote for 10 points of damage."]]);
  t.reset();
  const s = t.snapshot();
  assert.equal(s.fight.byCombatant.length, 0);
  assert.equal(s.session.byCombatant.length, 0);
  assert.equal(s.session.totalDealt, 0);
});

// ── mana, from the game's own spell file (the log never states it) ──

/** A tracker that knows what spells cost — the shape `main.ts` builds from the spell catalog. */
const meteredTracker = (costs: Record<string, number>) =>
  createCombatStats(
    () => "2026-07-29T00:00:00.000Z",
    (spell, rank) => costs[rank ? `${spell} ${rank}` : spell] ?? costs[spell],
  );

/** The row for one spell in the current fight. */
const spellRow = (t: ReturnType<typeof createCombatStats>, name: string) =>
  t.snapshot().session.spells.find((s) => s.spell === name);

test("a spell's mana cost and total spend come from the spell file", () => {
  const t = meteredTracker({ "Burst of Fire": 7 });
  feed(t, [
    [1, "You begin casting Burst of Fire."],
    [2, "You hit a coyote for 30 points of fire damage by Burst of Fire."],
    [5, "You begin casting Burst of Fire."],
    [6, "You hit a coyote for 20 points of fire damage by Burst of Fire."],
  ]);

  const row = spellRow(t, "Burst of Fire");
  assert.equal(row?.manaCost, 7);
  assert.equal(row?.manaSpent, 14, "two casts at 7");
  assert.equal(row?.damagePerMana, 3.57, "50 damage for 14 mana, to two places");
});

test("damage per mana is the point of all this", () => {
  // A big nuke and a small one, priced: the cheap one is the efficient one even though the
  // expensive one does more damage. This is the figure the log alone can never produce.
  const t = meteredTracker({ "Big Nuke": 100, "Small Nuke": 10 });
  feed(t, [
    [1, "You begin casting Big Nuke."],
    [2, "You hit a coyote for 200 points of fire damage by Big Nuke."],
    [5, "You begin casting Small Nuke."],
    [6, "You hit a coyote for 50 points of fire damage by Small Nuke."],
  ]);

  assert.equal(spellRow(t, "Big Nuke")?.damagePerMana, 2);
  assert.equal(spellRow(t, "Small Nuke")?.damagePerMana, 5);
});

test("a rank is priced as itself, not as the base spell", () => {
  const t = meteredTracker({ "Shock of Lightning": 20, "Shock of Lightning VI": 110 });
  feed(t, [
    [1, "You begin casting Shock of Lightning VI."],
    [2, "You hit a coyote for 300 points of magic damage by Shock of Lightning."],
  ]);
  assert.equal(spellRow(t, "Shock of Lightning")?.manaCost, 110);
});

test("a fizzle still costs its mana", () => {
  // The log reports no mana, so spend is derived from casts *begun* — which is how EQ behaves,
  // and why a fizzle stings. Pinned because it's an assumption, not an observation.
  const t = meteredTracker({ "Burst of Fire": 7 });
  feed(t, [
    [1, "You begin casting Burst of Fire."],
    [2, "Your Burst of Fire spell fizzles!"],
  ]);
  assert.equal(spellRow(t, "Burst of Fire")?.manaSpent, 7);
});

test("a free spell has no efficiency rather than an infinite one", () => {
  // Zero mana is a real answer (bard songs), and dividing by it isn't an efficiency.
  const t = meteredTracker({ "Chant of Battle": 0 });
  feed(t, [
    [1, "You begin casting Chant of Battle."],
    [2, "You hit a coyote for 10 points of magic damage by Chant of Battle."],
  ]);
  const row = spellRow(t, "Chant of Battle");
  assert.equal(row?.manaCost, 0, "free is a fact, not a blank");
  assert.equal(row?.damagePerMana, undefined);
});

test("an unpriced spell stays blank instead of reading as free", () => {
  const t = meteredTracker({});
  feed(t, [
    [1, "You begin casting Mystery Spell."],
    [2, "You hit a coyote for 10 points of magic damage by Mystery Spell."],
  ]);
  const row = spellRow(t, "Mystery Spell");
  assert.equal(row?.manaCost, undefined);
  assert.equal(row?.manaSpent, undefined);
  assert.equal(row?.damagePerMana, undefined);
});

test("the window's mana total says how much of itself it covers", () => {
  const t = meteredTracker({ "Burst of Fire": 7 });
  feed(t, [
    [1, "You begin casting Burst of Fire."],
    [2, "You hit a coyote for 30 points of fire damage by Burst of Fire."],
    [5, "You begin casting Mystery Spell."],
    [6, "You hit a coyote for 10 points of magic damage by Mystery Spell."],
  ]);

  const s = t.snapshot().session;
  assert.equal(s.manaSpent, 7);
  assert.deepEqual(s.manaKnownCasts, { known: 1, total: 2 }, "a partial total must say it's partial");
});

test("with no spell file there are no mana figures at all", () => {
  // The default tracker — and the state of every install without the game's file.
  const t = tracker();
  feed(t, [
    [1, "You begin casting Burst of Fire."],
    [2, "You hit a coyote for 30 points of fire damage by Burst of Fire."],
  ]);
  const s = t.snapshot().session;
  assert.equal(s.manaSpent, undefined);
  assert.equal(s.manaKnownCasts, undefined);
  assert.equal(spellRow(t, "Burst of Fire")?.manaCost, undefined);
});

// ── per-spell stats: cast time and resist rate, both measured from the log ──
test("a spell's cast time is the gap from 'begin casting' to the effect landing", () => {
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    [1, "You begin casting Blast of Cold."],
    [4, "You hit a coyote for 12 points of cold damage by Blast of Cold."],
    [6, "You begin casting Blast of Cold."],
    [9, "You hit a coyote for 18 points of cold damage by Blast of Cold."],
  ]);

  const s = t.snapshot().session.spells.find((x) => x.spell === "Blast of Cold")!;
  assert.equal(s.casts, 2);
  assert.equal(s.lands, 2);
  assert.equal(s.damage, 30);
  assert.equal(s.maxHit, 18);
  assert.equal(s.avgCastSec, 3);
  assert.equal(s.dpc, 5); // 30 damage over 6s of casting
});

test("a ranked cast and its damage are one spell, not two", () => {
  // Real EQL wording: the cast names the rank, the damage names the base spell. Keying
  // on the raw text filed "Shock of Lightning VI" (52 casts, no damage) apart from
  // "Shock of Lightning" (all the damage, no cast time).
  const t = tracker();
  feed(t, [
    [1, "You begin casting Shock of Lightning VI."],
    [3, "You hit a coyote for 100 points of magic damage by Shock of Lightning."],
  ]);

  const spells = t.snapshot().session.spells;
  assert.equal(spells.length, 1);
  assert.equal(spells[0].spell, "Shock of Lightning");
  assert.equal(spells[0].casts, 1);
  assert.equal(spells[0].lands, 1);
  assert.equal(spells[0].avgCastSec, 2);
  assert.equal(spells[0].dpc, 50); // 100 damage per cast, 2s per cast
});

test("dmg/s cast isn't inflated when only some casts could be timed", () => {
  const t = tracker();
  feed(t, [
    [1, "You begin casting Frost Bolt."],
    [3, "You hit a coyote for 10 points of cold damage by Frost Bolt."],
    // A landing with no "begin casting" ahead of it: damage counts, time can't.
    [8, "You hit a coyote for 10 points of cold damage by Frost Bolt."],
  ]);

  const s = t.snapshot().session.spells[0];
  assert.equal(s.damage, 20);
  assert.equal(s.avgCastSec, 2);
  // Per-landing damage (10) over the average cast (2s) — not 20 damage over the one
  // measured 2s cast, which would claim 10/s.
  assert.equal(s.dpc, 5);
});

test("fizzles, interrupts and resists are tallied, and give a resist rate", () => {
  const t = tracker();
  feed(t, [
    [1, "You begin casting Blast of Cold."],
    [3, "You hit a coyote for 10 points of cold damage by Blast of Cold."],
    [5, "You begin casting Blast of Cold."],
    [7, "A coyote resisted your Blast of Cold!"],
    [9, "You begin casting Blast of Cold."],
    [10, "Your Blast of Cold spell fizzles!"],
    [12, "You begin casting Blast of Cold."],
    [13, "Your Blast of Cold spell is interrupted."],
  ]);

  const s = t.snapshot().session.spells.find((x) => x.spell === "Blast of Cold")!;
  assert.equal(s.casts, 4);
  assert.equal(s.lands, 1);
  assert.equal(s.resists, 1);
  assert.equal(s.fizzles, 1);
  assert.equal(s.interrupts, 1);
  // Only completed casts count: 1 landed, 1 resisted → 50%. A fizzle never completed.
  assert.equal(s.resistRate, 0.5);
});

test("a resisted cast doesn't get paired with the next spell's landing", () => {
  const t = tracker();
  feed(t, [
    [1, "You begin casting Frost Bolt."],
    [2, "A coyote resisted your Frost Bolt!"],
    [3, "You hit a coyote for 12 points of cold damage by Blast of Cold."],
  ]);
  const bolt = t.snapshot().session.spells.find((x) => x.spell === "Frost Bolt")!;
  const blast = t.snapshot().session.spells.find((x) => x.spell === "Blast of Cold")!;
  assert.equal(bolt.avgCastSec, 0); // never landed, so nothing was timed
  assert.equal(blast.avgCastSec, 0); // and it didn't inherit Frost Bolt's cast
  assert.equal(blast.damage, 12);
});

test("DoT ticks add damage to the spell but aren't extra landings", () => {
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    [1, "You begin casting Engulfing Darkness."],
    [2, "You hit a coyote for 8 points of disease damage by Engulfing Darkness."],
    [3, "A coyote has taken 5 damage by Engulfing Darkness."],
    [9, "A coyote has taken 6 damage by Engulfing Darkness."],
  ]);
  const s = t.snapshot().session.spells.find((x) => x.spell === "Engulfing Darkness")!;
  assert.equal(s.casts, 1);
  // One cast, one landing — a tick is never counted as a fresh cast, however many arrive.
  assert.equal(s.lands, 1);
  assert.equal(s.ticks, 2);
  // …and every one of them is that spell's damage: 8 landed + 5 + 6 ticked (ADR 0071).
  assert.equal(s.damage, 19);
  assert.equal(s.tickDamage, 11);
  assert.equal(s.maxTick, 6);
  // `maxHit` stays "biggest landing", so the two figures don't blur into each other.
  assert.equal(s.maxHit, 8);
});

// The bug this fixes: EQ Legends words a DoT's ticks without a caster, so before ADR 0071 the
// ticks — nearly all of a DoT's damage — landed in a phantom row named after the spell, and the
// spell's own row showed the first hit only.
test("a caster-less DoT tick is your damage, not a combatant named after the spell", () => {
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    [1, "You begin casting Engulfing Darkness."],
    [2, "You hit a coyote for 8 points of disease damage by Engulfing Darkness."],
    [3, "A coyote has taken 5 damage by Engulfing Darkness."],
    [9, "A coyote has taken 6 damage by Engulfing Darkness."],
  ]);
  const fight = t.snapshot().fight;
  assert.equal(fight.byCombatant.find((r) => r.name === "Engulfing Darkness"), undefined);
  const you = fight.byCombatant.find((r) => r.name === "You")!;
  assert.equal(you.dealt, 19);
  assert.equal(fight.yourDealt, 19);
  // The cast landing and its ticks are one source on your row, which is what a DoT is.
  assert.deepEqual(you.bySpell.find((x) => x.spell === "Engulfing Darkness"), {
    spell: "Engulfing Darkness",
    hits: 3,
    damage: 19,
    maxHit: 8,
  });
});

test("a mob's DoT on you stays the mob's, and never reads as one of your spells", () => {
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    // You have to be in a fight with it for its lines to count at all (ADR 0067).
    [1, "You pierce a large plague rat for 6 points of damage."],
    // The long form names the caster; the short one names nobody and nobody cast it, so the
    // DoT stands as its own attacker — the log's limit, not a guess.
    [2, "You have taken 1 damage from Plague Rat Disease by a large plague rat."],
    [8, "Kainos`s warder has taken 1 damage by Plague Rat Disease."],
  ]);
  const fight = t.snapshot().fight;
  assert.equal(fight.spells.find((s) => s.spell === "Plague Rat Disease"), undefined);
  assert.equal(fight.byCombatant.find((r) => r.name === "a large plague rat")?.dealt, 1);
  assert.equal(fight.byCombatant.find((r) => r.name === "Plague Rat Disease")?.dealt, 1);
});

test("a group-mate's DoT ticks are their damage, not yours", () => {
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    [1, "You pierce a coyote for 6 points of damage."],
    [2, "Hullshamancer begins casting Engulfing Darkness."],
    [3, "A coyote has taken 5 damage by Engulfing Darkness."],
  ]);
  const fight = t.snapshot().fight;
  assert.equal(fight.byCombatant.find((r) => r.name === "Hullshamancer")?.dealt, 5);
  assert.equal(fight.yourDealt, 6);
  // Their spell, so it stays out of *your* spell table (which is only ever about your casts).
  assert.equal(fight.spells.find((s) => s.spell === "Engulfing Darkness"), undefined);
});

// A DoT outlives the pull that started it, and a tick is not a swing — so ticks alone must not
// open a fight, but they must still count towards the one they belong to.
test("a DoT that ticks past the end of a fight still counts as your damage", () => {
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    [1, "You begin casting Engulfing Darkness."],
    [2, "You hit a coyote for 8 points of disease damage by Engulfing Darkness."],
    [8, "A coyote has taken 5 damage by Engulfing Darkness."],
  ]);
  const session = t.snapshot().session;
  assert.equal(session.yourDealt, 13);
  assert.equal(session.spells.find((s) => s.spell === "Engulfing Darkness")?.tickDamage, 5);
});

test("other people's spells stay out of your spell table", () => {
  const t = tracker();
  feed(t, [
    [1, "Hullshamancer begins casting Lifespike."],
    [3, "Hullshamancer healed himself for 10 hit points by Lifespike."],
  ]);
  assert.equal(t.snapshot().session.spells.length, 0);
});

test("healing spells are tallied with what they actually restored", () => {
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    [1, "A coyote bites Kainos`s warder for 4 points of damage."],
    [2, "You begin casting Inner Fire."],
    [4, "You healed Kainos`s warder for 8 (20) hit points by Inner Fire."],
  ]);
  const s = t.snapshot().session.spells.find((x) => x.spell === "Inner Fire")!;
  assert.equal(s.healed, 8);
  assert.equal(s.lands, 1);
  assert.equal(s.avgCastSec, 2);
});

test("finished fights are handed off for history, with the fight's own totals", () => {
  const t = tracker();
  const ended: number[] = [];
  t.onFightEnd((f) => ended.push(f.totalDealt));
  feed(t, [[1, "You pierce a coyote for 10 points of damage."]]);
  t.recordKill("a coyote", stamp(1)); // resolved, so the following lull can end the fight
  feed(t, [[30, "You pierce a rat for 7 points of damage."]]); // lull after the kill → first fight ends
  assert.deepEqual(ended, [10]);

  t.flush(); // quitting closes the fight in progress
  assert.deepEqual(ended, [10, 7]);
});

// ── camp efficiency: kill times, experience rates, downtime, deaths ──
test("time-to-kill is measured between kills in a fight", () => {
  const t = tracker();
  feed(t, [[10, "You pierce a coyote for 10 points of damage."]]);
  t.recordKill("a coyote", stamp(14)); // 4s from the fight's first swing
  feed(t, [[16, "You pierce a coyote for 10 points of damage."]]);
  t.recordKill("a coyote", stamp(20)); // 6s from the previous kill

  const mob = t.snapshot().session.byMob.find((m) => m.mob === "a coyote")!;
  assert.equal(mob.kills, 2);
  assert.equal(mob.avgKillSec, 5); // (4 + 6) / 2
});

test("experience is credited to the mob that just died, and drives XP/min", () => {
  const t = tracker();
  feed(t, [[10, "You pierce a coyote for 10 points of damage."]]);
  t.recordKill("a coyote", stamp(20));
  t.recordXp(xp(1.5, 21)); // within the attribution window
  t.recordXp(xp(0.5, 120)); // long after — counted for the session, not the mob

  const s = t.snapshot().session;
  assert.equal(s.xpPct, 2);
  const mob = s.byMob.find((m) => m.mob === "a coyote")!;
  assert.equal(mob.xpPct, 1.5);
  assert.equal(mob.avgKillSec, 10);
  assert.equal(mob.xpPerMin, 9); // 1.5% per 10s
});

test("a session's span and combat time differ by its downtime", () => {
  const t = tracker();
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    [3, "You pierce a coyote for 10 points of damage."],
    [60, "You pierce a rat for 10 points of damage."],
    [62, "You pierce a rat for 10 points of damage."],
  ]);
  const s = t.snapshot().session;
  assert.equal(s.spanSec, 61); // first swing to last
  assert.equal(s.durationSec, 4); // actually fighting
});

test("a death records what was hitting you just before it", () => {
  const t = tracker();
  feed(t, [
    [10, "A skeleton punches YOU for 20 points of damage."],
    [12, "A coyote bites YOU for 5 points of damage."],
    [13, "A skeleton punches YOU for 30 points of damage."],
    [14, "You have been slain by a skeleton!"],
  ]);

  const [death] = t.snapshot().session.deaths;
  assert.ok(death);
  assert.equal(death.killer, "a skeleton");
  assert.equal(death.totalTaken, 55);
  assert.deepEqual(death.incoming, [
    { source: "a skeleton", amount: 50 },
    { source: "a coyote", amount: 5 },
  ]);
});

test("damage older than the recap window is left out of it", () => {
  const t = tracker();
  feed(t, [
    [1, "A coyote bites YOU for 99 points of damage."], // 40s before the death
    [40, "A skeleton punches YOU for 10 points of damage."],
    [41, "You died."],
  ]);
  const [death] = t.snapshot().session.deaths;
  assert.equal(death.killer, undefined); // "You died." names nobody
  assert.equal(death.totalTaken, 10);
});

test("your damage is bucketed per second for the sparkline", () => {
  const t = tracker();
  feed(t, [
    [10, "You pierce a coyote for 5 points of damage."],
    [10, "You pierce a coyote for 5 points of damage."], // same second
    [12, "You pierce a coyote for 7 points of damage."], // two seconds later
  ]);
  assert.deepEqual(t.snapshot().fight.yourPerSec, [10, 0, 7]);
});

test("one mob under two spellings is one row", () => {
  // EQ capitalizes a name at the start of a sentence and not mid-sentence, so the same
  // clockwork arrives as "Obsolete model" and "obsolete model".
  const t = tracker();
  feed(t, [
    [1, "Obsolete model punches YOU for 5 points of damage."],
    [2, "You pierce obsolete model for 10 points of damage."],
  ]);
  t.recordKill("Obsolete model", stamp(3));
  t.recordKill("obsolete model", stamp(5));

  const s = t.snapshot().session;
  assert.deepEqual(
    s.byCombatant.map((r) => r.name).sort(),
    ["Obsolete model", "You"],
  );
  assert.equal(s.byMob.length, 1);
  assert.equal(s.byMob[0].kills, 2);
});

test("experience messages are counted and split solo / party", () => {
  // These counters came from the retired session-stats module; one tracker owns them now.
  const t = tracker();
  t.recordXp(xp(1, 1));
  t.recordXp(xp(0.5, 2, true));
  t.recordXp(xp(0.25, 3, true));

  const s = t.snapshot().session;
  assert.equal(s.xpGains, 3);
  assert.equal(s.soloXp, 1);
  assert.equal(s.partyXp, 2);
  assert.equal(s.xpPct, 1.75);
});

// ── stance and invocation: the same spell is a different spell under each ──
test("a spell is split by the invocation active when it was cast", () => {
  const t = tracker();
  feed(t, [
    [1, "You begin reciting the empowering invocation."],
    [2, "You begin casting Blast of Cold."],
    [4, "You hit a coyote for 30 points of cold damage by Blast of Cold."],
    [6, "You begin reciting the arcane mastery invocation."],
    [7, "You begin casting Blast of Cold."],
    [8, "You hit a coyote for 60 points of cold damage by Blast of Cold."],
  ]);

  const spell = t.snapshot().session.spells.find((s) => s.spell === "Blast of Cold")!;
  // The row itself stays the blend — that's what the table shows at a glance.
  assert.equal(spell.casts, 2);
  assert.equal(spell.damage, 90);

  // …and the split is what makes the blend interpretable: same spell, different cast time
  // and different damage under each invocation.
  const arcane = spell.byInvocation.find((m) => m.mode === "arcane mastery")!;
  const empowering = spell.byInvocation.find((m) => m.mode === "empowering")!;
  assert.equal(arcane.damage, 60);
  assert.equal(arcane.avgCastSec, 1);
  assert.equal(empowering.damage, 30);
  assert.equal(empowering.avgCastSec, 2);
});

test("melee is split by the stance active at the time", () => {
  const t = tracker();
  feed(t, [
    [1, "You assume a balanced stance."],
    [2, "You pierce a coyote for 20 points of damage."],
    [3, "You try to pierce a coyote, but miss!"],
    [4, "You assume an evasive stance."],
    [5, "You pierce a coyote for 5 points of damage."],
  ]);

  const you = t.snapshot().session.byCombatant.find((r) => r.name === "You")!;
  assert.equal(you.dealt, 25); // combined, as the meter shows
  const balanced = you.byStance.find((s) => s.stance === "balanced")!;
  const evasive = you.byStance.find((s) => s.stance === "evasive")!;
  assert.equal(balanced.damage, 20);
  assert.equal(balanced.misses, 1);
  assert.equal(evasive.damage, 5);
});

test("before the log names a mode, tallies file under 'unknown' rather than vanishing", () => {
  const t = tracker();
  feed(t, [[1, "You pierce a coyote for 10 points of damage."]]);
  const you = t.snapshot().session.byCombatant.find((r) => r.name === "You")!;
  assert.deepEqual(
    you.byStance.map((s) => s.stance),
    ["unknown"],
  );
});

test("other people's melee isn't split — the log never states their stance", () => {
  const t = tracker();
  feed(t, [
    [1, "You assume a balanced stance."],
    [2, "Bunnyslayer pierces a coyote for 10 points of damage."],
  ]);
  const them = t.snapshot().session.byCombatant.find((r) => r.name === "Bunnyslayer")!;
  assert.deepEqual(them.byStance, []);
});

test("a mode outlives a session reset — it's what the character is doing, not a tally", () => {
  const t = tracker();
  feed(t, [[1, "You assume an evasive stance."]]);
  t.reset();
  feed(t, [[2, "You pierce a coyote for 10 points of damage."]]);
  const you = t.snapshot().session.byCombatant.find((r) => r.name === "You")!;
  assert.equal(you.byStance[0].stance, "evasive");
});

// ── melee broken down by weapon/skill and by special-hit qualifier ──

test("melee splits by the skill behind each hit and by any qualifier the log wrote", () => {
  const t = tracker();
  feed(t, [
    [1, "You crush a coyote for 20 points of damage."],
    [2, "You crush a coyote for 10 points of damage. (Critical)"],
    [3, "You pierce a coyote for 8 points of damage."],
    [4, "You kick a coyote for 6 points of damage."],
    [5, "You hit a coyote for 5 points of damage. (Riposte)"],
    [6, "A coyote bites YOU for 4 points of damage."],
  ]);
  const rows = t.snapshot().fight.byCombatant;
  const you = rows.find((r) => r.name === "You")!;

  // "which hand/weapon": most damage first — Crush (2 hits, 30), then Pierce, Kick, Hit.
  assert.deepEqual(
    you.byType.map((x) => [x.type, x.hits, x.damage, x.maxHit]),
    [["Crush", 2, 30, 20], ["Pierce", 1, 8, 8], ["Kick", 1, 6, 6], ["Hit", 1, 5, 5]],
  );
  // special hits: exactly the qualifiers the log carried, and the old crit counter still agrees.
  assert.deepEqual(
    you.specials.map((x) => [x.kind, x.hits, x.damage]),
    [["Critical", 1, 10], ["Riposte", 1, 5]],
  );
  assert.equal(you.crits, 1);

  // Incoming is broken down too, and a mob's third-person "bites" folds to the "Bite" skill.
  const coyote = rows.find((r) => r.name === "a coyote")!;
  assert.deepEqual(coyote.byType.map((x) => x.type), ["Bite"]);
});

test("a spell hit is not counted as a melee weapon, but shows as a spell source and its crit shows", () => {
  const t = tracker();
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    [2, "You hit a coyote for 40 points of cold damage by Frost Rift. (Critical)"],
  ]);
  const you = t.snapshot().fight.byCombatant.find((r) => r.name === "You")!;
  // The swing is a weapon row; the nuke is a spell source. Together they account for `dealt`.
  assert.deepEqual(you.byType.map((x) => [x.type, x.damage]), [["Pierce", 10]]);
  assert.deepEqual(you.bySpell.map((x) => [x.spell, x.damage, x.maxHit]), [["Frost Rift", 40, 40]]);
  const fromSources = you.byType.reduce((n, x) => n + x.damage, 0) + you.bySpell.reduce((n, x) => n + x.damage, 0);
  assert.equal(you.dealt, fromSources); // melee + spells account for the whole of `dealt`
  // …and its "(Critical)" is still a special hit.
  assert.deepEqual(you.specials.map((x) => x.kind), ["Critical"]);
});

test("a DoT's ticks fold into that spell's source total on the caster's row", () => {
  const t = tracker();
  feed(t, [
    [1, "a large plague rat has taken 2 damage from Splurt by You."],
    [2, "a large plague rat has taken 2 damage from Splurt by You."],
    [3, "a large plague rat has taken 3 damage from Splurt by You."],
  ]);
  const you = t.snapshot().fight.byCombatant.find((r) => r.name === "You")!;
  // Three ticks of Splurt fold into one source line summing them, biggest tick as the max.
  assert.deepEqual(you.bySpell.find((s) => s.spell === "Splurt"), { spell: "Splurt", hits: 3, damage: 7, maxHit: 3 });
});

test("the window's damage cells reconcile with its rows and its total, both ways round", () => {
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    [1, "You slash a coyote for 20 points of damage."],
    [2, "You try to slash a coyote, but miss!"],
    [3, "You hit a coyote for 30 points of cold damage by Blast of Cold."],
    [4, "A coyote bites Kainos`s warder for 4 points of damage."],
    [5, "A coyote bites YOU for 6 points of damage."],
    [6, "Kainos`s warder bites a coyote for 3 points of damage."],
  ]);
  const fight = t.snapshot().fight;
  const cells = fight.damageCells!;

  // The one number the page leads with, and the tree beneath it, are the same number.
  assert.equal(sumDamage(cells), fight.totalDealt);
  // Grouped by attacker the cells give each row's `dealt`; by target, its `taken`. Neither view
  // can drift from the rows, because the rows' own splits are rolled up from these same cells.
  for (const row of fight.byCombatant) {
    assert.equal(sumDamage(cells.filter((c) => c.attacker === row.name)), row.dealt, `${row.name} dealt`);
    assert.equal(sumDamage(cells.filter((c) => c.target === row.name)), row.taken, `${row.name} taken`);
  }

  // And the drill-down answers the question in the shape it's asked: who hit the coyote, how.
  const attackers = drillDown(cells, "target", "a coyote", VICTIM_FIRST, (name) => name !== "a coyote");
  assert.deepEqual(
    attackers.map((n) => [n.label, n.damage, n.mine]),
    [
      ["You", 50, true],
      ["Kainos`s warder", 3, true],
    ],
  );
  assert.deepEqual(
    attackers[0].children.map((n) => [n.label, n.damage, n.misses]),
    [
      ["Spell", 30, 0],
      ["Melee", 20, 1],
    ],
  );
});

// ── what invocations do beyond scaling: divine's healing, Spell Blade's free casts ──
test("an unattributed self-heal after your own spell is the invocation's healing", () => {
  // Verbatim shape from a real log: the heal names no spell, and follows the landing.
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    [1, "You begin reciting the divine invocation."],
    [2, "You begin casting Blast of Cold."],
    [4, "You hit a coyote for 12 points of cold damage by Blast of Cold."],
    [4, "You healed Kainos for 8 hit points."],
  ]);

  const s = t.snapshot().session;
  const spell = s.spells.find((x) => x.spell === "Blast of Cold")!;
  assert.equal(spell.invocationHealed, 8);
  // It is not counted as the spell *healing* — a nuke is not a cure.
  assert.equal(spell.healed, 0);
  assert.equal(s.invocations.find((i) => i.mode === "divine")!.healed, 8);
});

test("an unattributed heal with no recent spell of yours is left alone", () => {
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    [1, "A skeleton punches YOU for 10 points of damage."],
    [2, "You healed Kainos for 8 hit points."], // someone's heal, or an item — not ours
  ]);
  assert.equal(t.snapshot().session.spells.length, 0);
});

test("a spell landing with no cast in flight is counted as a free cast", () => {
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    [1, "You begin reciting the spellblade invocation."],
    [2, "You begin casting Blast of Cold."],
    [3, "You hit a coyote for 12 points of cold damage by Blast of Cold."], // paired
    [5, "You pierce a coyote for 5 points of damage."], // a swing
    [6, "You hit a coyote for 20 points of cold damage by Blast of Cold."], // nothing cast
  ]);

  const inv = t.snapshot().session.invocations.find((i) => i.mode === "spellblade")!;
  assert.equal(inv.procs, 1);
  assert.equal(inv.procDamage, 20);
  assert.equal(inv.swings, 1);
  assert.equal(inv.procRate, 1);
});

test("castless damage sources are not free casts", () => {
  // A damage shield never has a cast, so counting it would report a proc on every hit —
  // which is exactly what the first version of this did.
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    [1, "You begin reciting the spellblade invocation."],
    [2, "A female rat is burned by Kainos`s warder's flames for 2 points of non-melee damage."],
    [3, "A female rat is burned by Kainos`s warder's flames for 2 points of non-melee damage."],
  ]);
  assert.equal(t.snapshot().session.invocations.find((i) => i.mode === "spellblade")?.procs ?? 0, 0);
});

// One cast of an area spell lands on each target separately, and only the first of those
// finds the cast in flight. Counting the rest as free casts made two area spells produce 61
// of the 65 "free casts" in a real log — and put them under whichever invocation happened to
// be up, so the one that actually grants free casts came fourth.
test("an area spell's extra landings are one cast, not free casts", () => {
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    [1, "You begin reciting the spellblade invocation."],
    [2, "You begin casting Fingers of Fire."],
    [4, "You hit a grikbar kobold for 20 points of fire damage by Fingers of Fire."],
    [4, "You hit a grikbar shaman for 19 points of fire damage by Fingers of Fire."],
    [4, "You hit a kobold runt for 18 points of fire damage by Fingers of Fire."],
  ]);

  const spell = t.snapshot().session.spells.find((s) => s.spell === "Fingers of Fire")!;
  assert.equal(spell.casts, 1);
  assert.equal(spell.lands, 3, "each target is still a landing");
  assert.equal(t.snapshot().session.invocations.find((i) => i.mode === "spellblade")?.procs ?? 0, 0);
});

test("a genuine free cast a second later is still counted", () => {
  const t = tracker();
  t.setPlayer("Kainos");
  feed(t, [
    [1, "You begin reciting the spellblade invocation."],
    [2, "You begin casting Fire Bolt."],
    [4, "You hit a coyote for 20 points of fire damage by Fire Bolt."],
    [6, "You hit a coyote for 20 points of fire damage by Fire Bolt."], // no cast, later second
  ]);
  assert.equal(t.snapshot().session.invocations.find((i) => i.mode === "spellblade")!.procs, 1);
});

test("a fight knows which zone it happened in", () => {
  const t = tracker();
  assert.equal(t.zone(), null);
  t.setZone("Steamfont Mountains");
  assert.equal(t.zone(), "Steamfont Mountains");
});

test("onChange signals each change; snapshot reflects the running total", () => {
  const t = tracker();
  let changes = 0;
  t.onChange(() => changes++); // signal-only now — the snapshot is pulled on demand
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    [2, "You pierce a coyote for 5 points of damage."],
  ]);
  assert.equal(changes, 2);
  assert.equal(t.snapshot().session.totalDealt, 15);
});

// ── money ──
//
// Two ledgers, deliberately: coin the mob carried and what its drops auto-sold for. They're
// gathered from different lines and attributed differently, and blending them would hide the
// difference between a mob that pays cash and one that drops good trash (ADR 0047).

test("coin off a corpse is credited to the mob that just died", () => {
  const t = tracker();
  feed(t, [[10, "You pierce a coyote for 10 points of damage."]]);
  t.recordKill("a coyote", stamp(20));
  t.recordCoin(coin(32, 22)); // within the attribution window
  t.recordCoin(coin(10, 600)); // long after any kill — the session's money, nobody's in particular

  const s = t.snapshot().session;
  assert.equal(s.copper, 42, "every coin line counts towards the evening");
  const mob = s.byMob.find((m) => m.mob === "a coyote")!;
  assert.equal(mob.copper, 32);
});

test("an auto-sold item's coin line is ignored — the loot line already priced it", () => {
  const t = tracker();
  feed(t, [[10, "You pierce a coyote for 10 points of damage."]]);
  t.recordKill("a coyote", stamp(20));
  t.recordSale(sold("Snake Egg", "a coyote", 4, 21));
  t.recordCoin(coin(4, 21, "item")); // the same four copper, said a second way

  const s = t.snapshot().session;
  assert.equal(s.soldCopper, 4);
  assert.equal(s.copper, 0, "counting both would double every sale");
});

test("a sale is credited by the corpse it names, needing no timing guess", () => {
  const t = tracker();
  feed(t, [[10, "You pierce a coyote for 10 points of damage."]]);
  t.recordKill("a coyote", stamp(20));
  feed(t, [[30, "You pierce a rat for 10 points of damage."]]);
  t.recordKill("a rat", stamp(40));
  // Sold long after the coyote died, and after a different mob's kill — the item still says
  // where it came from, which is what makes this the reliable half of the money.
  t.recordSale(sold("Snake Egg", "a coyote", 14, 300));

  const s = t.snapshot().session;
  assert.equal(s.byMob.find((m) => m.mob === "a coyote")!.soldCopper, 14);
  assert.equal(s.byMob.find((m) => m.mob === "a rat")!.soldCopper, 0);
});

test("the two ledgers stay apart per mob, and combine into coin per minute", () => {
  const t = tracker();
  feed(t, [[10, "You pierce a coyote for 10 points of damage."]]);
  t.recordKill("a coyote", stamp(20)); // 10s of fighting it
  t.recordCoin(coin(20, 21));
  t.recordSale(sold("Snake Egg", "a coyote", 10, 21));

  const mob = t.snapshot().session.byMob.find((m) => m.mob === "a coyote")!;
  assert.equal(mob.copper, 20);
  assert.equal(mob.soldCopper, 10);
  assert.equal(mob.copperPerMin, 180); // 30c per 10s
});

test("a loot line the log put no price on adds no money", () => {
  const t = tracker();
  feed(t, [[10, "You pierce a coyote for 10 points of damage."]]);
  t.recordKill("a coyote", stamp(20));
  t.recordSale({ ...sold("Bone Chips", "a coyote", 0, 21), fate: "kept", soldFor: undefined });
  assert.equal(t.snapshot().session.soldCopper, 0);
});

// ── whose fight is it: the meter is your party's, not the camp's (ADR 0067) ──
/** Feed a party line, the way the watcher hands one over. */
function group(t: ReturnType<typeof createCombatStats>, sec: number, message: string): void {
  const event = parseParty(splitLine(`[Wed Jul 29 ${clock(sec)} 2026] ${message}`, 1)!);
  assert.ok(event, `expected to parse: ${message}`);
  t.recordParty(event);
}

/** The tracker as it runs in the app: it always knows the character's name (from the log file). */
function yours(): ReturnType<typeof createCombatStats> {
  const t = tracker();
  t.setPlayer("Kainos");
  return t;
}

test("another group's fight at the same camp never reaches the meter", () => {
  const t = yours();
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    [2, "A coyote bites YOU for 5 points of damage."],
    // The camp next door, logged because it's in earshot. None of it is ours.
    [3, "Randomguy slashes a gnoll for 40 points of damage."],
    [4, "A gnoll bites Randomguy for 30 points of damage."],
    [5, "Randomguy`s warder bites a gnoll for 8 points of damage."],
  ]);

  const s = t.snapshot().session;
  assert.deepEqual(s.byCombatant.map((r) => r.name).sort(), ["You", "a coyote"]);
  assert.equal(s.totalDealt, 15);
});

test("a group-mate is your side, so their pull is your fight", () => {
  const t = yours();
  group(t, 1, "Bunnyslayer has joined the group.");
  feed(t, [
    [2, "Bunnyslayer slashes a gnoll for 40 points of damage."],
    [3, "A gnoll bites Bunnyslayer for 30 points of damage."],
    [4, "Bunnyslayer`s warder bites a gnoll for 8 points of damage."],
  ]);

  const s = t.snapshot().session;
  assert.deepEqual(
    s.byCombatant.map((r) => r.name).sort(),
    ["Bunnyslayer", "Bunnyslayer`s warder", "a gnoll"],
  );
  assert.equal(s.totalDealt, 78);
  assert.equal(s.yourDealt, 0, "a group-mate's damage is the group's, not yours");
});

test("leaving the group takes their fights with them", () => {
  const t = yours();
  group(t, 1, "Bunnyslayer has joined the group.");
  feed(t, [[2, "Bunnyslayer slashes a gnoll for 40 points of damage."]]);
  group(t, 3, "Bunnyslayer has left the group.");
  // A fresh pull of theirs, after they left: no longer our side, no longer our fight.
  feed(t, [[120, "Bunnyslayer slashes a rat for 40 points of damage."]]);

  const s = t.snapshot().session;
  assert.equal(s.totalDealt, 40);
  assert.equal(s.byCombatant.find((r) => r.name === "a rat"), undefined);
});

test("a stranger helping on your mob is part of your fight", () => {
  const t = yours();
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    // Not in your group and never will be — but this is the mob you're on, and what it took
    // is what the fight cost, whoever landed it.
    [2, "Randomguy slashes a coyote for 40 points of damage."],
  ]);

  const s = t.snapshot().session;
  assert.equal(s.totalDealt, 50);
  assert.equal(s.byCombatant.find((r) => r.name === "a coyote")!.taken, 50);
});

test("a kill across the camp isn't yours to count", () => {
  const t = yours();
  feed(t, [[1, "You pierce a coyote for 10 points of damage."]]);
  t.recordKill("coyote", stamp(5)); // ours: we fought it (and the kill line strips the article)
  t.recordKill("gnoll", stamp(6)); // somebody else's, three tents over
  t.recordXp(xp(1, 7));

  const s = t.snapshot().session;
  assert.equal(s.kills, 1);
  assert.deepEqual(s.byMob.map((m) => m.mob), ["coyote"]);
  // The experience is still yours — the log only ever writes it for you — and it lands on
  // the kill that was ours.
  assert.equal(s.byMob[0].xpPct, 1);
});

test("your own fight is metered before the group is ever announced", () => {
  // The app starts mid-camp: the join lines scrolled past hours ago, so the roster is empty.
  // Everyone hitting the mob you're hitting still counts, which is what keeps a group's meter
  // whole without the log ever having said who's in it.
  const t = yours();
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    [2, "Bunnyslayer slashes a coyote for 40 points of damage."],
    [3, "A coyote bites Bunnyslayer for 5 points of damage."],
  ]);
  assert.equal(t.snapshot().session.totalDealt, 55);
});

test("the roster survives a meter reset — clearing the meter doesn't disband your group", () => {
  const t = yours();
  group(t, 1, "Bunnyslayer has joined the group.");
  t.reset();
  feed(t, [[2, "Bunnyslayer slashes a gnoll for 40 points of damage."]]);
  assert.deepEqual(t.party(), ["Bunnyslayer"]);
  assert.equal(t.snapshot().session.totalDealt, 40);
});
