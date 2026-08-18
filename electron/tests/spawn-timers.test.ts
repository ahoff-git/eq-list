/**
 * Black-box tests for what repeated kills teach about a respawn: the shortest-gap rule, the things
 * that aren't evidence, and the wording that keeps a bound from reading as a fact (ADR 0092).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countdownMs,
  describeRespawn,
  erratic,
  formatCountdown,
  formatInterval,
  learnRespawns,
  respawnCaveat,
  MAX_RESPAWN_SECONDS,
  MIN_RESPAWN_SECONDS,
  OVERDUE_GRACE_SECONDS,
  provenNamed,
  remainingMs,
  respawnFor,
  spawnState,
  timerFrom,
  timerKey,
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
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", MAX_RESPAWN_SECONDS + 60)];
  assert.equal(learnRespawns(kills, always)[0].shortestSeconds, undefined);
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
  const after = learnRespawns(kills, always, (k) => (k === key ? T0 + 150_000 : undefined));
  assert.equal(after[0].shortestSeconds, 1200);
});

test("a relearned mob keeps its row, with nothing in it, rather than vanishing", () => {
  const kills = [kill("Ghoul Lord", 0), kill("Ghoul Lord", 900)];
  const learned = learnRespawns(kills, always, () => T0 + 950_000);
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
  const learned = learnRespawns(kills, always, (k) =>
    k === timerKey("Ghoul Lord", "Lower Guk") ? T0 + 950_000 : undefined,
  );
  assert.equal(learningFor(learned, "Ghoul Lord").shortestSeconds, undefined);
  assert.equal(learningFor(learned, "Frenzied Ghoul").shortestSeconds, 900);
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
