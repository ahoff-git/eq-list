/**
 * Tests for the holder: when a countdown starts, when it speaks, and the two things it refuses to
 * do — alert about a pop that already happened, and let anything observed overwrite a figure the
 * player typed (ADR 0092).
 *
 * The clock and the sweep are both injected, so a six-hour timer is exercised in a millisecond.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSpawnTracker, type SpawnTracker } from "../spawn-tracker";
import { timerKey } from "../../src/shared/spawn-timers";
import type { CastAlertEvent, CastAlertSettings, KillRecord } from "../../src/shared/types";

const ZONE = "Lower Guk";
const MOB = "Ghoul Lord";
const KEY = timerKey(MOB, ZONE);
const T0 = Date.parse("2026-08-17T12:00:00.000Z");

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "eql-spawns-"));
const iso = (sec: number) => new Date(T0 + sec * 1000).toISOString();

function record(mob: string, sec: number, extra: Partial<KillRecord> = {}): KillRecord {
  return {
    id: `${mob}-${sec}`,
    logId: sec,
    at: iso(sec),
    mob,
    zone: ZONE,
    confidence: 1,
    named: true,
    ...extra,
  };
}

/** Only the fields the tracker reads; the rest of the alert settings never come up. */
const settings = (enabled = true) => ({ enabled }) as CastAlertSettings;

interface Harness {
  tracker: SpawnTracker;
  raised: CastAlertEvent[];
  /** Move the clock and run the sweep the interval would have run. */
  tick(toSec: number): void;
  kills: KillRecord[];
}

function harness(
  options: { kills?: KillRecord[]; settings?: CastAlertSettings; dir?: string; startSec?: number } = {},
): Harness {
  const kills = options.kills ?? [];
  const raised: CastAlertEvent[] = [];
  // Set before the tracker is built, so a restart can be staged at a chosen moment — which is the
  // only way to model coming back *after* a pop rather than sitting through one.
  let nowSec = options.startSec ?? 0;
  let sweep: (() => void) | null = null;
  const tracker = createSpawnTracker({
    userDataDir: options.dir ?? tempDir(),
    kills: () => kills,
    getSettings: () => options.settings ?? settings(),
    raise: (a) => raised.push(a),
    now: () => T0 + nowSec * 1000,
    setInterval: (fn) => {
      sweep = fn;
      return 1;
    },
    clearInterval: () => {
      sweep = null;
    },
  });
  return {
    tracker,
    raised,
    kills,
    tick(toSec) {
      nowSec = toSec;
      sweep?.();
    },
  };
}

/** Two kills 900s apart, which is the least that teaches an interval. */
function timed(): Harness {
  const kills = [record(MOB, 0), record(MOB, 900)];
  const h = harness({ kills });
  h.tracker.noteKill(MOB, ZONE, iso(900), true);
  return h;
}

// ── starting a countdown ───────────────────────────────────────────────────────

test("the second kill of a named starts a countdown, due one interval on", () => {
  const h = timed();
  const view = h.tracker.view();
  assert.equal(view.running.length, 1);
  assert.equal(view.running[0].dueAt, iso(1800));
  assert.equal(view.running[0].source, "learned");
});

test("the first kill of a named starts nothing — a named we can't time is a blank, not a guess", () => {
  const kills = [record(MOB, 0)];
  const h = harness({ kills });
  h.tracker.noteKill(MOB, ZONE, iso(0), true);
  assert.equal(h.tracker.view().running.length, 0);
});

test("a mob written with an article is not timed", () => {
  const kills = [record("gnoll pup", 0, { named: false }), record("gnoll pup", 900, { named: false })];
  const h = harness({ kills });
  h.tracker.noteKill("gnoll pup", ZONE, iso(900), false);
  assert.equal(h.tracker.view().running.length, 0);
});

test("a kill with no zone starts nothing — it can't be a timer for anywhere", () => {
  const h = harness({ kills: [record(MOB, 0), record(MOB, 900)] });
  h.tracker.noteKill(MOB, null, iso(900), true);
  assert.equal(h.tracker.view().running.length, 0);
});

test("killing it again restarts the countdown rather than queuing a second", () => {
  const h = timed();
  h.kills.push(record(MOB, 2000));
  h.tracker.noteKill(MOB, ZONE, iso(2000), true);
  const view = h.tracker.view();
  assert.equal(view.running.length, 1);
  assert.equal(view.running[0].dueAt, iso(2900));
});

// ── speaking, once, and only about the future ──────────────────────────────────

test("a timer alerts when it comes due, and only once", () => {
  const h = timed();
  h.tick(1799);
  assert.equal(h.raised.length, 0);
  h.tick(1800);
  assert.equal(h.raised.length, 1);
  assert.equal(h.raised[0].event, "spawn");
  assert.equal(h.raised[0].spell, MOB);
  assert.equal(h.raised[0].target, ZONE, "the place, since the same named in two zones is two timers");
  h.tick(1900);
  assert.equal(h.raised.length, 1, "a due timer is news once, not every second");
});

test("a kill replayed from a log gap never pops a banner about last night", () => {
  // Catch-up feeds old kills through the same live path, so the timer is born already overdue.
  const kills = [record(MOB, 0), record(MOB, 900)];
  const h = harness({ kills });
  h.tick(5000); // the app started long after both kills
  h.tracker.noteKill(MOB, ZONE, iso(900), true);
  h.tick(5001);
  assert.equal(h.raised.length, 0);
  assert.equal(h.tracker.view().running.length, 0, "and it's stale, so it isn't on the board either");
});

test("silenced alerts silence a pop, and the timer still runs out", () => {
  const kills = [record(MOB, 0), record(MOB, 900)];
  const h = harness({ kills, settings: settings(false) });
  h.tracker.noteKill(MOB, ZONE, iso(900), true);
  h.tick(1800);
  assert.equal(h.raised.length, 0);
  assert.equal(h.tracker.view().running[0].state, "up");
});

test("a timer goes stale and leaves the board once the mob has been up too long", () => {
  const h = timed();
  h.tick(1800);
  assert.equal(h.tracker.view().running[0].state, "up");
  h.tick(1800 + 31 * 60);
  assert.equal(h.tracker.view().running.length, 0);
});

// ── padding, the player's allowance for a soft timer ───────────────────────────
// A respawn is soft for reasons no parser can see — a placeholder popped instead, the mob walked,
// you got up for a drink — so how early to be told is theirs to set (ADR 0094).

test("padding speaks at the window opening, not at the by-time", () => {
  const h = timed();
  h.tracker.pad(KEY, 120);
  h.tick(1679);
  assert.equal(h.raised.length, 0);
  h.tick(1680);
  assert.equal(h.raised.length, 1, "two minutes early, as asked");
  h.tick(1800);
  assert.equal(h.raised.length, 1, "the by-time is not a second announcement");
});

test("a padded warning doesn't claim the mob is up, because it isn't yet", () => {
  const h = timed();
  h.tracker.pad(KEY, 120);
  h.tick(1680);
  assert.match(h.raised[0].message ?? "", /due soon/);
});

test("an unpadded pop keeps the plain banner, which words itself", () => {
  const h = timed();
  h.tick(1800);
  assert.equal(h.raised[0].message, undefined);
});

test("padding a timer already counting down re-shapes the window it's in", () => {
  const h = timed();
  assert.equal(h.tracker.view().running[0].watchFrom, iso(1800));
  // "This one keeps beating me to it" is a thought you have *while waiting* for the pop you want
  // the padding for — so it has to apply now, not next time.
  h.tracker.pad(KEY, 300);
  assert.equal(h.tracker.view().running[0].watchFrom, iso(1500));
  assert.equal(h.tracker.view().running[0].dueAt, iso(1800), "the evidence hasn't changed");
});

test("clearing padding puts the window back", () => {
  const h = timed();
  h.tracker.pad(KEY, 300);
  h.tracker.pad(KEY, null);
  const timer = h.tracker.view().running[0];
  assert.equal(timer.watchFrom, timer.dueAt);
  assert.equal(timer.lead, 0);
});

test("padding survives a restart and arms the next kill", () => {
  const dir = tempDir();
  const kills = [record(MOB, 0), record(MOB, 900)];
  const first = harness({ kills, dir });
  first.tracker.pad(KEY, 120);
  first.tracker.flush();

  const second = harness({ kills, dir });
  second.tracker.noteKill(MOB, ZONE, iso(900), true);
  assert.equal(second.tracker.view().running[0].lead, 120);
});

test("padding into a window that's already open doesn't shout about the past", () => {
  const h = timed();
  h.tick(1700); // still waiting, 100s to go
  h.tracker.pad(KEY, 300); // the window would have opened 200s ago
  h.tick(1701);
  assert.equal(h.raised.length, 0, "a window you opened retroactively never had a moment to announce");
});

// ── the player's word ──────────────────────────────────────────────────────────

test("a stated interval outranks the learned one, and the next kill uses it", () => {
  const h = timed();
  h.tracker.state(KEY, 1200);
  h.kills.push(record(MOB, 2000));
  h.tracker.noteKill(MOB, ZONE, iso(2000), true);
  const timer = h.tracker.view().running[0];
  assert.equal(timer.dueAt, iso(3200));
  assert.equal(timer.source, "stated");
});

test("clearing a stated interval falls back to what was learned, not to nothing", () => {
  const h = timed();
  h.tracker.state(KEY, 1200);
  h.tracker.state(KEY, null);
  const known = h.tracker.view().known.find((k) => k.key === KEY);
  assert.equal(known?.respawn?.seconds, 900);
  assert.equal(known?.respawn?.source, "learned");
});

test("a nonsense stated interval is refused rather than making a mob permanently due", () => {
  const h = timed();
  h.tracker.state(KEY, 0);
  assert.equal(h.tracker.view().known.find((k) => k.key === KEY)?.respawn?.source, "learned");
});

test("the player can call something a named that the log wrote with an article", () => {
  const kills = [record("gnoll pup", 0, { named: false }), record("gnoll pup", 900, { named: false })];
  const h = harness({ kills });
  h.tracker.markNamed("gnoll pup", true);
  assert.equal(h.tracker.view().known.length, 1);
  h.tracker.noteKill("gnoll pup", ZONE, iso(900), false);
  assert.equal(h.tracker.view().running.length, 1);
});

test("calling something not-a-named takes its countdown with it", () => {
  const h = timed();
  assert.equal(h.tracker.view().running.length, 1);
  h.tracker.markNamed(MOB, false);
  assert.equal(h.tracker.view().running.length, 0);
  assert.equal(h.tracker.view().known.length, 0);
});

test("relearning drops the learned figure but keeps the row", () => {
  const h = timed();
  h.tick(1000);
  h.tracker.relearn(KEY);
  const known = h.tracker.view().known.find((k) => k.key === KEY);
  assert.ok(known, "the row survives, so the figure you typed for it survives");
  assert.equal(known?.respawn, undefined);
});

test("stopping a countdown forgets nothing", () => {
  const h = timed();
  h.tracker.stop(KEY);
  assert.equal(h.tracker.view().running.length, 0);
  assert.equal(h.tracker.view().known.find((k) => k.key === KEY)?.respawn?.seconds, 900);
});

// ── surviving a restart ────────────────────────────────────────────────────────

test("a running countdown survives a restart, because a due time is a fact about the world", () => {
  const dir = tempDir();
  const kills = [record(MOB, 0), record(MOB, 900)];
  const first = harness({ kills, dir });
  first.tracker.noteKill(MOB, ZONE, iso(900), true);
  first.tracker.flush();

  const second = harness({ kills, dir });
  const view = second.tracker.view();
  assert.equal(view.running.length, 1);
  assert.equal(view.running[0].dueAt, iso(1800));
});

test("a pop missed while the app was shut is shown, never shouted", () => {
  const dir = tempDir();
  const kills = [record(MOB, 0), record(MOB, 900)];
  const first = harness({ kills, dir });
  first.tracker.noteKill(MOB, ZONE, iso(900), true);
  first.tracker.flush();

  // Come back inside the grace window, after the mob was already due.
  const second = harness({ kills, dir, startSec: 1900 });
  second.tick(1901);
  assert.equal(second.tracker.view().running[0].state, "up", "still worth showing");
  assert.equal(second.raised.length, 0, "a banner about the past is the opposite of the point");
});

test("a stated figure survives a restart", () => {
  const dir = tempDir();
  const kills = [record(MOB, 0), record(MOB, 900)];
  const first = harness({ kills, dir });
  first.tracker.state(KEY, 1200);
  first.tracker.flush();

  const second = harness({ kills, dir });
  assert.equal(second.tracker.view().known.find((k) => k.key === KEY)?.respawn?.seconds, 1200);
});
