/**
 * Black-box tests for the damage meter's tracker. Timing comes from the log's own
 * timestamps, so these are exact — no clocks, no sleeps.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createCombatStats } from "../combat-stats";
import { parseCombat } from "../../src/shared/combat-parser";
import { splitLine } from "../../src/shared/log-parser";
import type { CombatEvent, XpEvent } from "../../src/shared/types";

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

/** Feed lines as if they were tailed from a log, `sec` seconds past midnight. */
function feed(tracker: ReturnType<typeof createCombatStats>, lines: [sec: number, message: string][]): void {
  for (const [sec, message] of lines) {
    const event = parseCombat(splitLine(`[Wed Jul 29 ${clock(sec)} 2026] ${message}`, 1)!) as CombatEvent;
    assert.ok(event, `expected to parse: ${message}`);
    tracker.record(event);
  }
}

const tracker = () => createCombatStats(() => "2026-07-29T00:00:00.000Z");

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

test("a lull starts a new fight, while the session keeps accumulating", () => {
  const t = tracker();
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    [30, "You pierce a rat for 7 points of damage."], // 29s later: new fight
  ]);

  const s = t.snapshot();
  assert.equal(s.fight.totalDealt, 7);
  assert.deepEqual(
    s.fight.byCombatant.map((r) => r.name),
    ["You", "a rat"],
  );
  assert.equal(s.session.totalDealt, 17);
  assert.equal(s.session.byCombatant.length, 3); // you + both mobs
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
    [3, "A coyote has taken 5 damage by Engulfing Darkness."],
    [9, "A coyote has taken 5 damage by Engulfing Darkness."],
  ]);
  // The DoT's own damage lines name no caster, so they land under the DoT — what matters
  // here is that a tick is never counted as a fresh cast.
  const s = t.snapshot().session.spells.find((x) => x.spell === "Engulfing Darkness");
  assert.equal(s?.casts, 1);
  assert.equal(s?.lands ?? 0, 0);
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
  feed(t, [
    [1, "You pierce a coyote for 10 points of damage."],
    [30, "You pierce a rat for 7 points of damage."], // lull → first fight ends
  ]);
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
