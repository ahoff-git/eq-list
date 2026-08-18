/**
 * spawn-tracker.ts — the running countdowns: what's due, when, and saying so as it happens.
 *
 * The rules are all next door in [spawn-timers.ts](../src/shared/spawn-timers.ts), pure and tested;
 * this is the holder that carries them out and the only state involved — the player's own figures,
 * which mobs they've corrected us about, and the due times themselves.
 *
 * **Why this isn't `alert-queue.ts`.** That one holds a *thing the app means to say*: in memory, on
 * an unref'd timeout, capped at thirty minutes, and quite right to be
 * ([ADR 0082](../specs/decisions/0082-an-alert-can-be-scheduled.md)). This holds a *fact about the
 * world* — that a mob is due back at a particular moment — which is why it is persisted, uncapped,
 * and survives the app being closed for the whole respawn. The two meet at `raise`: a pop is an
 * ordinary alert, wearing the ordinary alert styling, rather than a second notification system
 * ([ADR 0092](../specs/decisions/0092-a-named-s-respawn-is-learned-from-your-own-kills.md)).
 *
 * The one thing this refuses to do is alert about the past. A timer found already overdue at
 * startup is *shown* as due and never fired: a banner about something that happened three hours ago
 * is the exact opposite of what an overlay is for.
 */
import path from "node:path";
import { createLogger } from "../src/shared/logging";
import { alertStyle } from "../src/shared/alert-styles";
import { mobKey } from "../src/shared/mob-stats";
import { placeName } from "../src/shared/zones/place";
import {
  learnRespawns,
  provenNamed,
  respawnFor,
  sightingFrom,
  spawnState,
  tightenSighting,
  timerFrom,
  timerKey,
  type RespawnLearning,
  type Sighting,
  type SpawnTimer,
} from "../src/shared/spawn-timers";
import type { CastAlertEvent, CastAlertSettings, KillRecord, SpawnView } from "../src/shared/types";
import { createSaver, readJson } from "./json-store";

const log = createLogger("spawn-tracker");

/** Edits arrive one keystroke at a time; a due time arrives once. Coalesce either way. */
const WRITE_DEBOUNCE_MS = 2000;

/**
 * How often the due list is swept. A respawn is minutes to hours, so a second's granularity is far
 * finer than the thing being measured — and the sweep is a walk over a handful of timers, not work.
 * It is a *sweep* rather than a timeout per timer because the alternative re-arms every timer on
 * every kill, and a timer that fires while the app was asleep has to be judged, not obeyed.
 */
const SWEEP_MS = 1000;

/** What's on disk. Deliberately small: everything else is re-derived from the kill log. */
interface Stored {
  /** Timer key → the interval the player typed, in seconds. Nothing observed may overwrite one. */
  stated: Record<string, number>;
  /**
   * Mob key → whether the player says it's a named, overriding the log's article. Both answers are
   * worth storing: "yes" rescues a named the log wrote with an article, "no" silences a pet or a
   * player's corpse that the article test read as one.
   *
   * The spelling is kept beside the answer because a "no" **takes the mob off the list**, and a
   * dismissal you can't see is a dismissal you can't undo — the row carrying the only control that
   * could reverse it is the row that just disappeared. Storing the name is what lets the panel go
   * on offering it back.
   */
  said: Record<string, { named: boolean; mob: string }>;
  /** Timer key → ISO moment to learn afresh from, for a figure the player threw away. */
  relearned: Record<string, string>;
  /**
   * Timer key → how many seconds early to start watching. The player's own allowance for
   * everything the log can't measure — a placeholder cycle, a mob that walks, wanting to be in
   * position before it matters — which is why it is per mob and never inferred (ADR 0094).
   */
  lead: Record<string, number>;
  /**
   * Timer key → whether a pop should raise a banner. **Off by default**: every named you kill is
   * tracked automatically, so alerting for all of them would mean a dozen banners an evening for
   * mobs you aren't camping. The countdown still runs and still shows — silence is the difference
   * between a list and an interruption.
   */
  notify: Record<string, boolean>;
  /**
   * Timer key → the tightest death-to-sighting gap and how many sightings it rests on. Stored
   * rather than derived, because unlike a kill gap there is nothing in the log to re-derive it
   * from: "I can see it" is an observation the player makes and only this file records.
   */
  seen: Record<string, Sighting>;
  /** The countdowns themselves — the only thing here that isn't a preference. */
  timers: SpawnTimer[];
}

/**
 * Read what's on disk into a state of our own, field by field.
 *
 * Not `readJson(file, EMPTY)` with a shared default: a missing file hands back *that very object*,
 * and a shallow spread of it keeps its nested maps by reference — so the first edit writes into the
 * default itself. It also can't be trusted to be whole, since a file written by an older build has
 * whichever keys that build knew about, and a missing `timers` would be a crash rather than a
 * blank. Naming each field answers both at once.
 */
function load(file: string): Stored {
  const stored = readJson<Partial<Stored>>(file, {});
  return {
    stated: { ...stored.stated },
    said: { ...stored.said },
    relearned: { ...stored.relearned },
    lead: { ...stored.lead },
    notify: { ...stored.notify },
    seen: { ...stored.seen },
    timers: [...(stored.timers ?? [])],
  };
}

export interface SpawnTrackerDeps {
  userDataDir: string;
  /** The kill log, read on demand — the learned figures are derived, never a second copy. */
  kills: () => KillRecord[];
  /** Current alert settings, so a pop wears whatever the alerts wear. */
  getSettings: () => CastAlertSettings;
  /** Put a banner on the overlay, the same way every other alert reaches it. */
  raise: (alert: CastAlertEvent) => void;
  /** Injectable, so a test of a six-hour timer takes a millisecond. */
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export interface SpawnTracker {
  /** A kill landed: start or restart its countdown, if it's a named whose respawn we know. */
  noteKill(mob: string, zone: string | null, at: string, named?: boolean): void;
  /** Everything the panel shows — running countdowns, and what we know about each named. */
  view(): SpawnView;
  /** The player's own figure for a mob, or `null` to go back to what was learned. */
  state(key: string, seconds: number | null): void;
  /**
   * How early to start watching this one, in seconds — `null` for none. Re-arms a countdown
   * already running, since padding you set while waiting is padding you meant for *this* pop.
   */
  pad(key: string, seconds: number | null): void;
  /**
   * You can see it: the mob is up **now**. Two things at once, and both matter — the countdown is
   * over (the row reads ALIVE rather than a guess), and the gap since it died is recorded as the
   * tightest kind of evidence there is, since unlike a kill gap it excludes the time you'd spend
   * getting to it and killing it.
   */
  markUp(key: string): void;
  /**
   * It's dead **now** — start the countdown from this moment, or restart one already running.
   *
   * The hand-operated twin of a kill line, for the times the log can't help: the app wasn't running
   * when you killed it, you're picking up someone else's camp, or a pull went unlogged. It seeds a
   * countdown and nothing more — one death is not a measurement of a respawn, so it teaches the
   * estimate nothing and never touches the kill log, which is the log's own record.
   */
  markDead(key: string): void;
  /** Whether a pop should raise a banner. Off by default — see `Stored.notify`. */
  notify(key: string, on: boolean): void;
  /** Correct the article test about a mob. */
  markNamed(mob: string, named: boolean): void;
  /** Throw away what was learned about one timer and start learning again from now. */
  relearn(key: string): void;
  /** Drop a running countdown without forgetting anything. */
  stop(key: string): void;
  /** Fires whenever the list changes, so an open window doesn't have to poll. */
  onChanged(cb: () => void): void;
  flush(): void;
  /** Stop sweeping — the app is quitting. */
  dispose(): void;
}

export function createSpawnTracker({
  userDataDir,
  kills,
  getSettings,
  raise,
  now = Date.now,
  setInterval: setEvery = (fn, ms) => {
    const t = setInterval(fn, ms);
    // A countdown must never be the reason the process is still up after a quit.
    t.unref?.();
    return t;
  },
  clearInterval: clearEvery = (h) => clearInterval(h as NodeJS.Timeout),
}: SpawnTrackerDeps): SpawnTracker {
  const file = path.join(userDataDir, "spawn-timers.json");
  const state = load(file);
  const saver = createSaver(file, "spawn timers", () => state, WRITE_DEBOUNCE_MS, { concern: "spawn-timers" });
  let listener: (() => void) | null = null;

  /**
   * Timers already fired, so a sweep says a pop once. Held in memory rather than on disk on
   * purpose: what's persisted is *when the mob is due*, and whether we happened to have said so
   * yet is about this session. A restart mid-window therefore re-announces nothing, because the
   * startup sweep never alerts about the past either way.
   */
  const announced = new Set<string>();

  const changed = () => {
    saver.save();
    listener?.();
  };

  /** When a timer was last told to start over, as milliseconds — unreadable text means never. */
  function relearnedAt(key: string): number | undefined {
    const at = state.relearned[key];
    if (!at) return undefined;
    const ms = Date.parse(at);
    return Number.isNaN(ms) ? undefined : ms;
  }

  /**
   * One read of the kill log, answering both questions it is ever asked: which mobs are nameds, and
   * what their gaps have taught. Together rather than separately because the second needs the first
   * — and asked apart, both callers walked all 5000 records twice to build the same `provenNamed`
   * set. The player's corrections sit on top of what the log proved.
   */
  function read(): { isNamed: (key: string) => boolean; learned: Map<string, RespawnLearning> } {
    const all = kills();
    const proven = provenNamed(all);
    const isNamed = (key: string) => state.said[key]?.named ?? proven.has(key);
    const learned = new Map(learnRespawns(all, isNamed, relearnedAt).map((l) => [l.key, l]));
    return { isNamed, learned };
  }

  /**
   * Drop the timers that have nothing left to say. A stale one is past its grace period, which
   * means the mob has been up for longer than its own respawn — the countdown describes nothing.
   */
  function prune(at: number): boolean {
    const before = state.timers.length;
    state.timers = state.timers.filter((t) => spawnState(t, at) !== "stale");
    for (const key of announced) if (!state.timers.some((t) => t.key === key)) announced.delete(key);
    return state.timers.length !== before;
  }

  /**
   * A pop, as an ordinary alert. `spawn` so the banner can word itself as news rather than a
   * warning.
   *
   * A **padded** timer speaks at the start of its window, when the mob is not up yet and might not
   * be for a while — so it says so in its own words rather than letting the banner's default "is
   * up" claim something we don't know. Without padding the two moments are the same and the
   * structured banner is exactly right, which is why the wording is only overridden when it would
   * otherwise be wrong.
   */
  function announce(timer: SpawnTimer, at: number): void {
    // Two gates, and they mean different things. `notify` is *this mob* — off unless the player
    // asked, because every named they kill is tracked and most are not being camped. `enabled` is
    // the overlay itself: an app the player has silenced stays silent, with no second "but not
    // these" for them to hunt for.
    if (!state.notify[timer.key]) return;
    const settings = getSettings();
    if (!settings.enabled) return;
    raise({
      caster: "",
      spell: timer.mob,
      at: new Date(at).toISOString(),
      event: "spawn",
      // The place, because the same named in two zones is two timers and the banner has to say which.
      target: timer.place,
      message: timer.lead ? `${timer.mob} due soon — ${timer.place}` : undefined,
      // No rule behind a spawn, so no rule's look to layer: the defaults are the whole answer.
      style: alertStyle(settings),
    });
  }

  /**
   * Has this timer reached the moment it should speak? That's the **window opening**, not the
   * by-time: with padding set, the whole point is to hear about it early, and with none the two are
   * the same instant.
   */
  const speaking = (timer: SpawnTimer, at: number) => spawnState(timer, at) !== "waiting";

  /**
   * Put a timer on the board, replacing whatever was there for the same mob — a fresh kill means
   * the old due time is about a corpse that has already been and gone, and re-padding means the old
   * window was the wrong shape.
   *
   * A timer armed with its moment **already past** is never announced. Everything logged while the
   * app was shut is replayed through the live path, so a kill from last night would otherwise pop a
   * banner about a mob that came and went hours ago — the same lie `high-scores` keeps quiet about,
   * caught here by the timer's own age so a log import and a re-pad are covered as well.
   */
  function arm(key: string, timer: SpawnTimer): void {
    state.timers = [...state.timers.filter((t) => t.key !== key), timer];
    if (speaking(timer, now())) announced.add(key);
    else announced.delete(key);
  }

  function sweep(): void {
    const at = now();
    for (const timer of state.timers) {
      if (announced.has(timer.key) || !speaking(timer, at)) continue;
      announced.add(timer.key);
      announce(timer, at);
      log.debug("spawn window open", {
        mob: timer.mob,
        place: timer.place,
        seconds: timer.seconds,
        lead: timer.lead,
      });
    }
    // Only a timer *leaving* is worth telling the windows about: a row that has merely come due
    // recomputes that from the due time it already holds, on its own second hand.
    if (prune(at)) changed();
  }

  // Anything whose moment has already passed when we start is *not* news. Mark it announced before
  // the first sweep, so the app comes up showing those timers without shouting about the last three
  // hours.
  {
    const at = now();
    for (const timer of state.timers) if (speaking(timer, at)) announced.add(timer.key);
    if (prune(at)) saver.save();
    log.debug("restored", state.timers.length, "spawn timers");
  }

  const handle = setEvery(sweep, SWEEP_MS);

  return {
    noteKill(mob, zone, at, named) {
      if (!zone) return; // a kill we can't place can't be a timer for anywhere
      const key = timerKey(mob, zone);
      // The kill that started this is already in the log by the time we're called, so what we learn
      // here includes it — which is what makes the second kill of a named produce a timer at once.
      const { isNamed, learned: allLearned } = read();
      // `named` is this line's own evidence; the log's history and the player's word are the rest.
      if (!named && !isNamed(mobKey(mob))) return;

      const learned = allLearned.get(key);
      const respawn = respawnFor(learned, state.stated[key], state.seen[key]);
      if (!respawn) return; // a named we can't yet time is not a countdown, it's a blank

      // `learned` is absent when the player typed a figure for a mob we've only killed once — so
      // the fallback has to name the place the same way a learned row does, or the same camp reads
      // two different ways depending on which figure happened to be in play.
      const timer = timerFrom(learned ?? { key, mob, place: placeName(zone) }, at, respawn, state.lead[key]);
      if (!timer) return;
      arm(key, timer);
      log.debug("timer started", { mob, place: timer.place, due: timer.dueAt, source: respawn.source });
      changed();
    },

    view() {
      const at = now();
      const { isNamed, learned } = read();
      const running = state.timers
        .map((timer) => ({ ...timer, state: spawnState(timer, at) }))
        .filter((t) => t.state !== "stale")
        // A mob you've said is **up** leads, whatever its clock says: it's the only row on the
        // board that is a fact rather than a guess, and the only one you can act on right now.
        // The rest sort by the moment each next matters, which with padding in play is the window
        // opening rather than the by-time — that's what the row is counting down to.
        .sort(
          (a, b) =>
            Number(b.state === "alive") - Number(a.state === "alive") ||
            Date.parse(a.watchFrom) - Date.parse(b.watchFrom),
        );

      const known = [...learned.values()]
        .filter((l) => isNamed(mobKey(l.mob)))
        .map((l) => ({
          ...l,
          stated: state.stated[l.key],
          lead: state.lead[l.key],
          notify: !!state.notify[l.key],
          respawn: respawnFor(l, state.stated[l.key], state.seen[l.key]),
          running: running.some((t) => t.key === l.key),
        }));

      // The mobs the player took off the list, kept visible so taking one off is a decision rather
      // than a trap: the control that undoes it can't live on the row it removes.
      const dismissed = Object.values(state.said)
        .filter((s) => !s.named)
        .map((s) => s.mob)
        .sort((a, b) => a.localeCompare(b));

      return { now: new Date(at).toISOString(), running, known, dismissed };
    },

    state(key, seconds) {
      // A stated figure is the player's, and the ratchet may not touch it — but it is also not
      // allowed to be nonsense, since a zero would make a mob permanently due.
      if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) delete state.stated[key];
      else state.stated[key] = Math.round(seconds);
      changed();
    },

    pad(key, seconds) {
      if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) delete state.lead[key];
      else state.lead[key] = Math.round(seconds);
      // Re-arm what's already counting down. Padding is nearly always set *while waiting for the
      // pop you want it for* — "this one keeps beating me to it" is the thought that produces it —
      // so leaving the running timer on the old window would ignore the request until next time.
      const running = state.timers.find((t) => t.key === key);
      if (running) {
        const fresh = timerFrom(running, running.killedAt, running, state.lead[key]);
        // `seenAt` is carried over, because re-shaping a window must not **un-see** a mob. A
        // sighting is an observation and outranks the countdown until the mob dies again; a fresh
        // timer has none, so arming one wholesale turned a row that read ALIVE back into a guess
        // about a mob the player is standing in front of, and lost the sighting's moment with it.
        if (fresh) arm(key, running.seenAt ? { ...fresh, seenAt: running.seenAt } : fresh);
      }
      changed();
    },

    markUp(key) {
      const timer = state.timers.find((t) => t.key === key);
      if (!timer || timer.seenAt) return; // nothing counting down, or already known to be up
      const at = now();
      // The countdown is over because the question it was asking has been answered. Recorded on
      // the timer rather than by deleting it, so the row can go on naming the mob and the place.
      timer.seenAt = new Date(at).toISOString();
      // ...and the sighting is evidence. `R ≤ now − died` is the tightest bound we can get, so it
      // goes through the same ratchet as everything else: shortest wins, implausible is discarded.
      const seconds = sightingFrom(timer.killedAt, at);
      if (seconds !== null) {
        state.seen[key] = tightenSighting(state.seen[key], seconds);
        log.debug("sighting recorded", { mob: timer.mob, seconds, tightest: state.seen[key].seconds });
      }
      // It's up, so there is nothing left to announce about it coming up.
      announced.add(key);
      changed();
    },

    markDead(key) {
      const at = now();
      const { learned } = read();
      const known = learned.get(key);
      const running = state.timers.find((t) => t.key === key);
      // The name and place come from whichever we have — a mob we've learned about, or the timer
      // already on the board. Without either there is no mob to start a clock for.
      const identity = known ?? (running && { key, mob: running.mob, place: running.place });
      if (!identity) return;
      const respawn = respawnFor(known, state.stated[key], state.seen[key]);
      // Nothing to count down *to*. Saying "it's dead" can't invent a respawn, and a countdown to
      // an unknown moment would be a blank clock pretending to be information.
      if (!respawn) return;
      const timer = timerFrom(identity, new Date(at).toISOString(), respawn, state.lead[key]);
      if (!timer) return;
      arm(key, timer);
      log.debug("timer started by hand", { mob: timer.mob, due: timer.dueAt, source: respawn.source });
      changed();
    },

    notify(key, on) {
      if (on) state.notify[key] = true;
      else delete state.notify[key];
      changed();
    },

    markNamed(mob, named) {
      const key = mobKey(mob);
      // The spelling travels with the answer so a dismissal stays visible, and therefore undoable.
      state.said[key] = { named, mob: state.said[key]?.mob || mob };
      // Saying "not a named" has to take its countdown with it, or the list keeps a row nothing
      // will ever restart. What was *learned* is untouched: it lives in the kill log, so tracking
      // the mob again brings its whole history back rather than starting from nothing.
      if (!named) state.timers = state.timers.filter((t) => !t.key.startsWith(`${key}|`));
      changed();
    },

    relearn(key) {
      state.relearned[key] = new Date(now()).toISOString();
      changed();
    },

    stop(key) {
      state.timers = state.timers.filter((t) => t.key !== key);
      announced.delete(key);
      changed();
    },

    onChanged(cb) {
      listener = cb;
    },

    flush: () => saver.flush(),
    dispose: () => clearEvery(handle),
  };
}
