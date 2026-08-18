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
import { contradicted, respawnCaveat, timerKey } from "../../src/shared/spawn-timers";
import { BUILT_IN_STYLES } from "../../src/shared/alert-styles";
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
    // Killed by you, which is what every one of these means — and now has to say, since a kill
    // by a *mob* is how the log writes a player or a pet dying.
    killerNamed: true,
    ...extra,
  };
}

/**
 * Only the fields the tracker reads. `styles` is real, because a pop resolves its look through
 * `alertStyle` against exactly this list.
 */
const settings = (enabled = true) =>
  ({
    enabled,
    color: "#e5534b",
    position: "top",
    styles: [
      ...BUILT_IN_STYLES,
      { id: "loud", name: "Loud", style: { color: "#00ff00", position: "center" } },
    ],
  }) as unknown as CastAlertSettings;

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

/** The same, but asked to speak — notify is off by default, so every alerting test opts in. */
function noisy(): Harness {
  const h = timed();
  h.tracker.notify(KEY, true);
  return h;
}

// ── starting a countdown ───────────────────────────────────────────────────────

test("the second kill of a named starts a countdown, due one interval on", () => {
  const h = timed();
  const view = h.tracker.view();
  assert.equal(view.running.length, 1);
  assert.equal(view.running[0].dueAt, iso(1800));
  assert.equal(view.running[0].source, "killed");
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
  const h = noisy();
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
  h.tracker.notify(KEY, true); // so silence here is about the past, not about notify
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
  h.tracker.notify(KEY, true); // asked for, and still silenced by the overlay's own switch
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
  const h = noisy();
  h.tracker.pad(KEY, 120);
  h.tick(1679);
  assert.equal(h.raised.length, 0);
  h.tick(1680);
  assert.equal(h.raised.length, 1, "two minutes early, as asked");
  h.tick(1800);
  assert.equal(h.raised.length, 1, "the by-time is not a second announcement");
});

test("a padded warning doesn't claim the mob is up, because it isn't yet", () => {
  const h = noisy();
  h.tracker.pad(KEY, 120);
  h.tick(1680);
  assert.match(h.raised[0].message ?? "", /due soon/);
});

test("an unpadded pop keeps the plain banner, which words itself", () => {
  const h = noisy();
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

test("re-padding a mob you can see doesn't un-see it", () => {
  // Re-arming rebuilt the timer from the learned figures, which carry no sighting — so adjusting the
  // padding on a row reading ALIVE turned it back into a countdown about a mob in front of you.
  const h = timed();
  h.tick(1500);
  h.tracker.markUp(KEY);
  const seenAt = h.tracker.view().running[0].seenAt;
  h.tracker.pad(KEY, 120);
  const timer = h.tracker.view().running[0];
  assert.equal(timer.state, "alive", "an observation outranks the clock until the mob dies again");
  assert.equal(timer.seenAt, seenAt, "and it keeps its own moment");
  assert.equal(timer.lead, 120, "while the padding really was applied");
});

// ── notify, off until asked ────────────────────────────────────────────────────

test("a tracked named is silent until you ask it to speak", () => {
  const h = timed();
  h.tick(1800);
  assert.equal(h.raised.length, 0, "every named you kill is tracked; alerting for all of them is noise");
  assert.equal(h.tracker.view().running[0].state, "up", "the countdown still ran, it just didn't shout");
});

test("ticking notify makes the next pop speak", () => {
  const h = timed();
  h.tracker.notify(KEY, true);
  h.tick(1800);
  assert.equal(h.raised.length, 1);
});

test("notify is per mob, and survives a restart", () => {
  const dir = tempDir();
  const kills = [record(MOB, 0), record(MOB, 900)];
  const first = harness({ kills, dir });
  first.tracker.notify(KEY, true);
  first.tracker.flush();

  const second = harness({ kills, dir });
  assert.equal(second.tracker.view().known.find((k) => k.key === KEY)?.notify, true);
  second.tracker.noteKill(MOB, ZONE, iso(900), true);
  second.tick(1800);
  assert.equal(second.raised.length, 1);
});

test("un-ticking notify silences a countdown already running", () => {
  const h = timed();
  h.tracker.notify(KEY, true);
  h.tracker.notify(KEY, false);
  h.tick(1800);
  assert.equal(h.raised.length, 0);
});

// ── "I can see it" ─────────────────────────────────────────────────────────────
// Marking a mob up does two things, and the second is the valuable one: it ends the countdown, and
// it records the tightest bound the app can get — a kill gap includes the time you spent reaching
// and killing the mob, a sighting doesn't.

test("marking up ends the countdown and says so as a fact", () => {
  const h = timed();
  h.tick(1500);
  h.tracker.markUp(KEY);
  const timer = h.tracker.view().running[0];
  assert.equal(timer.state, "alive");
  assert.equal(timer.seenAt, iso(1500));
});

test("a sighting is evidence, and tightens the estimate below the kill gap", () => {
  const h = timed(); // killed at 900, learned 900s from the kill gap
  h.tick(1400); // seen up 500s after it died
  h.tracker.markUp(KEY);
  const known = h.tracker.view().known.find((k) => k.key === KEY);
  assert.equal(known?.respawn?.seconds, 500);
  assert.equal(known?.respawn?.source, "seen");
});

test("a sighting only ever tightens — seeing it late says nothing", () => {
  const h = timed();
  h.tick(1400);
  h.tracker.markUp(KEY); // 500s
  h.kills.push(record(MOB, 2000));
  h.tracker.noteKill(MOB, ZONE, iso(2000), true);
  h.tick(2800);
  h.tracker.markUp(KEY); // 800s — later, so no news
  assert.equal(h.tracker.view().known.find((k) => k.key === KEY)?.respawn?.seconds, 500);
});

test("an implausibly quick sighting is discarded, not believed", () => {
  const h = timed();
  h.tick(930); // 30s after it died — a misclick or a second mob, not a respawn
  h.tracker.markUp(KEY);
  const known = h.tracker.view().known.find((k) => k.key === KEY);
  assert.equal(known?.respawn?.seconds, 900, "the kill gap still stands");
  assert.equal(known?.respawn?.source, "killed");
});

test("alive outranks the clock in both directions", () => {
  const h = timed();
  h.tick(1000); // still waiting
  h.tracker.markUp(KEY);
  assert.equal(h.tracker.view().running[0].state, "alive", "up before the window: the mob doesn't care");
  // ...and it stays alive long past when a countdown would have gone stale, because it is up.
  h.tick(1800 + 60 * 60);
  assert.equal(h.tracker.view().running[0].state, "alive");
});

test("an alive mob never pops a banner about being due", () => {
  const h = timed();
  h.tracker.notify(KEY, true);
  h.tick(1500);
  h.tracker.markUp(KEY);
  h.tick(1800);
  assert.equal(h.raised.length, 0, "you're looking at it; a banner is nothing but noise");
});

test("killing it again clears ALIVE and starts a fresh countdown", () => {
  const h = timed();
  h.tick(1500);
  h.tracker.markUp(KEY);
  h.kills.push(record(MOB, 2000));
  h.tracker.noteKill(MOB, ZONE, iso(2000), true);
  const timer = h.tracker.view().running[0];
  assert.equal(timer.seenAt, undefined);
  assert.notEqual(timer.state, "alive");
});

test("a sighting survives a restart, because it's evidence and not a mood", () => {
  const dir = tempDir();
  const kills = [record(MOB, 0), record(MOB, 900)];
  const first = harness({ kills, dir });
  first.tracker.noteKill(MOB, ZONE, iso(900), true);
  first.tick(1400);
  first.tracker.markUp(KEY);
  first.tracker.flush();

  const second = harness({ kills, dir, startSec: 1500 });
  assert.equal(second.tracker.view().known.find((k) => k.key === KEY)?.respawn?.seconds, 500);
});

// ── timers added by hand ───────────────────────────────────────────────────────
// One mechanism for two asks: a mob you haven't killed twice yet, and a custom countdown for
// something that isn't a mob. A label no kill line matches simply never restarts itself.

test("a hand-added mob appears with nothing learned, waiting to be timed", () => {
  const h = harness();
  h.tracker.add(MOB, ZONE);
  const known = h.tracker.view().known;
  assert.equal(known.length, 1);
  assert.equal(known[0].mob, MOB);
  assert.equal(known[0].added, true);
  assert.equal(known[0].respawn, undefined, "added is not the same as timed");
});

test("a hand-added timer with an interval can be started at once", () => {
  const h = harness();
  const key = timerKey(MOB, ZONE);
  h.tracker.add(MOB, ZONE, 600);
  h.tick(100);
  h.tracker.markDead(key);
  const timer = h.tracker.view().running[0];
  assert.equal(timer.dueAt, iso(700));
  assert.equal(timer.source, "stated");
});

test("a custom timer needs no zone, and no kill will ever restart it", () => {
  const h = harness();
  h.tracker.add("Boat to Butcherblock", "", 420);
  const known = h.tracker.view().known[0];
  assert.equal(known.place, "");
  assert.equal(known.respawn?.seconds, 420);
  // Nothing in the log is called this, so it simply never re-arms itself — which is the correct
  // behaviour for a boat, reached without a single branch about what kind of thing it is.
  h.tracker.noteKill("Boat to Butcherblock", null, iso(10), true);
  assert.equal(h.tracker.view().running.length, 0);
});

test("killing a hand-added mob lets the log take over from what you typed", () => {
  const h = harness();
  const key = timerKey(MOB, ZONE);
  h.tracker.add(MOB, ZONE);
  // Adding it by hand is the claim that it's worth timing, so the kill log learns from it without
  // waiting on the article test.
  h.kills.push(record(MOB, 0, { named: false }), record(MOB, 900, { named: false }));
  h.tracker.noteKill(MOB, ZONE, iso(900), false);
  const known = h.tracker.view().known.find((k) => k.key === key);
  assert.equal(known?.respawn?.seconds, 900);
  assert.equal(known?.respawn?.source, "killed");
});

test("a hand-added row is one row, not two, once the log knows the mob as well", () => {
  const h = harness();
  h.tracker.add(MOB, ZONE);
  h.kills.push(record(MOB, 0), record(MOB, 900));
  h.tracker.noteKill(MOB, ZONE, iso(900), true);
  assert.equal(h.tracker.view().known.length, 1);
});

test("removing a hand-added timer takes everything set on it", () => {
  const h = harness();
  const key = timerKey(MOB, ZONE);
  h.tracker.add(MOB, ZONE, 600);
  h.tracker.pad(key, 60);
  h.tracker.notify(key, true);
  h.tracker.markDead(key);
  h.tracker.remove(key);
  assert.equal(h.tracker.view().known.length, 0);
  assert.equal(h.tracker.view().running.length, 0);
  // Re-adding starts clean rather than inheriting what the old row was carrying.
  h.tracker.add(MOB, ZONE);
  const known = h.tracker.view().known[0];
  assert.equal(known.respawn, undefined);
  assert.equal(known.lead, undefined);
  assert.equal(known.notify, false);
});

test("a hand-added timer survives a restart", () => {
  const dir = tempDir();
  const first = harness({ dir });
  first.tracker.add("Boat to Butcherblock", "", 420);
  first.tracker.flush();
  const second = harness({ dir });
  assert.equal(second.tracker.view().known[0].mob, "Boat to Butcherblock");
  assert.equal(second.tracker.view().known[0].respawn?.seconds, 420);
});

test("a blank name adds nothing", () => {
  const h = harness();
  assert.equal(h.tracker.add("   ", ZONE), null);
  assert.equal(h.tracker.view().known.length, 0);
});

test("a row the kill log produced offers no remove, since it would come straight back", () => {
  const h = timed();
  assert.equal(h.tracker.view().known[0].added, false);
});

// ── the look a pop wears, and the countdown you keep on screen ─────────────────

test("a pop wears the shipped Spawn look until a timer is given a style of its own", () => {
  const h = noisy();
  h.tick(1800);
  // Not the alert defaults' red: a pop is news, and arriving dressed as "dispel now" is exactly
  // what the built-in exists to prevent.
  assert.equal(h.raised[0].style?.color, "#46c86b");
  assert.equal(h.raised[0].style?.position, "top-right");
});

test("a timer whose built-in look has been deleted still gets a banner", () => {
  const kills = [record(MOB, 0), record(MOB, 900)];
  const bare = { enabled: true, color: "#e5534b", position: "top", styles: [] } as unknown as CastAlertSettings;
  const h = harness({ kills, settings: bare });
  h.tracker.noteKill(MOB, ZONE, iso(900), true);
  h.tracker.notify(KEY, true);
  h.tick(1800);
  assert.equal(h.raised.length, 1, "an alert that can't be styled must still be seen");
  assert.equal(h.raised[0].style?.color, "#e5534b");
});

test("a timer can wear a saved style, and its pop arrives already wearing it", () => {
  const h = noisy();
  h.tracker.style(KEY, "loud");
  h.tick(1800);
  // Resolved in main and sent *with* the alert: the overlay only knows the defaults, so a per-timer
  // look could reach the screen no other way.
  assert.equal(h.raised[0].style?.color, "#00ff00");
  assert.equal(h.raised[0].style?.position, "center");
});

test("a style that no longer exists falls back to the defaults rather than losing the alert", () => {
  const h = noisy();
  h.tracker.style(KEY, "deleted-style");
  h.tick(1800);
  assert.equal(h.raised.length, 1, "an alert that can't be styled must still be seen");
  assert.equal(h.raised[0].style?.color, "#e5534b");
});

test("clearing a style goes back to the defaults", () => {
  const h = timed();
  h.tracker.style(KEY, "loud");
  assert.equal(h.tracker.view().known[0].styleId, "loud");
  h.tracker.style(KEY, null);
  assert.equal(h.tracker.view().known[0].styleId, undefined);
});

test("a pinned countdown carries its style id, so the overlay can place it where its banner goes", () => {
  const h = timed();
  h.tracker.showOnScreen(KEY, true);
  h.tracker.style(KEY, "loud");
  // The **id**, not a resolved look: a banner is frozen when it fires, but a pinned countdown is a
  // live readout, so restyling one has to be able to move it while it runs.
  assert.equal(h.tracker.view().running[0].styleId, "loud");
  h.tracker.style(KEY, null);
  assert.equal(h.tracker.view().running[0].styleId, undefined, "and back to the defaults' position");
});

test("a countdown is kept on screen only when asked, and the running timer carries the answer", () => {
  const h = timed();
  assert.equal(h.tracker.view().running[0].onScreen, false, "a wall of every named you passed is not a HUD");
  h.tracker.showOnScreen(KEY, true);
  assert.equal(h.tracker.view().running[0].onScreen, true);
  assert.equal(h.tracker.view().known[0].onScreen, true);
});

test("on screen and notify are independent — a camper often wants the clock and no banner", () => {
  const h = timed();
  h.tracker.showOnScreen(KEY, true);
  h.tick(1800);
  assert.equal(h.raised.length, 0, "pinned, and still silent");
});

test("style and on-screen survive a restart, and go when a hand-added row does", () => {
  const dir = tempDir();
  const kills = [record(MOB, 0), record(MOB, 900)];
  const first = harness({ kills, dir });
  first.tracker.style(KEY, "loud");
  first.tracker.showOnScreen(KEY, true);
  first.tracker.flush();

  const second = harness({ kills, dir });
  const row = second.tracker.view().known.find((k) => k.key === KEY);
  assert.equal(row?.styleId, "loud");
  assert.equal(row?.onScreen, true);

  // ...and a hand-added row takes both with it, so a re-add starts clean.
  const custom = second.tracker.add("Boat", "", 600)!;
  second.tracker.style(custom, "loud");
  second.tracker.showOnScreen(custom, true);
  second.tracker.remove(custom);
  second.tracker.add("Boat", "", 600);
  const fresh = second.tracker.view().known.find((k) => k.mob === "Boat");
  assert.equal(fresh?.styleId, undefined);
  assert.equal(fresh?.onScreen, false);
});

// ── disagreeing with the clock ─────────────────────────────────────────────────
// "It is not up" is the one lower bound the app has, and the one only a player can give: nothing in
// the log records standing at a camp and finding nothing there.

test("saying it is not up yet records a floor that ratchets upward", () => {
  const h = timed(); // killed at 900, 900s learned
  h.tick(1500);
  h.tracker.markNotUp(KEY); // 600s and still down
  assert.equal(h.tracker.view().known[0].floor?.seconds, 600);
  h.tick(1400);
  h.tracker.markNotUp(KEY); // 500s — earlier, so it proves less
  assert.equal(h.tracker.view().known[0].floor?.seconds, 600, "a lower bound only ever rises");
  assert.equal(h.tracker.view().known[0].floor?.count, 2);
});

test("a floor holds the window shut until it, whatever padding says", () => {
  const h = timed();
  h.tracker.pad(KEY, 600); // watch from 10m before the by-time...
  assert.equal(h.tracker.view().running[0].watchFrom, iso(1200));
  h.tick(1500);
  h.tracker.markNotUp(KEY); // ...but you have proof it was still down at 600s
  h.tracker.markDead(KEY);
  const timer = h.tracker.view().running[0];
  assert.equal(timer.dueAt, iso(2400), "the by-time is untouched — this is not an upper bound");
  assert.equal(timer.watchFrom, iso(2100), "and the window can't open before the floor");
});

test("a floor past the estimate is reported as a contradiction, not quietly resolved", () => {
  const h = timed();
  h.tick(1400);
  h.tracker.markUp(KEY); // a 500s sighting — the estimate is now 500s
  h.kills.push(record(MOB, 2000));
  h.tracker.noteKill(MOB, ZONE, iso(2000), true);
  h.tick(2900);
  h.tracker.markNotUp(KEY); // but here it is, provably still down at 900s

  const respawn = h.tracker.view().known[0].respawn!;
  assert.equal(respawn.seconds, 500);
  assert.equal(respawn.floorSeconds, 900);
  // One of them is wrong and the app does not get to pick: which it is depends on an evening it
  // did not attend.
  assert.ok(contradicted(respawn));
  assert.match(respawnCaveat(respawn) ?? "", /one of them is wrong/i);
});

test("saying it is not up undoes a mis-clicked 'it's up'", () => {
  const h = timed();
  h.tick(1500);
  h.tracker.markUp(KEY);
  assert.equal(h.tracker.view().running[0].state, "alive");
  h.tick(1560);
  h.tracker.markNotUp(KEY);
  assert.notEqual(h.tracker.view().running[0].state, "alive", "it cannot be alive and not up at once");
});

test("an implausible 'not up' is discarded like any other observation", () => {
  const h = timed();
  h.tick(930); // 30s after it died — of course it is not up; that proves nothing
  h.tracker.markNotUp(KEY);
  assert.equal(h.tracker.view().known[0].floor, undefined);
});

test("a floor can be dropped on its own, and relearning takes it with the rest", () => {
  const h = timed();
  h.tick(1500);
  h.tracker.markNotUp(KEY);
  h.tracker.forgetFloor(KEY);
  assert.equal(h.tracker.view().known[0].floor, undefined);

  h.tick(1600);
  h.tracker.markNotUp(KEY);
  h.tracker.relearn(KEY);
  assert.equal(h.tracker.view().known[0].floor, undefined, "a floor is a measurement like any other");
});

test("a floor survives a restart", () => {
  const dir = tempDir();
  const kills = [record(MOB, 0), record(MOB, 900)];
  const first = harness({ kills, dir });
  first.tracker.noteKill(MOB, ZONE, iso(900), true);
  first.tick(1500);
  first.tracker.markNotUp(KEY);
  first.tracker.flush();
  const second = harness({ kills, dir, startSec: 1500 });
  assert.equal(second.tracker.view().known[0].floor?.seconds, 600);
});

// ── "it's dead now" ────────────────────────────────────────────────────────────
// The hand-operated twin of a kill line: the app wasn't watching, or you've walked up to a camp
// someone else was holding. It seeds a countdown and teaches the estimate nothing.

test("saying it's dead starts a countdown from now", () => {
  const h = timed();
  h.tick(5000);
  h.tracker.markDead(KEY);
  const timer = h.tracker.view().running[0];
  assert.equal(timer.killedAt, iso(5000));
  assert.equal(timer.dueAt, iso(5900), "one learned interval on from the moment you said so");
});

test("saying it's dead again restarts the clock rather than adding a second", () => {
  const h = timed();
  h.tick(5000);
  h.tracker.markDead(KEY);
  h.tick(6000);
  h.tracker.markDead(KEY);
  const running = h.tracker.view().running;
  assert.equal(running.length, 1);
  assert.equal(running[0].dueAt, iso(6900));
});

test("saying it's dead is the undo for a mis-clicked 'it's up'", () => {
  const h = timed();
  h.tick(1500);
  h.tracker.markUp(KEY);
  assert.equal(h.tracker.view().running[0].state, "alive");
  h.tick(1600);
  h.tracker.markDead(KEY);
  const timer = h.tracker.view().running[0];
  assert.equal(timer.seenAt, undefined);
  assert.notEqual(timer.state, "alive");
});

test("saying it's dead teaches the estimate nothing — one death measures no respawn", () => {
  const h = timed();
  h.tick(5000);
  h.tracker.markDead(KEY);
  const known = h.tracker.view().known.find((k) => k.key === KEY);
  assert.equal(known?.respawn?.seconds, 900, "still the kill gap, untouched");
  assert.equal(known?.respawn?.samples, 1);
});

test("with nothing to count down to, saying it's dead starts no blank clock", () => {
  const kills = [record(MOB, 0)]; // one kill: no interval learned
  const h = harness({ kills });
  h.tracker.markDead(timerKey(MOB, ZONE));
  assert.equal(h.tracker.view().running.length, 0);
});

test("a typed figure is enough to start one by hand", () => {
  const kills = [record(MOB, 0)];
  const h = harness({ kills });
  const key = timerKey(MOB, ZONE);
  h.tracker.state(key, 600);
  h.tick(1000);
  h.tracker.markDead(key);
  assert.equal(h.tracker.view().running[0].dueAt, iso(1600));
});

// ── the difficulty changing ────────────────────────────────────────────────────

test("changing difficulty drops the countdowns for that place — everything repopped", () => {
  const h = timed();
  assert.equal(h.tracker.view().running.length, 1);
  h.tracker.noteZone(ZONE);
  h.tracker.noteZone("Lower Guk 2");
  assert.equal(h.tracker.view().running.length, 0, "it was counting from a death the world has undone");
});

test("ordinary travel leaves a camp's countdown alone", () => {
  const h = timed();
  h.tracker.noteZone(ZONE);
  h.tracker.noteZone("Upper Guk");
  h.tracker.noteZone(ZONE);
  // A mob keeps respawning while you are elsewhere, so going away and coming back must not be
  // mistaken for the difficulty changing under you.
  assert.equal(h.tracker.view().running.length, 1);
});

test("a difficulty change elsewhere leaves this camp alone", () => {
  const h = timed();
  h.tracker.noteZone("Befallen");
  h.tracker.noteZone("Befallen 2");
  assert.equal(h.tracker.view().running.length, 1);
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
  assert.equal(known?.respawn?.source, "killed");
});

test("a typed figure can be typed again, and again — it is never a one-way door", () => {
  const h = timed();
  const stated = () => h.tracker.view().known.find((k) => k.key === KEY)?.stated;
  h.tracker.state(KEY, 1200);
  assert.equal(stated(), 1200);
  h.tracker.state(KEY, 1500); // change your mind
  assert.equal(stated(), 1500);
  h.tracker.state(KEY, null); // and take it back entirely
  assert.equal(stated(), undefined);
  h.tracker.state(KEY, 900); // and set it once more
  assert.equal(stated(), 900);
});

test("padding is the same round trip", () => {
  const h = timed();
  const lead = () => h.tracker.view().known.find((k) => k.key === KEY)?.lead;
  h.tracker.pad(KEY, 120);
  assert.equal(lead(), 120);
  h.tracker.pad(KEY, null);
  assert.equal(lead(), undefined);
  assert.equal(h.tracker.view().running[0].lead, 0);
});

test("a nonsense stated interval is refused rather than making a mob permanently due", () => {
  const h = timed();
  h.tracker.state(KEY, 0);
  assert.equal(h.tracker.view().known.find((k) => k.key === KEY)?.respawn?.source, "killed");
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

test("a dismissed mob stays listed, so the button isn't a one-way door", () => {
  const h = timed();
  h.tracker.markNamed(MOB, false);
  // The row is gone, and with it the only control that could undo this — unless it's listed.
  assert.deepEqual(h.tracker.view().dismissed, [MOB]);
});

test("tracking a dismissed mob again brings its whole history back", () => {
  const h = timed();
  h.tracker.markNamed(MOB, false);
  h.tracker.markNamed(MOB, true);
  const known = h.tracker.view().known.find((k) => k.key === KEY);
  assert.equal(h.tracker.view().dismissed.length, 0);
  assert.equal(known?.respawn?.seconds, 900, "the gaps were never in the dismissal to lose");
});

test("a dismissal survives a restart, and so does the way out of it", () => {
  const dir = tempDir();
  const kills = [record(MOB, 0), record(MOB, 900)];
  const first = harness({ kills, dir });
  first.tracker.markNamed(MOB, false);
  first.tracker.flush();

  const second = harness({ kills, dir });
  assert.deepEqual(second.tracker.view().dismissed, [MOB]);
  second.tracker.markNamed(MOB, true);
  assert.equal(second.tracker.view().known.length, 1);
});

test("relearning forgets the sightings too, or the figure does not go back to unknown", () => {
  const h = timed();
  h.tick(1400);
  h.tracker.markUp(KEY); // a 500s sighting, tighter than the 900s kill gap
  assert.equal(h.tracker.view().known[0].respawn?.seconds, 500);

  h.tracker.relearn(KEY);
  const known = h.tracker.view().known.find((k) => k.key === KEY);
  // A cutoff over the kill log left sightings untouched, so a mis-clicked one was permanent — the
  // panel promised "back to unknown" and delivered the bad sighting instead.
  assert.equal(known?.respawn, undefined);
  assert.equal(known?.seen, undefined);
});

test("one bad gap can be thrown out, and put back, without touching the rest", () => {
  const kills = [record(MOB, 0), record(MOB, 1200), record(MOB, 1500)];
  const h = harness({ kills });
  h.tracker.noteKill(MOB, ZONE, iso(1500), true);
  const row = () => h.tracker.view().known.find((k) => k.key === KEY)!;
  assert.equal(row().respawn?.seconds, 300, "the 300s pull is setting the figure");

  const bad = row().gaps[0].id;
  h.tracker.setGapDropped(KEY, bad, true);
  assert.equal(row().respawn?.seconds, 1200, "and the camp's other history survives it");
  assert.equal(row().gaps.find((g) => g.id === bad)?.dropped, true);

  h.tracker.setGapDropped(KEY, bad, false);
  assert.equal(row().respawn?.seconds, 300);
});

test("a dropped gap survives a restart, or the figure would quietly come back wrong", () => {
  const dir = tempDir();
  const kills = [record(MOB, 0), record(MOB, 1200), record(MOB, 1500)];
  const first = harness({ kills, dir });
  first.tracker.noteKill(MOB, ZONE, iso(1500), true);
  first.tracker.setGapDropped(KEY, first.tracker.view().known[0].gaps[0].id, true);
  first.tracker.flush();

  const second = harness({ kills, dir });
  assert.equal(second.tracker.view().known[0].respawn?.seconds, 1200);
});

test("relearning supersedes the per-gap exclusions rather than keeping them", () => {
  const kills = [record(MOB, 0), record(MOB, 1200), record(MOB, 1500)];
  const h = harness({ kills });
  h.tracker.noteKill(MOB, ZONE, iso(1500), true);
  h.tracker.setGapDropped(KEY, h.tracker.view().known[0].gaps[0].id, true);
  h.tick(2000);
  h.tracker.relearn(KEY);
  // The cutoff already excludes everything measured; a leftover exclusion could only re-exclude a
  // gap measured *after* the reset, which nobody asked for.
  assert.equal(h.tracker.view().known[0].gaps.length, 0);
});

test("a stray sighting can be dropped on its own, keeping what the kills taught", () => {
  const h = timed();
  h.tick(1000);
  h.tracker.markUp(KEY); // 100s... below the floor, so try a plausible-but-wrong one
  h.kills.push(record(MOB, 2000));
  h.tracker.noteKill(MOB, ZONE, iso(2000), true);
  h.tick(2200);
  h.tracker.markUp(KEY); // 200s — plausible, and wrong, and permanent until now
  assert.equal(h.tracker.view().known[0].respawn?.source, "seen");

  h.tracker.forgetSightings(KEY);
  const known = h.tracker.view().known.find((k) => k.key === KEY);
  assert.equal(known?.seen, undefined);
  assert.equal(known?.respawn?.seconds, 900, "the kill gaps are still there");
  assert.equal(known?.respawn?.source, "killed");
});

test("the evidence behind a figure is reported, not just the answer", () => {
  const h = timed();
  h.tick(1400);
  h.tracker.markUp(KEY);
  h.tracker.state(KEY, 1200);
  const known = h.tracker.view().known.find((k) => k.key === KEY);
  // All three, so a reader can tell *which* one has gone wonky rather than only that something has.
  assert.equal(known?.shortestSeconds, 900);
  assert.equal(known?.seen?.seconds, 500);
  assert.equal(known?.stated, 1200);
  assert.equal(known?.respawn?.source, "stated", "and which of them is actually in force");
});

test("relearning keeps the figure you typed — it forgets measurements, not decisions", () => {
  const h = timed();
  h.tracker.state(KEY, 1200);
  h.tracker.relearn(KEY);
  assert.equal(h.tracker.view().known[0].stated, 1200);
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
