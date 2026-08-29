/**
 * Black-box tests for what repeated kills teach about a respawn: the shortest-gap rule, the things
 * that aren't evidence, and the wording that keeps a bound from reading as a fact (ADR 0092).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clockSkew,
  countdownMs,
  describeRespawn,
  erratic,
  formatCountdown,
  floorFrom,
  formatInterval,
  gapId,
  killStillCounts,
  learnRespawns,
  MAX_LEARNED_GAP_SECONDS,
  recentCamps,
  respawnCaveat,
  untimedReason,
  MAX_LISTED_GAPS,
  MAX_RESPAWN_SECONDS,
  MIN_RESPAWN_SECONDS,
  OVERDUE_GRACE_SECONDS,
  provenNamed,
  remainingMs,
  parseInterval,
  respawnFor,
  rollForward,
  sightingFrom,
  spawnState,
  timerFrom,
  timerForMob,
  timerId,
  timerInPlace,
  timerKey,
  timerSlot,
  MAX_TIMER_SECONDS,
  type RespawnLearning,
} from "../../src/shared/spawn-timers";
import type { KillRecord } from "../../src/shared/types";

const T0 = Date.parse("2026-08-17T12:00:00.000Z");
const iso = (offsetSec: number) => new Date(T0 + offsetSec * 1000).toISOString();

/** A kill record with only the fields any of this reads. */
function kill(mob: string, atSec: number, extra: Partial<KillRecord> = {}): KillRecord {
  return {
    id: `${mob}-${atSec}`,
    logId: atSec,
    at: iso(atSec),
    mob,
    zone: "Lower Guk",
    confidence: 1,
    named: true,
    // Killed by you, which is what every one of these means — and now has to say, since a kill
    // by a *mob* is how the log writes a player or a pet dying.
    killerNamed: true,
    ...extra,
  };
}

const always = () => true;
/** Just the identity `timerFrom` needs; the learning behind it is exercised separately. */
const LEARNED = { key: timerKey("Ghoul Lord", "Lower Guk"), mob: "Ghoul Lord", place: "Lower Guk" };
const learningFor = (all: RespawnLearning[], mob: string) =>
  all.find((l) => l.mob === mob) ?? assert.fail(`no learning for ${mob}`);

// ── the shortest gap, not the average ──────────────────────────────────────────
// You cannot kill a mob before it spawns, so every gap is an upper bound and the shortest is the
// tightest one. An average would describe when the player happened to show up.

test("the learned interval is the shortest gap, not the mean of them", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", 600), kill("Ghoul Lord", 3600)];
  const [learned] = learnRespawns(kills, always);
  assert.equal(learned.shortestSeconds, 600);
  assert.equal(learned.samples, 2);
});

test("a later, longer gap never stretches an interval already learned", () => {
  const tight = learnRespawns([kill("Ghoul Lord", 0), kill("Ghoul Lord", 600)], always);
  const withLate = learnRespawns(
    [kill("Ghoul Lord", 0), kill("Ghoul Lord", 600), kill("Ghoul Lord", 9000)],
    always,
  );
  assert.equal(tight[0].shortestSeconds, 600);
  assert.equal(withLate[0].shortestSeconds, 600, "arriving late is not evidence the mob got slower");
});

test("a shorter gap tightens it, which is the only direction it moves", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", 900), kill("Ghoul Lord", 1200)];
  assert.equal(learnRespawns(kills, always)[0].shortestSeconds, 300);
});

test("one kill teaches nothing, and says so rather than guessing", () => {
  const [learned] = learnRespawns([kill("Ghoul Lord", 0)], always);
  assert.equal(learned.shortestSeconds, undefined);
  assert.equal(learned.samples, 0);
});

// ── what isn't evidence ────────────────────────────────────────────────────────

test("a gap under the floor is two mobs sharing a name, and is discarded not clamped", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", MIN_RESPAWN_SECONDS - 10)];
  const [learned] = learnRespawns(kills, always);
  assert.equal(learned.shortestSeconds, undefined, "clamping would invent a permanent short timer");
  assert.equal(learned.samples, 0);
});

test("a gap over the ceiling is you not being there", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", MAX_LEARNED_GAP_SECONDS + 60)];
  assert.equal(learnRespawns(kills, always)[0].shortestSeconds, undefined);
});

test("a gap teaches nothing past three hours, however plausible a respawn that long would be", () => {
  // Past a few hours a gap describes the player, not the mob: you went to bed, you logged off, you
  // went to another camp, and none of that is in the log. A genuinely long timer is reachable by
  // typing it or taking it off the wiki — never by sleeping through one.
  const inside = [kill("Ghoul Lord", 0), kill("Ghoul Lord", MAX_LEARNED_GAP_SECONDS - 60)];
  assert.equal(learnRespawns(inside, always)[0].shortestSeconds, MAX_LEARNED_GAP_SECONDS - 60);
  const outside = [kill("Ghoul Lord", 0), kill("Ghoul Lord", MAX_LEARNED_GAP_SECONDS + 60)];
  assert.equal(learnRespawns(outside, always)[0].samples, 0);
});

test("but a sighting you made on purpose is held to the outer ceiling, not the gap rule", () => {
  // The long-timer case: a named you typed six hours for, seen up five hours after it died. That is
  // a deliberate observation about a mob already known to be slow, and the tightest evidence the app
  // can hold — capping it at the gap rule would throw away the only thing a long camp can gather.
  const long = 5 * 60 * 60;
  assert.equal(sightingFrom(iso(0), T0 + long * 1000), long);
  assert.equal(floorFrom(iso(0), T0 + long * 1000), long);
  // And still refused past the ceiling, where it stops being a claim about a respawn at all.
  assert.equal(sightingFrom(iso(0), T0 + (MAX_RESPAWN_SECONDS + 60) * 1000), null);
});

test("a peer's kill is skipped: their clock can't be allowed to tighten a ratchet", () => {
  const kills = [
    kill("Ghoul Lord", 0),
    kill("Ghoul Lord", 200, { sharedBy: "Someone" }),
    kill("Ghoul Lord", 900),
  ];
  const [learned] = learnRespawns(kills, always);
  assert.equal(learned.shortestSeconds, 900, "the peer's row is dropped, not used as a boundary");
  assert.equal(learned.samples, 1);
});

test("a bystander's kill in your own log does count — it is your clock that wrote it", () => {
  const kills = [kill("Ghoul Lord", 0, { mine: false }), kill("Ghoul Lord", 900, { mine: false })];
  assert.equal(learnRespawns(kills, always)[0].shortestSeconds, 900);
});

test("a kill with no zone is skipped: it can't be compared with the one before it", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", 900, { zone: undefined })];
  assert.equal(learnRespawns(kills, always)[0].shortestSeconds, undefined);
});

test("a mob that isn't named is not learned from at all", () => {
  const kills = [kill("gnoll pup", 0), kill("gnoll pup", 900)];
  assert.deepEqual(learnRespawns(kills, () => false), []);
});

test("the same named in two zones is two timers", () => {
  const kills = [
    kill("Ghoul Lord", 0),
    kill("Ghoul Lord", 900),
    kill("Ghoul Lord", 0, { zone: "Upper Guk" }),
    kill("Ghoul Lord", 600, { zone: "Upper Guk" }),
  ];
  const learned = learnRespawns(kills, always);
  assert.equal(learned.length, 2);
  assert.notEqual(learned[0].key, learned[1].key);
});

test("records out of order are sorted, so a negative gap can't read as a fast respawn", () => {
  const kills = [kill("Ghoul Lord", 900), kill("Ghoul Lord", 0)];
  assert.equal(learnRespawns(kills, always)[0].shortestSeconds, 900);
});

test("relearning ignores everything before the cutoff — the only way down from a ratchet", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", 200), kill("Ghoul Lord", 1400)];
  const key = timerKey("Ghoul Lord", "Lower Guk");
  // A bogus 200s gap is learned...
  assert.equal(learnRespawns(kills, always)[0].shortestSeconds, 200);
  // ...and told to start over at t=150, only the gaps beginning after it are re-derived.
  const after = learnRespawns(kills, always, { relearnedAt: (k) => (k === key ? T0 + 150_000 : undefined) });
  assert.equal(after[0].shortestSeconds, 1200);
});

test("a relearned mob keeps its row, with nothing in it, rather than vanishing", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", 900)];
  const learned = learnRespawns(kills, always, { relearnedAt: () => T0 + 950_000 });
  assert.equal(learned.length, 1, "the row carries the figure the player typed — losing it loses that");
  assert.equal(learned[0].shortestSeconds, undefined);
  assert.equal(learned[0].samples, 0);
  assert.equal(learned[0].lastKillAt, iso(900), "the last kill is still the last kill");
});

test("a cutoff for one timer leaves another alone", () => {
  const kills = [
    kill("Ghoul Lord", 0),
    kill("Ghoul Lord", 900),
    kill("Frenzied Ghoul", 0),
    kill("Frenzied Ghoul", 900),
  ];
  const learned = learnRespawns(kills, always, {
    relearnedAt: (k) => (k === timerKey("Ghoul Lord", "Lower Guk") ? T0 + 950_000 : undefined),
  });
  assert.equal(learningFor(learned, "Ghoul Lord").shortestSeconds, undefined);
  assert.equal(learningFor(learned, "Frenzied Ghoul").shortestSeconds, 900);
});

// ── one gap at a time ──────────────────────────────────────────────────────────
// The finest correction there is: the pull that was really the placeholder, thrown out without
// losing everything else the camp taught.

test("every counting gap is listed, shortest first — the shortest is the figure", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", 1200), kill("Ghoul Lord", 1500)];
  const [learned] = learnRespawns(kills, always);
  assert.deepEqual(learned.gaps.map((g) => g.seconds), [300, 1200]);
  assert.equal(learned.shortestSeconds, 300);
});

test("dropping one gap re-derives the figure from the rest", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", 1200), kill("Ghoul Lord", 1500)];
  const [before] = learnRespawns(kills, always);
  const bad = before.gaps[0].id; // the 300s pull that was really the placeholder
  const [after] = learnRespawns(kills, always, { isDropped: (_k, id) => id === bad });
  assert.equal(after.shortestSeconds, 1200, "the rest of the camp's history is untouched");
  assert.equal(after.samples, 1);
});

test("a dropped gap stays listed, so it can be put back", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", 1200), kill("Ghoul Lord", 1500)];
  const [before] = learnRespawns(kills, always);
  const bad = before.gaps[0].id;
  const [after] = learnRespawns(kills, always, { isDropped: (_k, id) => id === bad });
  // An exclusion you cannot see is an exclusion you cannot undo.
  assert.equal(after.gaps.length, 2);
  assert.equal(after.gaps.find((g) => g.id === bad)?.dropped, true);
});

test("dropping every gap leaves a row with no figure rather than no row", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", 1200)];
  const [learned] = learnRespawns(kills, always, { isDropped: () => true });
  assert.equal(learned.shortestSeconds, undefined);
  assert.equal(learned.samples, 0);
  assert.equal(learned.gaps.length, 1, "still there to be put back");
});

test("a gap's id is the pair of kills it spans, so it survives a re-read", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", 1200)];
  const first = learnRespawns(kills, always)[0].gaps[0].id;
  // The same log read again — ids must match, or an exclusion would silently stop applying.
  const again = learnRespawns([...kills], always)[0].gaps[0].id;
  assert.equal(first, again);
  assert.equal(first, `${iso(0)}|${iso(1200)}`);
});

test("gaps that were never evidence are not listed as exclusions", () => {
  const kills = [
    kill("Ghoul Lord", 0),
    kill("Ghoul Lord", 30), // under the floor: two mobs sharing a name, not a decision anyone made
    kill("Ghoul Lord", 1230),
  ];
  const [learned] = learnRespawns(kills, always);
  assert.deepEqual(learned.gaps.map((g) => g.seconds), [1200]);
});

// ── the difficulty changing ────────────────────────────────────────────────────
// Changing the instance difficulty respawns everything, and the log reports it as a different
// *variant* of the zone you were already in. That makes a gap arbitrarily short for a reason
// nothing to do with the mob — the one error a bound that only falls can never recover from.

test("variants of a zone are one camp, which is what makes the gap rule necessary", () => {
  // If these were two timers the problem would solve itself. They are deliberately one (ADR 0083),
  // so the raw zone has to be carried as far as the gap.
  assert.equal(timerKey("Ghoul Lord", "Lower Guk"), timerKey("Ghoul Lord", "Lower Guk 2"));
});

test("a gap spanning a difficulty change is thrown out", () => {
  const kills = [
    kill("Ghoul Lord", 0),
    // ...difficulty changed, everything repopped, and it was killed again almost at once.
    kill("Ghoul Lord", 300, { zone: "Lower Guk 2" }),
  ];
  const [learned] = learnRespawns(kills, always);
  assert.equal(learned.shortestSeconds, undefined, "300s is what the difficulty change did, not the mob");
  assert.equal(learned.samples, 0);
});

test("kills either side of a difficulty change still teach within each difficulty", () => {
  const kills = [
    kill("Ghoul Lord", 0),
    kill("Ghoul Lord", 1200),
    kill("Ghoul Lord", 1500, { zone: "Lower Guk 2" }),
    kill("Ghoul Lord", 3300, { zone: "Lower Guk 2" }),
  ];
  const [learned] = learnRespawns(kills, always);
  // 1200s and 1800s are real; the 300s across the change is not — and it is the shortest of the
  // three, so keeping it would have set the figure permanently wrong.
  assert.equal(learned.shortestSeconds, 1200);
  assert.equal(learned.longestSeconds, 1800);
  assert.equal(learned.samples, 2);
});

test("the last kill is still the last kill, whichever difficulty it happened in", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", 900, { zone: "Lower Guk 2" })];
  assert.equal(learnRespawns(kills, always)[0].lastKillAt, iso(900));
});

test("a key is one mob in one place", () => {
  assert.equal(timerKey("Ghoul Lord", "Lower Guk"), timerKey("ghoul lord", "Lower Guk"));
  assert.notEqual(timerKey("Ghoul Lord", "Lower Guk"), timerKey("Ghoul Lord", "Upper Guk"));
});

// ── proving a mob is named ─────────────────────────────────────────────────────
// The article is the only signal, and it's gone from every record stored before it was captured.

test("one articleless kill proves a mob named", () => {
  assert.ok(provenNamed([kill("Ghoul Lord", 0, { named: true })]).has("ghoul lord"));
});

test("an absent flag is unknown, not plain — it proves nothing either way", () => {
  const proven = provenNamed([kill("Ghoul Lord", 0, { named: undefined })]);
  assert.equal(proven.size, 0);
});

test("one fresh kill settles a mob whose older records lost the article", () => {
  const kills = [kill("Ghoul Lord", 0, { named: undefined }), kill("Ghoul Lord", 900, { named: true })];
  const proven = provenNamed(kills);
  assert.ok(proven.has("ghoul lord"));
  // ...and the old record is then usable as evidence about the interval, retroactively.
  assert.equal(learnRespawns(kills, (k) => proven.has(k))[0].shortestSeconds, 900);
});

test("a mob written with an article is not collected", () => {
  assert.equal(provenNamed([kill("gnoll pup", 0, { named: false })]).size, 0);
});

// ── which figure wins ──────────────────────────────────────────────────────────

test("a stated interval outranks anything learned", () => {
  const learned = learningFor(learnRespawns([kill("Ghoul Lord", 0), kill("Ghoul Lord", 900)], always), "Ghoul Lord");
  const respawn = respawnFor(learned, 1200);
  assert.equal(respawn?.seconds, 1200);
  assert.equal(respawn?.source, "stated");
});

test("clearing a stated interval restores what was learned rather than nothing", () => {
  const learned = learningFor(learnRespawns([kill("Ghoul Lord", 0), kill("Ghoul Lord", 900)], always), "Ghoul Lord");
  assert.equal(respawnFor(learned, undefined)?.seconds, 900);
  assert.equal(respawnFor(learned, undefined)?.source, "killed");
});

test("nothing learned and nothing stated is no answer, not a default", () => {
  assert.equal(respawnFor(undefined, undefined), undefined);
});

// ── the countdown ──────────────────────────────────────────────────────────────

test("a timer is due one interval after the kill", () => {
  const learned = learningFor(learnRespawns([kill("Ghoul Lord", 0), kill("Ghoul Lord", 900)], always), "Ghoul Lord");
  const timer = timerFrom(learned, iso(1800), { seconds: 900, source: "killed", samples: 1 });
  assert.equal(timer?.dueAt, iso(2700));
});

test("with no padding a timer waits, comes up, then goes stale — and staleness is never alerted", () => {
  // watchFrom === dueAt is every timer until someone pads one, and must behave exactly as a
  // point-in-time countdown always did.
  const timer = { watchFrom: iso(1000), dueAt: iso(1000) };
  assert.equal(spawnState(timer, T0), "waiting");
  assert.equal(spawnState(timer, T0 + 1000 * 1000), "up");
  assert.equal(spawnState(timer, T0 + (1000 + OVERDUE_GRACE_SECONDS - 1) * 1000), "up");
  assert.equal(spawnState(timer, T0 + (1000 + OVERDUE_GRACE_SECONDS + 1) * 1000), "stale");
});

test("an unreadable due time is stale rather than a countdown we honour", () => {
  assert.equal(spawnState({ watchFrom: "not a date", dueAt: "not a date" }, T0), "stale");
});

test("remaining goes negative once overdue, so a caller can say how long ago", () => {
  assert.equal(remainingMs({ dueAt: iso(60) }, T0), 60_000);
  assert.equal(remainingMs({ dueAt: iso(-60) }, T0), -60_000);
});

// ── the window, and the padding that opens it ──────────────────────────────────
// A respawn is a soft thing: a placeholder may have popped instead, the mob may be walking, and
// the player may simply want to be in position early. None of that is measurable, so the padding
// is theirs to set and we refuse to invent a lower bound of our own (ADR 0094).

test("padding opens a window before the by-time, and the by-time doesn't move", () => {
  const timer = timerFrom(LEARNED, iso(0), { seconds: 900, source: "killed", samples: 2 }, 120);
  assert.equal(timer?.dueAt, iso(900), "the evidence said 900s; padding is not a new measurement");
  assert.equal(timer?.watchFrom, iso(780));
  assert.equal(timer?.lead, 120);
});

test("inside the window a timer says 'might be up', which is what padding is for", () => {
  const timer = timerFrom(LEARNED, iso(0), { seconds: 900, source: "killed", samples: 2 }, 120);
  assert.ok(timer);
  assert.equal(spawnState(timer, T0 + 779_000), "waiting");
  assert.equal(spawnState(timer, T0 + 800_000), "window");
  assert.equal(spawnState(timer, T0 + 900_000), "up");
});

test("padding can't reach back past the kill, which would leave a window permanently open", () => {
  const timer = timerFrom(LEARNED, iso(0), { seconds: 900, source: "killed", samples: 2 }, 5000);
  assert.equal(timer?.lead, 900);
  assert.equal(timer?.watchFrom, iso(0));
});

test("no padding means no window at all — watchFrom is the by-time", () => {
  const timer = timerFrom(LEARNED, iso(0), { seconds: 900, source: "killed", samples: 2 });
  assert.equal(timer?.watchFrom, timer?.dueAt);
  assert.equal(timer?.lead, 0);
});

test("the countdown counts to the window opening, then to the by-time", () => {
  const timer = timerFrom(LEARNED, iso(0), { seconds: 900, source: "killed", samples: 2 }, 120);
  assert.ok(timer);
  assert.equal(countdownMs(timer, T0), 780_000, "while waiting, the next moment is the window");
  assert.equal(countdownMs(timer, T0 + 800_000), 100_000, "inside it, how much window is left");
  assert.equal(countdownMs(timer, T0 + 950_000), -50_000, "past it, how long ago it was due");
});

// ── gaps that disagree ─────────────────────────────────────────────────────────

test("both ends of the evidence are kept, not just the shortest", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", 900), kill("Ghoul Lord", 3600)];
  const [learned] = learnRespawns(kills, always);
  assert.equal(learned.shortestSeconds, 900);
  assert.equal(learned.longestSeconds, 2700);
});

test("gaps that cluster are trusted; gaps that disagree are flagged", () => {
  assert.equal(erratic({ seconds: 900, source: "killed", samples: 3, spreadSeconds: 1000 }), false);
  assert.equal(erratic({ seconds: 900, source: "killed", samples: 3, spreadSeconds: 2700 }), true);
});

test("a figure the player typed is never called erratic — they aren't guessing", () => {
  assert.equal(erratic({ seconds: 900, source: "stated", samples: 0, spreadSeconds: 9999 }), false);
});

test("one gap can't disagree with itself", () => {
  const [learned] = learnRespawns([kill("Ghoul Lord", 0), kill("Ghoul Lord", 900)], always);
  assert.equal(erratic(respawnFor(learned, undefined)!), false);
});

test("erratic gaps lead with the range, because a lone figure gets camped to", () => {
  const wide = { seconds: 900, source: "killed" as const, samples: 3, spreadSeconds: 2700 };
  assert.equal(describeRespawn(wide), "15m–45m, from 3 gaps");
  assert.ok(respawnCaveat(wide)?.includes("placeholder"));
});

test("gaps that agree get the plain bound and no warning", () => {
  const tight = { seconds: 900, source: "killed" as const, samples: 3, spreadSeconds: 1000 };
  assert.equal(describeRespawn(tight), "at most 15m, from 3 gaps");
  assert.equal(respawnCaveat(tight), null);
});

// ── reading main's clock from a window with its own ────────────────────────────
// The bug this pins: the panel added a "seconds since I loaded" counter to the timestamp of every
// *later* fetch, so the displayed clock ran ahead by however long the tab had been open — and a
// refetch (marking a mob dead) measured a brand-new timer against a clock minutes in the future,
// which rendered as 0:00. A timer that looked like it never restarted.

test("skew is the difference between the two clocks, and nothing accumulates", () => {
  const local = T0 + 5_000; // this window's clock, 5s adrift from main's
  const skew = clockSkew(iso(0), local);
  assert.equal(skew, -5_000);
  // The whole point: `Date.now() + skew` tracks main, at any later moment, with no drift.
  assert.equal(local + skew, T0);
  assert.equal(local + 60_000 + skew, T0 + 60_000, "a minute later is a minute later, not two");
});

test("a re-fetch re-anchors rather than adding to what came before", () => {
  // Fetch at T0, then again 10 minutes on. Each skew is measured against the local clock of its own
  // moment, so the second answer is the same as the first — which is what stops the drift.
  assert.equal(clockSkew(iso(0), T0), 0);
  assert.equal(clockSkew(iso(600), T0 + 600_000), 0);
});

test("an unreadable clock is no skew, not a NaN that blanks every row", () => {
  assert.equal(clockSkew("not a date", T0), 0);
});

// ── saying it without overclaiming ─────────────────────────────────────────────

test("a countdown reads as a clock, with hours only when there are hours", () => {
  assert.equal(formatCountdown(7 * 1000), "0:07");
  assert.equal(formatCountdown((12 * 60 + 4) * 1000), "12:04");
  assert.equal(formatCountdown((3600 + 4 * 60 + 12) * 1000), "1:04:12");
  assert.equal(formatCountdown(-5000), "0:00", "overdue is the caller's sentence, not a negative clock");
});

test("an interval reads as a phrase", () => {
  assert.equal(formatInterval(45), "45s");
  assert.equal(formatInterval(22 * 60), "22m");
  assert.equal(formatInterval(6 * 3600), "6h");
  assert.equal(formatInterval(6 * 3600 + 30 * 60), "6h 30m");
});

test("rounding to the minute carries into the hour instead of printing a 60th one", () => {
  // The bug: the hours were floored off the seconds and the leftover rounded on its own, so the
  // minutes could reach 60 without the hour hearing about it.
  assert.equal(formatInterval(59 * 60 + 30), "1h", "59m30s is an hour, not '60m'");
  assert.equal(formatInterval(2 * 3600 - 1), "2h", "1h59m59s is two hours, not '1h 60m'");
  assert.equal(formatInterval(3600 + 59 * 60 + 40), "2h");
  // ...and the ordinary cases are untouched.
  assert.equal(formatInterval(3600 + 29 * 60), "1h 29m");
  assert.equal(formatInterval(59 * 60), "59m");
});

test("a learned figure is worded as a bound with its sample, a stated one is not hedged", () => {
  assert.equal(describeRespawn({ seconds: 1320, source: "killed", samples: 3 }), "at most 22m, from 3 gaps");
  assert.equal(describeRespawn({ seconds: 1320, source: "killed", samples: 1 }), "at most 22m, from 1 gap");
  assert.equal(describeRespawn({ seconds: 1320, source: "stated", samples: 0 }), "22m (you set this)");
});

// ── a timer's own identity, and a camp's several clocks (ADR 0135) ─────────────

test("a countdown's id is its camp and its slot, and reads back as one", () => {
  const key = timerKey("Ghoul Lord", "Lower Guk");
  assert.equal(timerSlot(timerId(key, 3)), 3);
  assert.equal(timerSlot(key), 1, "a file written before slots existed held one clock, which is #1");
  assert.equal(timerSlot("nonsense#x"), 1, "unreadable is the first slot, never NaN");
});

test("a key answers what it is about without anyone else parsing it", () => {
  const key = timerKey("Ghoul Lord", "Lower Guk");
  assert.ok(timerInPlace(key, "lower guk"));
  assert.ok(!timerInPlace(key, "guk"), "part of the place is a different place");
  assert.ok(timerForMob(key, "ghoul lord"));
  assert.ok(!timerForMob(key, "ghoul"));
});

test("a timer takes the slot it was armed in", () => {
  const learning = { key: timerKey("Ghoul Lord", "Lower Guk"), mob: "Ghoul Lord", place: "Lower Guk" };
  const respawn = { seconds: 900, source: "stated" as const, samples: 0 };
  assert.equal(timerFrom(learning, iso(0), respawn)!.id, `${learning.key}#1`, "one clock by default");
  assert.equal(timerFrom(learning, iso(0), respawn, 0, 4)!.id, `${learning.key}#4`);
});

// ── a repeating timer, rolled forward rather than left overdue ────────────────

/** A plain 10-minute clock, started at T0. */
function tenMinutes() {
  const learning = { key: timerKey("Tea", ""), mob: "Tea", place: "" };
  return timerFrom(learning, iso(0), { seconds: 600, source: "stated", samples: 0 })!;
}

test("a timer that hasn't finished is left exactly as it is", () => {
  const timer = tenMinutes();
  assert.equal(rollForward(timer, T0 + 599_000), timer, "the same object, so a caller can apply it blindly");
});

test("a finished one starts again from its own end, not from when we noticed", () => {
  const next = rollForward(tenMinutes(), T0 + 605_000);
  assert.equal(next.dueAt, iso(1200), "on the beat it started on — 20 minutes, not 20:05");
  assert.equal(next.killedAt, iso(600));
});

test("an app shut for a fortnight comes back on the next real cycle, not a thousand overdue ones", () => {
  const fortnight = 14 * 24 * 3600;
  const next = rollForward(tenMinutes(), T0 + fortnight * 1000 + 1);
  assert.ok(Date.parse(next.dueAt) > T0 + fortnight * 1000, "ahead of us");
  assert.ok(Date.parse(next.dueAt) <= T0 + (fortnight + 600) * 1000, "by less than one cycle");
});

test("a fresh cycle is not still being looked at", () => {
  const seen = { ...tenMinutes(), seenAt: iso(300) };
  assert.equal(rollForward(seen, T0 + 605_000).seenAt, undefined);
});

// ── the figure a player types (ADR 0135) ──────────────────────────────────────

test("hours and days are typable, which is the whole complaint", () => {
  assert.equal(parseInterval("4h"), 4 * 3600);
  assert.equal(parseInterval("240m"), 240 * 60, "and are not quietly clamped to the alert cue's half hour");
  assert.equal(parseInterval("3d"), 3 * 86400);
  assert.equal(parseInterval("22m"), 1320);
  assert.equal(parseInterval("soon"), null);
  assert.equal(parseInterval("99999d"), MAX_TIMER_SECONDS);
});

test("a day-scale figure reads in days", () => {
  assert.equal(formatInterval(86400), "1d");
  assert.equal(formatInterval(3 * 86400 + 4 * 3600), "3d 4h");
  assert.equal(formatInterval(86400 - 60), "23h 59m", "and below a day nothing changed");
});

// ── who is a named, when the named fights back ───────────────────────────────

test("a pet is never a named, whoever killed it", () => {
  // The log's possessive is the only ownership it states, and it states it about a pet — so this
  // needs no registry and works for a stranger's pet as well as yours.
  const proven = provenNamed([
    kill("Kainos`s warder", 0, { named: true, killerNamed: true, killer: "Ghoul Lord" }),
    kill("Ghoul Lord", 100, { named: true, killerNamed: true, killer: "Kainos" }),
  ]);
  assert.ok(!proven.has("kainos`s warder"));
  assert.ok(proven.has("ghoul lord"), "and the mob that killed it still is one");
});

test("a person is never a named, and the log says who is one by what they kill", () => {
  const proven = provenNamed([
    // One kill of something with an article is the proof: mobs are what people kill.
    kill("a froglok tad", 0, { named: false, killerNamed: true, killer: "Bunnyslayer" }),
    kill("Bunnyslayer", 100, { named: true, killerNamed: true, killer: "Ghoul Lord" }),
  ]);
  assert.ok(!proven.has("bunnyslayer"));
});

test("the order it happened in doesn't matter — proof arriving later still applies", () => {
  const late = provenNamed([
    kill("Bunnyslayer", 0, { named: true, killerNamed: true, killer: "Ghoul Lord" }),
    // ...and only afterwards does the log show them killing something.
    kill("a froglok tad", 100, { named: false, killerNamed: true, killer: "Bunnyslayer" }),
  ]);
  assert.ok(!late.has("bunnyslayer"), "a name cannot be a named for the first half of an evening");
});

test("a named killed by a person is still exactly what the rule is for", () => {
  const proven = provenNamed([kill("Ghoul Lord", 0, { named: true, killerNamed: true, killer: "Kainos" })]);
  assert.ok(proven.has("ghoul lord"));
});

// ── learning one camp is learning that camp ──────────────────────────────────

test("asking for one camp gives the same answer as asking for all of them", () => {
  const kills = [
    kill("Ghoul Lord", 0),
    kill("Ghoul Lord", 900),
    kill("Ghoul Lord", 2100),
    kill("Frenzied Ghoul", 300),
    kill("Frenzied Ghoul", 1500),
  ];
  const key = timerKey("Ghoul Lord", "Lower Guk");
  const all = learnRespawns(kills, () => true).find((l) => l.key === key);
  const one = learnRespawns(kills, () => true, { only: key });
  assert.equal(one.length, 1, "and nothing about the camps that were not asked for");
  assert.deepEqual(one[0], all);
});

// ── a camp's gap list is bounded ─────────────────────────────────────────────

test("a long-camped mob lists a bounded number of gaps, and still counts them all", () => {
  // 60 clean cycles, which a real camp reaches in an evening or two — measured at 124 on a replay.
  const kills = Array.from({ length: 60 }, (_, i) => kill("Ghoul Lord", i * 900));
  const [learned] = learnRespawns(kills, () => true);
  assert.equal(learned.samples, 59, "every gap counts towards the sample");
  assert.equal(learned.shortestSeconds, 900);
  assert.ok(learned.gaps.length <= MAX_LISTED_GAPS + 1, `listed ${learned.gaps.length}`);
});

test("the shortest are what it keeps, with the other end of the range and anything thrown out", () => {
  // Cycles at 900s, one long gap in the middle, and one dropped gap near the end.
  const times = [0];
  for (let i = 1; i <= 40; i += 1) times.push(times[i - 1] + (i === 20 ? 6000 : 900));
  const kills = times.map((t) => kill("Ghoul Lord", t));
  const key = timerKey("Ghoul Lord", "Lower Guk");
  const droppedId = gapId(T0 + times[38] * 1000, T0 + times[39] * 1000);
  const [learned] = learnRespawns(kills, () => true, { isDropped: (_k, id) => id === droppedId });
  assert.equal(learned.shortestSeconds, 900);
  assert.equal(learned.longestSeconds, 6000, "the figures are over every gap, not over the list");
  assert.ok(
    learned.gaps.some((g) => g.seconds === 6000),
    "the long one is listed, so a wide spread can be judged and dropped from what is shown",
  );
  assert.ok(
    learned.gaps.some((g) => g.id === droppedId && g.dropped),
    "an exclusion you can't see is one you can't undo",
  );
});

// ── a sighting does not keep a row for ever ──────────────────────────────────

test("a mob you marked up leaves the board once the sighting has nothing left to say", () => {
  const seen = { watchFrom: iso(0), dueAt: iso(0), seenAt: iso(600) };
  assert.equal(spawnState(seen, T0 + 600_000), "alive");
  assert.equal(spawnState(seen, T0 + (600 + OVERDUE_GRACE_SECONDS) * 1000), "alive", "the grace is inclusive");
  assert.equal(
    spawnState(seen, T0 + (600 + OVERDUE_GRACE_SECONDS + 1) * 1000),
    "stale",
    "an hour later you either killed it or left; a month later it is absurd",
  );
});

// ── building a timer from a kill you already made (ADR 0151) ───────────────────
// The kill log knows what you have killed, where, and when. Everything here is about handing that
// to a player who is deciding what to time, rather than making them remember and retype it.

test("a camp is offered per mob and place, newest kill first", () => {
  const camps = recentCamps([
    kill("Ghoul Lord", 0),
    kill("Ghoul Lord", 900),
    kill("Frenzied Ghoul", 600, { zone: "Upper Guk" }),
  ]);
  assert.deepEqual(
    camps.map((c) => [c.mob, c.place, c.kills]),
    [
      ["Ghoul Lord", "Lower Guk", 2],
      ["Frenzied Ghoul", "Upper Guk", 1],
    ],
  );
  assert.equal(camps[0].killedAt, iso(900));
  assert.equal(camps[0].key, timerKey("Ghoul Lord", "Lower Guk"));
});

test("the zone travels raw, so a countdown is filed against the difficulty it died in", () => {
  // The camp folds the variants into one key — that is the whole point of `timerKey` — but the
  // *countdown* has to be started with the string the log wrote, or it lands in another instance.
  const [camp] = recentCamps([
    kill("Ghoul Lord", 0, { zone: "Lower Guk" }),
    kill("Ghoul Lord", 900, { zone: "Lower Guk 2 (Adaptive)" }),
  ]);
  assert.equal(camp.key, timerKey("Ghoul Lord", "Lower Guk"));
  assert.equal(camp.zone, "Lower Guk 2 (Adaptive)");
  assert.equal(camp.place, "Lower Guk");
});

test("a mob the article test hasn't settled is still offered — the player is the one choosing", () => {
  // `provenNamed` is the right gate for tracking something automatically and the wrong one for a
  // list somebody is reading: refusing to show a mob they killed an hour ago is the app being
  // certain in place of the person who was there.
  const camps = recentCamps([kill("gnoll pup", 0, { named: false })]);
  assert.deepEqual(
    camps.map((c) => [c.mob, c.named]),
    [["gnoll pup", false]],
  );
});

test("one kill without an article settles the camp, whichever kill it was", () => {
  const [camp] = recentCamps([kill("Ghoul Lord", 0, { named: false }), kill("Ghoul Lord", 900, { named: true })]);
  assert.equal(camp.named, true);
});

test("a kill nothing can place, and a peer's kill, are not somewhere to start a clock", () => {
  assert.deepEqual(recentCamps([kill("Ghoul Lord", 0, { zone: undefined })]), []);
  assert.deepEqual(recentCamps([kill("Ghoul Lord", 0, { sharedBy: "someone" })]), []);
});

test("the list is capped, keeping the newest", () => {
  const kills = Array.from({ length: 8 }, (_, n) => kill(`Mob ${n}`, n * 900));
  const camps = recentCamps(kills, 3);
  assert.deepEqual(
    camps.map((c) => c.mob),
    ["Mob 7", "Mob 6", "Mob 5"],
  );
});

/** The blank row's explanation, insisting there is one — a `null` here is the bug being tested for. */
const reason = (l: RespawnLearning) => untimedReason(l) ?? assert.fail(`no reason for ${l.mob}`);

// ── saying why a camp is blank ─────────────────────────────────────────────────
// "Not timed yet" was three situations wearing one face, and all three read as the app being broken.

test("a gap thrown out for spanning a difficulty change is counted, not silently dropped", () => {
  const kills = [
    kill("Ghoul Lord", 0, { zone: "Lower Guk" }),
    kill("Ghoul Lord", 900, { zone: "Lower Guk 2 (Adaptive)" }),
  ];
  const [learned] = learnRespawns(kills, always);
  assert.equal(learned.samples, 0);
  assert.equal(learned.crossedDifficulty, 1);
  assert.match(reason(learned), /difficulty change/);
});

test("an implausible gap is not blamed on the difficulty it happens to span", () => {
  // A fortnight between two kills was never going to teach us anything, so counting it as a cost of
  // the difficulty rule would be a lie about why the row is blank.
  const kills = [
    kill("Ghoul Lord", 0, { zone: "Lower Guk" }),
    kill("Ghoul Lord", 14 * 24 * 3600, { zone: "Lower Guk 2 (Adaptive)" }),
  ];
  const [learned] = learnRespawns(kills, always);
  assert.equal(learned.crossedDifficulty, 0);
  assert.match(reason(learned), /Killed once/);
});

test("a camp with a figure owes no explanation", () => {
  const [learned] = learnRespawns([kill("Ghoul Lord", 0), kill("Ghoul Lord", 900)], always);
  assert.equal(learned.samples, 1);
  assert.equal(untimedReason(learned), null);
});

test("gaps the player dropped read as dropped, not as never measured", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", 900)];
  const [learned] = learnRespawns(kills, always, { isDropped: () => true });
  assert.equal(learned.samples, 0);
  assert.match(reason(learned), /dropped/);
});

test("a kill too old to still be counting is refused a clock rather than given a stale one", () => {
  // `markDead` would count from any past moment and the sweep would prune the result on its first
  // pass — silently, which is the exact failure this feature exists to end.
  const grace = OVERDUE_GRACE_SECONDS;
  assert.equal(killStillCounts(iso(0), 600, T0 + 10_000), true, "ten seconds in");
  assert.equal(killStillCounts(iso(0), 600, T0 + (600 + grace - 1) * 1000), true, "just inside grace");
  assert.equal(killStillCounts(iso(0), 600, T0 + (600 + grace) * 1000), false, "grace spent");
  assert.equal(killStillCounts("not a time", 600, T0), false);
});

test("a kill seconds old still counts, however short the gap", () => {
  // Unlike a gap being turned into evidence, this has no floor: a mob killed twenty seconds ago is
  // the most alive a countdown ever gets, and flooring it at MIN_RESPAWN_SECONDS refused the case
  // the button is pressed in most often.
  assert.equal(killStillCounts(iso(0), 600, T0 + 20_000), true);
});

// ── five defects found by replaying a real 31,000-line log (ADR 0153) ─────────

test("a pet is not a named, whichever way the log names it", () => {
  // EQ writes an owned creature two ways. `<Owner>`s warder` was already caught; the plain
  // `<Owner> pet` was not, and put six pets on the board of a real log — one with a learned respawn.
  const pets = ["Lord Sviir pet", "Orc centurion pet", "fragile pet", "Kainos`s warder"];
  for (const mob of pets) {
    const proven = provenNamed([kill(mob, 0), kill(mob, 900)]);
    assert.equal(proven.size, 0, `${mob} was taken for a named`);
  }
});

test("...but a mob whose name merely ends in those letters still counts", () => {
  // The suffix has to be a whole word, or the guard starts eating real mobs.
  for (const mob of ["a carpet", "Pettr", "Trumpet"]) {
    const proven = provenNamed([kill(mob, 0), kill(mob, 900)]);
    assert.equal(proven.size, 1, `${mob} was mistaken for a pet`);
  }
});

test("the pet's owner is still a named in its own right", () => {
  // Killing "Lord Sviir pet" must not blacklist "Lord Sviir".
  const proven = provenNamed([kill("Lord Sviir pet", 0), kill("Lord Sviir", 100), kill("Lord Sviir", 700)]);
  assert.deepEqual([...proven], ["lord sviir"]);
});

test("a camp nobody has killed says so, rather than claiming one kill", () => {
  // The row a player types in for a camp they mean to sit at. Every other sentence here is about
  // kills that happened, and telling them they killed it once is simply untrue.
  const added = { key: "x|y", mob: "Lord Nagafen", place: "Nagafens Lair", samples: 0, gaps: [], crossedDifficulty: 0 };
  assert.match(reason(added as RespawnLearning), /Not killed yet/);
  // One kill is a different sentence, and still the right one.
  const [once] = learnRespawns([kill("Ghoul Lord", 0)], always);
  assert.match(reason(once), /Killed once/);
});
