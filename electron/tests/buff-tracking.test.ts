/**
 * Black-box tests for the buff rules: what a key folds away, how a shared sentence is narrowed, and
 * which lapses are worth interrupting somebody over.
 *
 * The tracker's own behaviour is next door in `buff-tracker.test.ts`; everything here is pure.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buffKey,
  buffTarget,
  evictable,
  heldMs,
  instanceKey,
  narrowCandidates,
  newKnownBuff,
  announceWhen,
  isEnemyTarget,
  shouldHold,
  targetLabel,
  ON_PET,
  ON_UNKNOWN,
  ON_YOU,
  type BuffInstance,
  type KnownBuff,
} from "../../src/shared/buff-tracking";

const AT = "2026-08-20T20:00:00.000Z";

function known(over: Partial<KnownBuff> = {}): KnownBuff {
  return { ...newKnownBuff("Thorns", AT, { mine: true, permanent: false, detrimental: false }), ...over };
}

/** A lapsed instance, as `announceWhen` reads one. Only `onEnemy` matters to it. */
const mine = { onEnemy: false };
const onMob = { onEnemy: true };

test("a key folds rank and case away, because that is not what the question is about", () => {
  assert.equal(buffKey("Shock of Lightning VI"), "shock of lightning");
  assert.equal(buffKey("  Spirit of Wolf  "), "spirit of wolf");
  assert.equal(buffKey("THORNS"), "thorns");
  // "Do I want to hear about haste" is not a question about which rank you happen to have memorised.
  assert.equal(buffKey("Alacrity II"), buffKey("Alacrity"));
});

test("every way the log writes you folds to one target", () => {
  for (const said of ["You", "you", "YOUR", "yourself", "myself", "", undefined]) {
    assert.equal(buffTarget(said), ON_YOU, `“${said}” should be you`);
  }
  // The pet flag wins outright: the log never names the pet in that sentence.
  assert.equal(buffTarget("anything", true), ON_PET);
  assert.equal(buffTarget("Bloop"), "Bloop");
  assert.equal(buffTarget("  a gnoll pup  "), "a gnoll pup");
});

test("one spell on two people is two things to keep up", () => {
  assert.notEqual(instanceKey("thorns", ON_YOU), instanceKey("thorns", "Bloop"));
  assert.equal(instanceKey("thorns", ON_YOU), instanceKey("thorns", ON_YOU));
});

test("an unknown target reads as an admission, not as a blank", () => {
  assert.equal(targetLabel(ON_UNKNOWN), "someone");
  assert.equal(targetLabel("Bloop"), "Bloop");
});

// ── narrowing a shared sentence ───────────────────────────────────────────────

test("one candidate needs no narrowing and claims no ambiguity", () => {
  const got = narrowCandidates(["Spirit of Wolf"], () => false, () => false);
  assert.deepEqual(got, { spell: "Spirit of Wolf" });
});

test("nothing to narrow at all yields nothing", () => {
  assert.equal(narrowCandidates([], () => true, () => true), null);
});

test("a candidate that is already up wins — the free, strong signal", () => {
  const got = narrowCandidates(
    ["Shield of Thistles", "Shield of Thorns"],
    (key) => key === "shield of thorns",
    () => false,
  );
  assert.deepEqual(got, { spell: "Shield of Thorns" });
});

test("failing that, a candidate you were just casting wins", () => {
  const got = narrowCandidates(
    ["Shield of Thistles", "Shield of Thorns"],
    () => false,
    (key) => key === "shield of thistles",
  );
  assert.deepEqual(got, { spell: "Shield of Thistles" });
});

test("being up outranks having been cast, since one is watched and the other is inferred", () => {
  const got = narrowCandidates(
    ["Shield of Thistles", "Shield of Thorns"],
    (key) => key === "shield of thorns",
    (key) => key === "shield of thistles",
  );
  assert.deepEqual(got, { spell: "Shield of Thorns" });
});

test("a signal that picks out more than one narrows nothing", () => {
  // Both up: "one of them ended" is all we know, so the row has to say both.
  const got = narrowCandidates(["Shield of Thistles", "Shield of Thorns"], () => true, () => false);
  assert.deepEqual(got, { spell: "Shield of Thistles", alsoCouldBe: ["Shield of Thorns"] });
});

test("undecided names every candidate, in a stable order", () => {
  const got = narrowCandidates(["Thistlecoat", "Thorncoat", "Barbcoat"], () => false, () => false);
  // The first stands in so a row has something to lead with, and the rest travel with it — a coin
  // toss presented as an answer is the thing this refuses to do.
  assert.equal(got?.spell, "Thistlecoat");
  assert.deepEqual(got?.alsoCouldBe, ["Thorncoat", "Barbcoat"]);
  // Same input, same answer: a reminder that renamed itself between sessions would be unusable.
  assert.deepEqual(narrowCandidates(["Thistlecoat", "Thorncoat", "Barbcoat"], () => false, () => false), got);
});

// ── what gets said, and what only gets recorded ───────────────────────────────

test("something you were fighting is told apart by the spell, or failing that by the target", () => {
  // The reliable signal: you do not root your friends. It works on a *named*, whose article-less log
  // name is indistinguishable from a player's.
  assert.equal(isEnemyTarget("Lord Nagafen", true), true);
  assert.equal(isEnemyTarget("a wild tiger", true), true);
  // The fallback, for when there is no game install to ask: an article means a mob, whatever the
  // spell was — which also catches a buff you put on a charmed pet.
  assert.equal(isEnemyTarget("a wild tiger", false), true);
  assert.equal(isEnemyTarget("an Iksar Warrior", false), true);
  // A player keeps their buffs: no article, and nothing detrimental about it.
  assert.equal(isEnemyTarget("Bloop", false), false);
  // And you and your pet are never enemies, whatever a mis-flagged spell claims — checked first, so a
  // bad `detrimental` can never sweep away the reminders this feature exists for.
  assert.equal(isEnemyTarget(ON_YOU, true), false);
  assert.equal(isEnemyTarget(ON_PET, true), false);
  // An unknown target is not a mob by the article test, so a buff we could not place is kept.
  assert.equal(isEnemyTarget(ON_UNKNOWN, false), false);
});

test("your own buff waits for the fight; a debuff cannot", () => {
  // The whole of the second complaint, as one assertion pair. Nobody stops swinging to recast a stat
  // buff — but a root that dropped has to go back on this second.
  assert.equal(announceWhen(known(), "faded", mine), "after-fight");
  assert.equal(announceWhen(known(), "faded", onMob), "now");
});

test("an ordinary fade is announced and held", () => {
  assert.notEqual(announceWhen(known(), "faded", mine), "never");
  assert.equal(shouldHold(known(), "faded"), true);
});

test("a death is held and never announced", () => {
  // A dozen banners at once is not a dozen pieces of news; the standing list is the answer a corpse
  // wants. Same reasoning as ADR 0082's `cancelOnDeath`.
  assert.equal(announceWhen(known(), "died", mine), "never");
  assert.equal(shouldHold(known(), "died"), true);
});

test("a recast is neither: nothing is missing", () => {
  assert.equal(announceWhen(known(), "recast", mine), "never");
  assert.equal(shouldHold(known(), "recast"), false);
});

test("unchecked silences both halves; notify off silences only the banner", () => {
  const untracked = known({ tracked: false });
  assert.equal(announceWhen(untracked, "faded", mine), "never");
  assert.equal(shouldHold(untracked, "faded"), false);

  const quiet = known({ notify: false });
  assert.equal(announceWhen(quiet, "faded", mine), "never");
  // Still held: one switch is about a moment, the other about a state, and they are asked separately.
  assert.equal(shouldHold(quiet, "faded"), true);
});

test("silencing beats urgency — an unticked debuff is still silent", () => {
  // Order matters here: `onEnemy` says "now", and the player's own switch has to outrank it.
  assert.equal(announceWhen(known({ tracked: false }), "faded", onMob), "never");
  assert.equal(announceWhen(known({ notify: false }), "faded", onMob), "never");
});

test("a spell with no row says nothing", () => {
  assert.equal(announceWhen(undefined, "faded", mine), "never");
  assert.equal(shouldHold(undefined, "faded"), false);
});

// ── the rest ──────────────────────────────────────────────────────────────────

test("a fresh row arrives switched on", () => {
  const fresh = newKnownBuff("Spirit of Wolf II", AT, { mine: true, permanent: true, detrimental: false });
  assert.equal(fresh.key, "spirit of wolf");
  assert.equal(fresh.spell, "Spirit of Wolf");
  assert.equal(fresh.tracked, true);
  assert.equal(fresh.notify, true);
  assert.equal(fresh.onScreen, true);
  assert.equal(fresh.permanent, true);
  assert.equal(fresh.rises, 0);
});

test("how long it was held is measured to now while up, and to the lapse once down", () => {
  const base: BuffInstance = {
    key: "thorns",
    spell: "Thorns",
    target: ON_YOU,
    up: true,
    at: AT,
    since: AT,
    source: "landed",
    byYou: true,
    permanent: false,
    onEnemy: false,
  };
  const now = Date.parse(AT) + 60_000;
  assert.equal(heldMs(base, now), 60_000);
  // Down: the clock stopped when it lapsed, so it must not keep counting.
  const down = { ...base, up: false, at: new Date(Date.parse(AT) + 30_000).toISOString() };
  assert.equal(heldMs(down, now), 30_000);
  // A clock that disagrees with the log must not produce a negative duration.
  assert.equal(heldMs(base, Date.parse(AT) - 5_000), 0);
  assert.equal(heldMs({ ...base, since: "not a date" }, now), 0);
});

test("only rows nobody has touched may be evicted, oldest first", () => {
  const rows: KnownBuff[] = [
    known({ key: "a", spell: "A", lastUp: "2026-08-20T10:00:00.000Z" }),
    known({ key: "b", spell: "B", lastUp: "2026-08-19T10:00:00.000Z" }),
    // Each of these is a decision, and dropping one would silently undo it.
    known({ key: "silenced", spell: "S", tracked: false, lastUp: "2026-01-01T00:00:00.000Z" }),
    known({ key: "quiet", spell: "Q", notify: false, lastUp: "2026-01-01T00:00:00.000Z" }),
    known({ key: "hidden", spell: "H", onScreen: false, lastUp: "2026-01-01T00:00:00.000Z" }),
    known({ key: "styled", spell: "T", styleId: "built-in:spawn", lastUp: "2026-01-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(
    evictable(rows).map((k) => k.key),
    ["b", "a"],
  );
});
