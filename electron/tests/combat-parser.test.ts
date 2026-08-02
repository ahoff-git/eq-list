/**
 * Black-box tests for the pure combat parser. Every input line here is **verbatim
 * from a real EQ Legends log** (character "Kainos", pet "Kainos`s warder") — that's
 * the point: this file pins the grammar the damage meter depends on, so a future
 * tweak to the regexes can't quietly stop counting a whole category of damage.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCombat, combatant, SELF } from "../../src/shared/combat-parser";
import { splitLine } from "../../src/shared/log-parser";
import type {
  CastEvent,
  DamageEvent,
  DeathEvent,
  HealEvent,
  InvocationEvent,
  MissEvent,
  SpellOutcomeEvent,
  StanceEvent,
} from "../../src/shared/types";

const TS = "[Wed Jul 29 00:12:33 2026] ";

/** Raw line in, event out — the parser itself takes an already-split line. */
function parseCombatLine(raw: string) {
  const line = splitLine(raw, 1);
  return line ? parseCombat(line) : null;
}
const parse = (message: string) => parseCombatLine(TS + message);

test("a mob's melee swing on the pet", () => {
  const e = parse("A coyote bites Kainos`s warder for 16 points of damage.") as DamageEvent;
  assert.ok(e);
  assert.equal(e.kind, "damage");
  assert.equal(e.attacker, "a coyote");
  assert.equal(e.target, "Kainos`s warder");
  assert.equal(e.amount, 16);
  assert.equal(e.verb, "bites");
  assert.equal(e.melee, true);
});

test("your own melee swing", () => {
  const e = parse("You pierce a large plague rat for 6 points of damage.") as DamageEvent;
  assert.equal(e.attacker, SELF);
  assert.equal(e.target, "a large plague rat");
  assert.equal(e.amount, 6);
  assert.equal(e.melee, true);
});

test("singular 'point' of damage still parses", () => {
  const e = parse("A coyote bashes Kainos`s warder for 1 point of damage.") as DamageEvent;
  assert.equal(e.amount, 1);
});

test("damage on you normalizes the shouted YOU", () => {
  const e = parse("A skeleton punches YOU for 20 points of damage.") as DamageEvent;
  assert.equal(e.attacker, "a skeleton");
  assert.equal(e.target, SELF);
  assert.equal(e.amount, 20);
});

test("multi-word attacker and target names survive", () => {
  const e = parse("Tindo Frugrin punches Bunnyslayer for 22 points of damage.") as DamageEvent;
  assert.equal(e.attacker, "Tindo Frugrin");
  assert.equal(e.target, "Bunnyslayer");
});

test("spell damage carries its type and spell, and isn't counted as melee", () => {
  const e = parse("You hit a coyote for 12 points of cold damage by Blast of Cold.") as DamageEvent;
  assert.equal(e.attacker, SELF);
  assert.equal(e.target, "a coyote");
  assert.equal(e.amount, 12);
  assert.equal(e.damageType, "cold");
  assert.equal(e.spell, "Blast of Cold");
  assert.equal(e.melee, false);
});

test("a DoT tick with no named caster is attributed to the DoT", () => {
  const e = parse("Kainos`s warder has taken 1 damage by Plague Rat Disease.") as DamageEvent;
  assert.equal(e.kind, "damage");
  assert.equal(e.target, "Kainos`s warder");
  assert.equal(e.attacker, "Plague Rat Disease");
  assert.equal(e.spell, "Plague Rat Disease");
  assert.equal(e.amount, 1);
});

test("a DoT tick on you names the mob that applied it", () => {
  const e = parse("You have taken 1 damage from Plague Rat Disease by a large plague rat.") as DamageEvent;
  assert.equal(e.target, SELF);
  assert.equal(e.attacker, "a large plague rat");
  assert.equal(e.spell, "Plague Rat Disease");
});

test("misses parse for both the pet and you", () => {
  const pet = parse("Kainos`s warder tries to bite a coyote, but misses!") as MissEvent;
  assert.equal(pet.kind, "miss");
  assert.equal(pet.attacker, "Kainos`s warder");
  assert.equal(pet.target, "a coyote");
  assert.equal(pet.verb, "bite");

  const mine = parse("You try to pierce a large plague rat, but miss!") as MissEvent;
  assert.equal(mine.kind, "miss");
  assert.equal(mine.attacker, SELF);
});

// EQ words an active defence differently from a whiff. Both are misses for the attacker, and
// only counting whiffs made every hit rate read high — the player's log had 92 of these.
test("a dodge, parry or block is a miss for the attacker", () => {
  const dodged = parse("A grikbar kobold tries to hit YOU, but YOU dodge!") as MissEvent;
  assert.equal(dodged.kind, "miss");
  assert.equal(dodged.attacker, "a grikbar kobold");
  assert.equal(dodged.target, SELF);
  assert.equal(dodged.verb, "hit");
  assert.equal(dodged.avoidance, "dodge");

  const parried = parse("Kainos`s warder tries to bite a wild tiger, but a wild tiger parries!") as MissEvent;
  assert.equal(parried.kind, "miss");
  assert.equal(parried.attacker, "Kainos`s warder");
  assert.equal(parried.target, "a wild tiger");
  assert.equal(parried.avoidance, "parry");

  const blocked = parse("A kerran puma tries to claw Chadillac, but Chadillac blocks!") as MissEvent;
  assert.equal(blocked.kind, "miss");
  assert.equal(blocked.avoidance, "block");
});

test("a plain whiff records no avoidance — there was nothing to avoid it with", () => {
  const whiff = parse("Kainos`s warder tries to bite a coyote, but misses!") as MissEvent;
  assert.equal(whiff.avoidance, undefined);
});

test("heals parse, and a reflexive heal resolves to the healer", () => {
  const mine = parse("You healed Kainos`s warder for 8 hit points.") as HealEvent;
  assert.equal(mine.kind, "heal");
  assert.equal(mine.healer, SELF);
  assert.equal(mine.target, "Kainos`s warder");
  assert.equal(mine.amount, 8);

  const theirs = parse("Hullshamancer healed himself for 10 hit points by Lifespike.") as HealEvent;
  assert.equal(theirs.healer, "Hullshamancer");
  assert.equal(theirs.target, "Hullshamancer");
  assert.equal(theirs.spell, "Lifespike");
});

// The four shapes below were found by running the parser over an entire real log and
// inspecting what it *failed* to match — each was losing damage before.
test("a critical hit parses, qualifier and all", () => {
  const e = parse("You kick a kobold scout for 6 points of damage. (Critical)") as DamageEvent;
  assert.ok(e);
  assert.equal(e.amount, 6);
  assert.equal(e.qualifier, "Critical");
  assert.equal(e.melee, true);
});

test("a riposted swing still counts as damage / a miss", () => {
  const hit = parse("Kainos`s warder bites a kobold scout for 4 points of damage. (Riposte)") as DamageEvent;
  assert.equal(hit.amount, 4);
  assert.equal(hit.qualifier, "Riposte");

  const missed = parse("A kobold scout tries to hit YOU, but misses! (Riposte)") as MissEvent;
  assert.equal(missed.kind, "miss");
  assert.equal(missed.target, SELF);
  assert.equal(missed.qualifier, "Riposte");
});

test("archery ('shoots') is a melee-table attack like the rest", () => {
  const e = parse("Bunnyslayer shoots a mountain lion for 9 points of damage.") as DamageEvent;
  assert.equal(e.attacker, "Bunnyslayer");
  assert.equal(e.amount, 9);
});

test("damage-shield damage is credited to the shield's wearer", () => {
  const e = parse("A female rat is burned by Kainos`s warder's flames for 2 points of non-melee damage.") as DamageEvent;
  assert.ok(e);
  assert.equal(e.attacker, "Kainos`s warder");
  assert.equal(e.target, "a female rat");
  assert.equal(e.amount, 2);
  assert.equal(e.damageType, "non-melee");
  assert.equal(e.melee, false);
});

test("an overhealing heal meters what actually landed", () => {
  const e = parse("You healed Kainos`s warder for 1 (20) hit points by Inner Fire.") as HealEvent;
  assert.equal(e.kind, "heal");
  assert.equal(e.amount, 1);
  assert.equal(e.attempted, 20);
  assert.equal(e.spell, "Inner Fire");
});

// ── casting lifecycle: what makes cast time and resist rates measurable ──
test("a cast's start is captured, for you and for others", () => {
  const mine = parse("You begin casting Blast of Cold.") as CastEvent;
  assert.equal(mine.kind, "cast");
  assert.equal(mine.caster, SELF);
  assert.equal(mine.spell, "Blast of Cold");

  const theirs = parse("Hullshamancer begins casting Lifespike.") as CastEvent;
  assert.equal(theirs.caster, "Hullshamancer");
  assert.equal(theirs.spell, "Lifespike");
});

test("memorizing a spell is not a cast", () => {
  assert.equal(parse("You begin to change your invocation."), null);
});

test("fizzles and interrupts are outcomes of your own cast", () => {
  const fizzle = parse("Your Blast of Cold spell fizzles!") as SpellOutcomeEvent;
  assert.equal(fizzle.kind, "spell-outcome");
  assert.equal(fizzle.outcome, "fizzle");
  assert.equal(fizzle.caster, SELF);
  assert.equal(fizzle.spell, "Blast of Cold");

  const interrupted = parse("Your Levitate spell is interrupted.") as SpellOutcomeEvent;
  assert.equal(interrupted.outcome, "interrupted");
  assert.equal(interrupted.spell, "Levitate");
});

test("a resist names the spell's caster — theirs or ours", () => {
  const ours = parse("A coyote resisted your Blast of Cold!") as SpellOutcomeEvent;
  assert.equal(ours.outcome, "resisted");
  assert.equal(ours.caster, SELF);
  assert.equal(ours.target, "a coyote");

  // We shrugged theirs off: it's their cast that was resisted, not ours.
  const theirs = parse("You resist a female rat's Plague Rat Disease!") as SpellOutcomeEvent;
  assert.equal(theirs.outcome, "resisted");
  assert.equal(theirs.caster, "a female rat");
  assert.equal(theirs.spell, "Plague Rat Disease");
});

test("a blocked landing parses, trailing reason and all", () => {
  const e = parse("Your Inner Fire spell did not take hold on Jarn. (Blocked by Courage.)") as SpellOutcomeEvent;
  assert.equal(e.outcome, "blocked");
  assert.equal(e.spell, "Inner Fire");
  assert.equal(e.target, "Jarn");
});

test("DoT ticks are flagged so they aren't counted as fresh casts landing", () => {
  const tick = parse("Kainos`s warder has taken 1 damage by Plague Rat Disease.") as DamageEvent;
  assert.equal(tick.tick, true);
  const direct = parse("You hit a coyote for 12 points of cold damage by Blast of Cold.") as DamageEvent;
  assert.equal(direct.tick, undefined);
});

test("your own death parses, with and without a killer", () => {
  const slain = parse("You have been slain by Minotaur Lord!") as DeathEvent;
  assert.equal(slain.kind, "death");
  assert.equal(slain.victim, SELF);
  assert.equal(slain.killer, "Minotaur Lord");

  const died = parse("You died.") as DeathEvent;
  assert.equal(died.kind, "death");
  assert.equal(died.killer, undefined);
});

test("a mob's death is a kill, not your death", () => {
  // `parseKillLine` owns these; the combat parser must not claim them.
  assert.equal(parse("A coyote has been slain by Kainos!"), null);
});

test("a stance change is the line that names the new stance", () => {
  const e = parse("You assume an evasive stance.") as StanceEvent;
  assert.equal(e.kind, "stance");
  assert.equal(e.stance, "evasive");
  assert.equal((parse("You assume a balanced stance.") as StanceEvent).stance, "balanced");
  // The announcement of a change says nothing about which stance results.
  assert.equal(parse("You begin to change your stance."), null);
});

test("an invocation change is the reciting line, which names it", () => {
  const e = parse("You begin reciting the arcane mastery invocation.") as InvocationEvent;
  assert.equal(e.kind, "invocation");
  assert.equal(e.invocation, "arcane mastery");
  assert.equal(
    (parse("You begin reciting the empowering invocation.") as InvocationEvent).invocation,
    "empowering",
  );
  assert.equal(parse("You begin to change your invocation."), null);
});

test("non-combat lines are ignored", () => {
  assert.equal(parse("You gain experience! (1.025%)"), null);
  assert.equal(parse("You have slain a rambunctious pet!"), null);
  assert.equal(parse("--You have looted a Giant Rat Ear from a giant rat's corpse.--"), null);
  assert.equal(parse("You have become better at Meditate! (11)"), null);
  assert.equal(parse("You receive 5 silver and 7 copper from the corpse."), null);
  assert.equal(parseCombatLine(""), null);
});

test("a line without a timestamp isn't combat", () => {
  assert.equal(parseCombatLine("A coyote bites Kainos`s warder for 16 points of damage."), null);
});

test("combatant() folds case/articles so one mob is one row", () => {
  assert.equal(combatant("A coyote"), "a coyote");
  assert.equal(combatant("a coyote"), "a coyote");
  assert.equal(combatant("An ebon drakeling"), "an ebon drakeling");
  assert.equal(combatant("YOU"), SELF);
  assert.equal(combatant("You"), SELF);
  // A mob whose real name starts with "The" keeps its capital — only the article folds.
  assert.equal(combatant("The Ancient One"), "the Ancient One");
});
