/**
 * Black-box tests for `dot-attribution.ts` — the memory that puts a caster back on a DoT tick
 * the log wrote without one (ADR 0071). Every line is verbatim from a real EQ Legends log.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCombat } from "../../src/shared/combat-parser";
import { createDotAttribution } from "../../src/shared/dot-attribution";
import { splitLine } from "../../src/shared/log-parser";
import type { CombatEvent, DamageEvent } from "../../src/shared/types";

const TS = "[Wed Jul 29 00:12:33 2026] ";

const parse = (message: string): CombatEvent => {
  const line = splitLine(TS + message, 1);
  const event = line && parseCombat(line);
  assert.ok(event, `unparsed: ${message}`);
  return event;
};

/** Feed the lines in order, the way the tracker does, and return the resolved events. */
function run(messages: string[]): CombatEvent[] {
  const dots = createDotAttribution();
  return messages.map((message) => {
    const event = parse(message);
    dots.note(event);
    return dots.resolve(event);
  });
}

test("a tick of a spell you were seen casting is your damage", () => {
  const [, tick] = run([
    "You begin casting Engulfing Darkness.",
    "A coyote has taken 5 damage by Engulfing Darkness.",
  ]) as [CombatEvent, DamageEvent];
  assert.equal(tick.attacker, "You");
  // Resolved, so nothing downstream may go on treating the name as a stand-in.
  assert.equal(tick.casterUnknown, undefined);
  // Everything else about the tick is untouched — it's still a tick, still that spell.
  assert.equal(tick.tick, true);
  assert.equal(tick.spell, "Engulfing Darkness");
  assert.equal(tick.amount, 5);
  assert.equal(tick.target, "a coyote");
});

test("every tick of one cast is attributed, not just the first", () => {
  const events = run([
    "You begin casting Engulfing Darkness.",
    "A coyote has taken 5 damage by Engulfing Darkness.",
    "A coyote has taken 5 damage by Engulfing Darkness.",
    "A coyote has taken 4 damage by Engulfing Darkness.",
  ]) as [CombatEvent, ...DamageEvent[]];
  const ticks = events.slice(1) as DamageEvent[];
  assert.deepEqual(ticks.map((t) => t.attacker), ["You", "You", "You"]);
  // The whole point: on a DoT this is nearly all of its damage.
  assert.equal(ticks.reduce((n, t) => n + t.amount, 0), 14);
});

test("the rank the cast line states doesn't stop a tick resolving", () => {
  // `spellName` strips the rank from both lines, which is what makes the two agree.
  const [, tick] = run([
    "You begin casting Engulfing Darkness III.",
    "A coyote has taken 5 damage by Engulfing Darkness.",
  ]) as [CombatEvent, DamageEvent];
  assert.equal(tick.attacker, "You");
});

test("a group-mate's DoT is theirs, not yours and not the spell's", () => {
  const [, tick] = run([
    "Hullshamancer begins casting Engulfing Darkness.",
    "A coyote has taken 5 damage by Engulfing Darkness.",
  ]) as [CombatEvent, DamageEvent];
  assert.equal(tick.attacker, "Hullshamancer");
});

test("a DoT nobody was seen casting is left exactly as the log wrote it", () => {
  // A mob's DoT on you: EQ logs no cast line for it, so there is nothing to attribute — and a
  // guess would be worse than the log's own limit. The stand-in name and the flag both stand.
  const [tick] = run(["Kainos`s warder has taken 1 damage by Plague Rat Disease."]) as [DamageEvent];
  assert.equal(tick.attacker, "Plague Rat Disease");
  assert.equal(tick.casterUnknown, true);
});

test("the long tick form already names its caster and is passed through untouched", () => {
  const [, tick] = run([
    "You begin casting Plague Rat Disease.",
    "You have taken 1 damage from Plague Rat Disease by a large plague rat.",
  ]) as [CombatEvent, DamageEvent];
  // Even having seen you cast something of that name, a stated caster wins — the log knows.
  assert.equal(tick.attacker, "a large plague rat");
});

test("a direct spell landing is never rewritten, only a caster-less tick", () => {
  const [, hit] = run([
    "Hullshamancer begins casting Blast of Cold.",
    "You hit a coyote for 12 points of cold damage by Blast of Cold.",
  ]) as [CombatEvent, DamageEvent];
  assert.equal(hit.attacker, "You");
});

test("the later of two casters gets the ticks — the tick lines are identical", () => {
  const events = run([
    "You begin casting Engulfing Darkness.",
    "A coyote has taken 5 damage by Engulfing Darkness.",
    "Hullshamancer begins casting Engulfing Darkness.",
    "A coyote has taken 5 damage by Engulfing Darkness.",
  ]);
  assert.deepEqual(
    [(events[1] as DamageEvent).attacker, (events[3] as DamageEvent).attacker],
    ["You", "Hullshamancer"],
  );
});

test("resolving never mutates the event it was given", () => {
  const dots = createDotAttribution();
  dots.note(parse("You begin casting Engulfing Darkness."));
  const tick = parse("A coyote has taken 5 damage by Engulfing Darkness.") as DamageEvent;
  const resolved = dots.resolve(tick) as DamageEvent;
  assert.equal(tick.attacker, "Engulfing Darkness"); // the original is untouched
  assert.equal(resolved.attacker, "You");
});
