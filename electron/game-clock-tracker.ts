/**
 * game-clock-tracker.ts — the running Norrath clock, and the alarms set against it.
 *
 * `/time` only ever states an hour, once, so this holds just the last reading (an `hour` and the real
 * moment it was said) and extrapolates the rest — the same idea as `log-clock.ts` extrapolating real
 * time from a log's own line stamps, and for the same reason a stale reading matters: a `/time` line
 * replayed out of a catch-up gap is *state*, not *news* (ADR 0043), so it sets the clock rather than
 * being announced, and a restart never re-fires an alarm the game day already carried past while the
 * app was shut.
 *
 * The **pace** it extrapolates at is learned, not fixed: every reading after the first nudges it
 * toward whatever this server's `/time` responses actually imply, live, off the gap between that
 * reading and the one before it (`learnRate`, [ADR 0188](../specs/decisions/0188-the-clocks-pace-calibrates-itself.md)).
 * It starts at the documented 20:1 pace and is persisted once learned, so a fan server running its
 * own speed converges on it over a session or two instead of staying wrong for good.
 *
 * Alarms are the one thing here that isn't derived: "tell me at 8 PM" outlives any single reading and
 * has to be persisted, the same way a spawn timer's due time is. A pop goes down the same `raise` path
 * as every other alert (`spawn-tracker.ts`'s "the two meet at raise"), wearing the alert defaults
 * rather than a notification system of its own.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createLogger } from "../src/shared/logging";
import { alertStyle } from "../src/shared/alert-styles";
import {
  crossedMinute,
  currentGameMinutes,
  DEFAULT_RATE,
  formatGameClock,
  isDaytime,
  learnRate,
  minuteDelta,
  type GameClockAnchor,
} from "../src/shared/game-clock";
import type { CastAlertEvent, CastAlertSettings, GameClockView, GameTimeAlarm } from "../src/shared/types";
import { createSaver, readJson } from "./json-store";

const log = createLogger("game-clock-tracker");

/** A game minute is 3 real seconds; a second's granularity is finer than anything that matters. */
const SWEEP_MS = 1000;
const WRITE_DEBOUNCE_MS = 2000;

interface Stored {
  anchor: GameClockAnchor | null;
  alarms: GameTimeAlarm[];
  /** Game-minutes per real ms, as learned so far (`learnRate`). Absent on disk predates it. */
  rate: number;
}

function load(file: string): Stored {
  const stored = readJson<Partial<Stored>>(file, {});
  return { anchor: stored.anchor ?? null, alarms: stored.alarms ?? [], rate: stored.rate ?? DEFAULT_RATE };
}

export interface GameClockTrackerDeps {
  userDataDir: string;
  /** Current alert settings, so a pop wears whatever the alerts wear and respects the on/off switch. */
  getSettings: () => CastAlertSettings;
  /** Put a banner on the overlay, the same way every other alert reaches it. */
  raise: (alert: CastAlertEvent) => void;
  /** Injectable, so a test doesn't wait on a real clock. */
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export interface GameClockTracker {
  /** A `/time` response arrived (live, or recovered from a catch-up tail) — the hour, and when. */
  noteReading(hour: number, atMs: number): void;
  /**
   * A peer's `/time` reading arrived — applied only if it's newer than what we already have, the
   * same "freshest wins" rule ADR 0164 uses for a mirrored wiki page
   * ([ADR 0189](../specs/decisions/0189-the-clock-reading-is-shared-like-a-mirrored-page.md)). Unlike
   * `noteReading`, which is always our own eyes and always wins, a peer's message could be stale by
   * the time it lands — a slow relay, a peer who has been quiet a while and just reconnected.
   */
  notePeerReading(hour: number, atMs: number): void;
  /**
   * The raw reading behind the current clock — the hour `/time` last stated, and when — for handing
   * to peers. `null` before this run has read one, the same as `view().minutes`.
   */
  reading(): { hour: number; at: string } | null;
  /** Everything the widget and the alarm list show. */
  view(): GameClockView;
  /** Set an alarm for this time of day. Returns its id. */
  add(minute: number, message?: string): string;
  /** Change what an alarm fires at and/or what it says — same alarm, same id. */
  update(id: string, minute: number, message?: string): void;
  remove(id: string): void;
  toggle(id: string, enabled: boolean): void;
  /** Fires whenever the clock is read afresh or an alarm changes. */
  onChanged(cb: () => void): void;
  flush(): void;
  dispose(): void;
}

export function createGameClockTracker({
  userDataDir,
  getSettings,
  raise,
  now = Date.now,
  setInterval: setEvery = (fn, ms) => {
    const t = setInterval(fn, ms);
    // A tick must never be the reason the process is still up after a quit.
    t.unref?.();
    return t;
  },
  clearInterval: clearEvery = (h) => clearInterval(h as NodeJS.Timeout),
}: GameClockTrackerDeps): GameClockTracker {
  const file = path.join(userDataDir, "game-clock.json");
  const state = load(file);
  const saver = createSaver(file, "game clock", () => state, WRITE_DEBOUNCE_MS);
  let listener: (() => void) | null = null;

  const changed = () => {
    saver.save();
    listener?.();
  };

  /**
   * Where the clock stood at the last sweep, so a *crossing* fires an alarm rather than a *level* —
   * otherwise an alarm at 8 PM would fire every second from 8:00 to 8:01. Null until there is a
   * reading to compare against, which is also what keeps a freshly restored alarm from firing about
   * whatever the clock passed through while the app was shut (ADR 0092's rule, applied here).
   */
  let lastMinutes = state.anchor ? currentGameMinutes(state.anchor, now(), state.rate) : null;

  function fire(alarm: GameTimeAlarm): void {
    const settings = getSettings();
    if (!settings.enabled) return;
    raise({
      caster: "",
      spell: "",
      at: new Date(now()).toISOString(),
      event: "timer",
      message: alarm.message?.trim() || `It's ${formatGameClock(alarm.minute)} in Norrath`,
      style: alertStyle(settings),
    });
    log.debug("game-time alarm fired", { minute: alarm.minute, message: alarm.message });
  }

  function sweep(): void {
    if (!state.anchor) return;
    const cur = currentGameMinutes(state.anchor, now(), state.rate);
    const prev = lastMinutes;
    lastMinutes = cur;
    if (prev === null) return; // nothing to compare against yet — never alert about the past
    for (const alarm of state.alarms) {
      if (alarm.enabled && crossedMinute(prev, cur, alarm.minute)) fire(alarm);
    }
  }

  const handle = setEvery(sweep, SWEEP_MS);

  /**
   * The one place a reading — ours or a peer's — actually lands. What we'd have *guessed* the clock
   * said at this exact moment, from the reading before this one, is compared against what this
   * reading says, so the pace can be checked against a real evening instead of trusted on paper —
   * and now also **fed back in**: the same gap is what `learnRate` uses to nudge the learned pace
   * toward this server's real one (ADR 0188). Only worth doing with a reading already in hand — the
   * very first reading of a run has nothing to compare against or learn from.
   */
  function applyReading(hour: number, atMs: number): void {
    if (state.anchor) {
      const guessed = currentGameMinutes(state.anchor, atMs, state.rate);
      const reported = hour * 60;
      const before = state.rate;
      state.rate = learnRate(state.rate, state.anchor.hour, hour, atMs - state.anchor.sampledAtMs);
      log.debug("game time check — our running guess vs. what /time just said", {
        guessed: formatGameClock(guessed),
        reported: formatGameClock(reported),
        offByGameMinutes: minuteDelta(guessed, reported),
        // In game-minutes per real-minute, the units the ADRs and the docs both talk in — easier to
        // eyeball against "20" than the per-ms figure the math actually runs on.
        learnedRatePerMinute: state.rate === before ? undefined : { from: before * 60_000, to: state.rate * 60_000 },
      });
    }
    state.anchor = { hour, sampledAtMs: atMs };
    // A fresh reading is where comparison starts again — the reading itself is never "crossed".
    lastMinutes = currentGameMinutes(state.anchor, now(), state.rate);
    log.debug("game time read", { hour, at: new Date(atMs).toISOString(), ratePerMinute: state.rate * 60_000 });
    changed();
  }

  return {
    noteReading(hour, atMs) {
      applyReading(hour, atMs);
    },

    notePeerReading(hour, atMs) {
      // Not newer than what we already have — a slow relay, or a peer whose own anchor is stale —
      // so there is nothing here that improves on what we already know (ADR 0189, mirroring ADR
      // 0164's rule for a wiki page). Equal counts as "not newer": nothing is gained by re-applying
      // the same instant, and it would cost a pointless `learnRate` call against a zero gap.
      if (state.anchor && atMs <= state.anchor.sampledAtMs) {
        log.debug("peer game time ignored - not newer than what we have", {
          hour,
          at: new Date(atMs).toISOString(),
        });
        return;
      }
      applyReading(hour, atMs);
    },

    reading() {
      return state.anchor ? { hour: state.anchor.hour, at: new Date(state.anchor.sampledAtMs).toISOString() } : null;
    },

    view() {
      const minutes = state.anchor ? currentGameMinutes(state.anchor, now(), state.rate) : null;
      return {
        minutes,
        daytime: minutes === null ? null : isDaytime(minutes),
        now: new Date(now()).toISOString(),
        rate: state.rate,
        alarms: [...state.alarms].sort((a, b) => a.minute - b.minute),
      };
    },

    add(minute, message) {
      const alarm: GameTimeAlarm = { id: randomUUID(), enabled: true, minute, message: message?.trim() || undefined };
      state.alarms = [...state.alarms, alarm];
      log.debug("game-time alarm added", { minute, message });
      changed();
      return alarm.id;
    },

    update(id, minute, message) {
      state.alarms = state.alarms.map((a) => (a.id === id ? { ...a, minute, message: message?.trim() || undefined } : a));
      changed();
    },

    remove(id) {
      state.alarms = state.alarms.filter((a) => a.id !== id);
      changed();
    },

    toggle(id, enabled) {
      state.alarms = state.alarms.map((a) => (a.id === id ? { ...a, enabled } : a));
      changed();
    },

    onChanged(cb) {
      listener = cb;
    },

    flush: () => saver.flush(),
    dispose: () => clearEvery(handle),
  };
}
