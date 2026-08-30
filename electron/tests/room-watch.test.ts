/**
 * When a room of one is worth doubting, and what a look at the directory settles.
 *
 * The bug these exist for is the one nobody could reproduce on purpose: two people launch the app
 * together, each ends up leading their own room under the same id, and they cannot see each other
 * "until magically they can". The magic was a five-minute timer, and a timer is a guess — so the
 * tests below are mostly about the two things a guess got wrong. A **solitary** player must never be
 * re-joined (their room is the real one, and churning it costs them the session), and a **split**
 * player must be, promptly, without anybody clicking anything.
 *
 * `now` and `random` are injected the way every other clock in this codebase is, so a five-minute
 * ladder is exercised in microseconds and the jitter is a number rather than a coin toss.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALONE_CHECKS_MS, createRoomWatch, spread, type RoomProbe, type RoomWatch } from "../../src/shared/room-watch";

/** Nothing found: the directory names a leader nobody can reach, which is usually us. */
const NOBODY: RoomProbe = { reached: false };
/** Somebody answered — the room the world can find, and we are not in it. */
const SOMEBODY: RoomProbe = { reached: true, peers: 2 };

const ALONE = { connected: true, peers: 0 };
const COMPANY = { connected: true, peers: 1 };
const OFFLINE = { connected: false, peers: 0 };

/** A watch on a clock you drive by hand. `random: 0.5` makes `spread` the identity, so waits are exact. */
function watchAt(random = () => 0.5): { watch: RoomWatch; tick: (ms: number) => void; at: () => number } {
  let clock = 1_000_000;
  const watch = createRoomWatch({ now: () => clock, random });
  return { watch, tick: (ms) => void (clock += ms), at: () => clock };
}

/** Sit still until the watch wants a look, answering every probe with `answer`. Returns the verdicts. */
function runFor(
  ms: number,
  w: ReturnType<typeof watchAt>,
  look: { connected: boolean; peers: number },
  answer: RoomProbe,
): { probes: number; rejoins: number } {
  const end = w.at() + ms;
  let probes = 0;
  let rejoins = 0;
  while (w.at() < end) {
    if (w.watch.saw(look) === "probe") {
      probes += 1;
      if (w.watch.probed(answer) === "rejoin") rejoins += 1;
    }
    w.tick(Math.max(1, Math.min(w.watch.waiting(), end - w.at())));
  }
  return { probes, rejoins };
}

// ── The ladder itself ────────────────────────────────────────────────────────

test("spread scatters a wait over half to one-and-a-half of itself, and never off it", () => {
  // The bound is the contract: two clients that started together must not be able to land on the
  // same wait, and neither may drift so far that a rung stops meaning what it says.
  assert.equal(spread(1000, () => 0), 500);
  assert.equal(spread(1000, () => 0.5), 1000);
  assert.equal(spread(1000, () => 0.999), 1499);
  for (let i = 0; i < 500; i++) {
    const ms = spread(60_000);
    assert.ok(ms >= 30_000 && ms <= 90_000, `${ms} outside the spread`);
  }
});

test("the ladder escalates and then holds, rather than running out", () => {
  // ADR 0070's ladder ended, and that ending is what left a split pair split all evening. This one
  // holds at the top step for as long as somebody stays alone.
  assert.deepEqual(ALONE_CHECKS_MS, [20_000, 45_000, 90_000, 180_000, 300_000]);
  const w = watchAt();
  w.watch.saw(ALONE); // the join lands

  const waits: number[] = [];
  for (let i = 0; i < 8; i++) {
    waits.push(w.watch.waiting());
    w.tick(w.watch.waiting());
    assert.equal(w.watch.saw(ALONE), "probe", `look ${i} should have been due`);
    w.watch.probed(NOBODY);
  }
  assert.deepEqual(waits, [20_000, 45_000, 90_000, 180_000, 300_000, 300_000, 300_000, 300_000]);
});

test("a join that has only just landed is not yet evidence of anything", () => {
  const w = watchAt();
  assert.equal(w.watch.saw(ALONE), "wait");
  // Not even a moment later: the first rung has to elapse first, because every join begins alone.
  w.tick(ALONE_CHECKS_MS[0] - 1);
  assert.equal(w.watch.saw(ALONE), "wait");
  w.tick(1);
  assert.equal(w.watch.saw(ALONE), "probe");
});

test("looking is not re-joining — a look that finds nobody changes nothing but the next wait", () => {
  // The whole reason the ladder can afford to be unbounded. A solitary player who leaves the app on
  // all evening must never have their session torn down.
  const w = watchAt();
  w.watch.saw(ALONE);
  const { probes, rejoins } = runFor(6 * 60 * 60_000, w, ALONE, NOBODY);
  assert.equal(rejoins, 0, "a solitary player was re-joined");
  // Six hours of the ladder: five rungs, then one every five minutes.
  assert.ok(probes > 60 && probes < 90, `${probes} looks in six hours`);
});

// ── The two answers ──────────────────────────────────────────────────────────

test("somebody answering under our room id means we are in the wrong room", () => {
  const w = watchAt();
  w.watch.saw(ALONE);
  w.tick(ALONE_CHECKS_MS[0]);
  assert.equal(w.watch.saw(ALONE), "probe");
  assert.equal(w.watch.probed(SOMEBODY), "rejoin");
});

test("nobody answering means the room the world finds is ours, so being alone means alone", () => {
  // A peer cannot dial itself, so the likeliest unreachable leader is us. That is the *good* case:
  // everybody else resolving this id will be pointed at us and simply arrive.
  const w = watchAt();
  w.watch.saw(ALONE);
  w.tick(ALONE_CHECKS_MS[0]);
  w.watch.saw(ALONE);
  assert.equal(w.watch.probed(NOBODY), "wait");
});

test("a probe that could not be asked is not an answer", () => {
  // `net.ts` turns a thrown bootstrap error into `{reached:false}` deliberately. Re-joining on a
  // network error would drop a working session on the strength of nothing.
  const w = watchAt();
  w.watch.saw(ALONE);
  w.tick(ALONE_CHECKS_MS[0]);
  w.watch.saw(ALONE);
  assert.equal(w.watch.probed({ reached: false }), "wait");
});

test("the rung advances on the look, not on the verdict", () => {
  // Two consecutive fruitless looks must be further apart than the first two, or a client with an
  // unreachable directory hammers the first rung for ever.
  const w = watchAt();
  w.watch.saw(ALONE);
  w.tick(ALONE_CHECKS_MS[0]);
  w.watch.saw(ALONE);
  assert.equal(w.watch.attempts(), 0);
  w.watch.probed(NOBODY);
  assert.equal(w.watch.attempts(), 1);
  assert.equal(w.watch.waiting(), ALONE_CHECKS_MS[1]);
});

// ── Company, and the budget it refunds ───────────────────────────────────────

test("company refunds the ladder — the bug that left a long session watching nothing", () => {
  // The old lonely retries were spent once and never given back: a client that used its three
  // attempts, then met somebody, then was left alone again had *no* startup retries left at all and
  // fell back on a five-minute guess for the rest of the evening.
  const w = watchAt();
  w.watch.saw(ALONE);
  for (let i = 0; i < 5; i++) {
    w.tick(w.watch.waiting());
    w.watch.saw(ALONE);
    w.watch.probed(NOBODY);
  }
  assert.equal(w.watch.attempts(), ALONE_CHECKS_MS.length - 1, "should be on the slowest rung");

  w.watch.saw(COMPANY);
  assert.equal(w.watch.attempts(), 0);
  assert.equal(w.watch.waiting(), ALONE_CHECKS_MS[0], "the next look should be the quick one again");
});

test("a peer present when a look falls due does not cancel every look after it", () => {
  // The single `setTimeout` this replaces was armed once per join, and returned early if anybody
  // happened to be there when it fired. Somebody who dropped in for a minute permanently disarmed
  // the only thing watching.
  const w = watchAt();
  w.watch.saw(ALONE);
  w.tick(ALONE_CHECKS_MS[0]);
  assert.equal(w.watch.saw(COMPANY), "wait", "company means this room works");

  // They leave. The watch must still be watching.
  w.tick(ALONE_CHECKS_MS[0]);
  assert.equal(w.watch.saw(ALONE), "probe");
  assert.equal(w.watch.probed(SOMEBODY), "rejoin");
});

test("company keeps postponing the look for as long as it lasts", () => {
  const w = watchAt();
  const { probes } = runFor(2 * 60 * 60_000, w, COMPANY, SOMEBODY);
  assert.equal(probes, 0, "a populated room was probed");
});

// ── Outages ─────────────────────────────────────────────────────────────────

test("an outage banks no time towards a look there is nothing to look with", () => {
  // The probe rides the session's own transport. Counting a disconnected hour as an hour of being
  // alone would fire a probe the instant the room came back, before it could possibly meet anybody.
  const w = watchAt();
  w.watch.saw(ALONE);
  w.tick(60 * 60_000);
  assert.equal(w.watch.saw(OFFLINE), "wait");

  // Back up. This is a fresh room, so it gets the full first rung before anyone doubts it.
  assert.equal(w.watch.saw(ALONE), "wait");
  assert.equal(w.watch.waiting(), ALONE_CHECKS_MS[0]);
  w.tick(ALONE_CHECKS_MS[0] - 1);
  assert.equal(w.watch.saw(ALONE), "wait");
});

test("a reconnection keeps its place on the ladder rather than starting the tour again", () => {
  // Otherwise a flapping connection resets to the quickest rung on every recovery and probes every
  // twenty seconds for as long as the flap lasts.
  const w = watchAt();
  w.watch.saw(ALONE);
  for (let i = 0; i < 3; i++) {
    w.tick(w.watch.waiting());
    w.watch.saw(ALONE);
    w.watch.probed(NOBODY);
  }
  assert.equal(w.watch.attempts(), 3);
  w.watch.saw(OFFLINE);
  w.watch.saw(ALONE);
  assert.equal(w.watch.attempts(), 3);
  assert.equal(w.watch.waiting(), ALONE_CHECKS_MS[3]);
});

test("being told we are offline while peers are somehow still listed believes the connection", () => {
  // The roster is a cache and the status is the fact; a stale row must not read as company.
  const w = watchAt();
  w.watch.saw(ALONE);
  w.tick(ALONE_CHECKS_MS[0] * 10);
  assert.equal(w.watch.saw({ connected: false, peers: 4 }), "wait");
  assert.equal(w.watch.attempts(), 0, "a disconnection is not a fruitless look");
});

test("waiting is always a finite, non-negative number a timer can take", () => {
  const w = watchAt(() => 0);
  for (const look of [ALONE, COMPANY, OFFLINE, ALONE, ALONE]) {
    w.watch.saw(look);
    const ms = w.watch.waiting();
    assert.ok(Number.isFinite(ms) && ms >= 0, `waiting() gave ${ms}`);
    w.tick(1_000_000);
    // Overdue is zero, never negative — a caller clamping a negative into `setTimeout` would spin.
    assert.equal(w.watch.waiting(), 0);
  }
});

// ── The scenario the whole thing is for ─────────────────────────────────────

/**
 * Two clients, one directory, and the race that starts the evening.
 *
 * Both resolve an empty directory in the same instant, both become genesis leaders, and the
 * directory keeps whichever hint was registered last. The one it *forgot* can reach the one it
 * kept; the one it kept can only dial itself, and fails.
 */
function splitRoom(seedA: number, seedB: number) {
  const a = watchAt(() => seedA);
  const b = watchAt(() => seedB);
  a.watch.saw(ALONE);
  b.watch.saw(ALONE);

  /** A is the forgotten one: its probe reaches B. B's probe reaches nobody (it dials itself). */
  const answer = (who: "a" | "b"): RoomProbe => (who === "a" ? { reached: true, peers: 1 } : NOBODY);

  let elapsed = 0;
  let rejoinedA: number | null = null;
  let rejoinedB: number | null = null;
  while (elapsed < 30 * 60_000 && rejoinedA === null) {
    const step = Math.max(1, Math.min(a.watch.waiting(), b.watch.waiting()));
    a.tick(step);
    b.tick(step);
    elapsed += step;
    if (a.watch.saw(ALONE) === "probe" && a.watch.probed(answer("a")) === "rejoin") rejoinedA ??= elapsed;
    if (b.watch.saw(ALONE) === "probe" && b.watch.probed(answer("b")) === "rejoin") rejoinedB ??= elapsed;
  }
  return { rejoinedA, rejoinedB, elapsed };
}

test("a split pair reunites in well under a minute, and only the wrong one moves", () => {
  // The reported symptom was an evening of not seeing each other. The old path was three bounded
  // re-joins and then a five-minute watchdog whose clock every one of those re-joins reset — so the
  // earliest reunion was somewhere past seven minutes, and it was a coin toss after that.
  const { rejoinedA, rejoinedB } = splitRoom(0.5, 0.5);
  assert.ok(rejoinedA !== null && rejoinedA <= 20_000, `the forgotten client took ${rejoinedA}ms`);
  assert.equal(rejoinedB, null, "the client the directory points at must stay put");
});

test("the cure holds however the jitter falls", () => {
  // Including the case that used to be fatal: identical clients, identical waits, perfect lockstep.
  for (const [x, y] of [[0, 0], [0.999, 0.999], [0, 0.999], [0.5, 0.1], [0.25, 0.75]]) {
    const { rejoinedA, rejoinedB } = splitRoom(x, y);
    assert.ok(rejoinedA !== null && rejoinedA <= 30_000, `seeds ${x}/${y}: reunion took ${rejoinedA}ms`);
    assert.equal(rejoinedB, null, `seeds ${x}/${y}: the right room was abandoned`);
  }
});

test("neither of them re-joins when the split is not real", () => {
  // Two people genuinely alone in two different hours of the day. Nothing here may churn.
  const a = watchAt();
  const b = watchAt();
  a.watch.saw(ALONE);
  b.watch.saw(ALONE);
  assert.equal(runFor(60 * 60_000, a, ALONE, NOBODY).rejoins, 0);
  assert.equal(runFor(60 * 60_000, b, ALONE, NOBODY).rejoins, 0);
});
