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
import { SPAWN_STYLE_ID, alertStyle } from "../src/shared/alert-styles";
import { mobKey } from "../src/shared/mob-stats";
import { placeKey, placeName, samePlace } from "../src/shared/zones/place";
import {
  learnRespawns,
  provenNamed,
  respawnFor,
  floorFrom,
  MAX_CAMP_TIMERS,
  raiseFloor,
  rollForward,
  sightingFrom,
  spawnState,
  tightenSighting,
  timerForMob,
  timerFrom,
  timerId,
  timerInPlace,
  timerKey,
  timerSlot,
  type RespawnLearning,
  type Floor,
  type Sighting,
  type SpawnTimer,
} from "../src/shared/spawn-timers";
import type {
  CastAlertEvent,
  CastAlertSettings,
  KillRecord,
  SpawnKind,
  SpawnView,
} from "../src/shared/types";
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
  /**
   * Timer key → an entry the player typed in rather than one the kill log produced.
   *
   * Two things at once, deliberately, because they are the same thing wearing different names: a
   * **mob you want timed before you've killed it twice** (or at all — you've walked up to someone
   * else's camp), and a **custom timer** for something that isn't a mob and never will be. A label
   * no kill line will ever match simply never restarts itself, which is the correct behaviour for a
   * boat, a port or a raid lockout without a line of code spent distinguishing them.
   */
  added: Record<string, { mob: string; place: string; kind?: SpawnKind }>;
  /**
   * Timer key → a fresh kill **adds** a countdown instead of restarting the running one.
   *
   * The placeholder answer ([ADR 0135](../specs/decisions/0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)),
   * and the same question `CastWatch.retrigger` asks of an alert cue — one idea of what a repeat
   * match means, not two. Off by default: restarting is right for a named, and whether a camp cycles
   * is knowledge only the player has.
   */
  queue: Record<string, boolean>;
  /**
   * Timer key → when it comes due, start it again. **Custom timers only** — re-arming a mob's clock
   * would be inventing a death nobody saw.
   */
  repeat: Record<string, boolean>;
  /**
   * Timer key → a **saved** style (`CastAlertSettings.styles`) for its pop. Absent wears the alert
   * defaults.
   *
   * A saved style or nothing — never a look of its own, which is the same call
   * [ADR 0093](../specs/decisions/0093-a-high-score-is-a-personal-best-with-a-floor.md) makes about
   * a celebration and for the same reason: a per-timer style editor would be a third source of
   * truth next to the defaults and the saved styles, which
   * [ADR 0086](../specs/decisions/0086-editing-a-shared-style-from-a-rule-forks-it.md) and
   * [ADR 0090](../specs/decisions/0090-one-style-editor-at-a-time.md) exist to prevent.
   */
  styleId: Record<string, string>;
  /**
   * Timer key → keep its countdown on screen, over the game, for as long as it runs.
   *
   * Different in kind from `notify`, which is a *moment*. This is a **dial you can glance at**: the
   * question a camper asks is "how long left", and answering it should not cost them a window
   * switch away from the fight.
   */
  onScreen: Record<string, boolean>;
  /**
   * Timer key → the longest confirmed "not up yet", and how many times you've said so.
   *
   * The mirror of `seen`, and stored for the same reason: standing at a camp and finding nothing
   * there is an observation only the player can make, and nothing in the log records it.
   */
  floor: Record<string, Floor>;
  /**
   * Timer key → the gaps the player has thrown out, by id.
   *
   * The finest of the three corrections, and the one that keeps a camp's history: a cutoff
   * (`relearned`) draws a line under everything measured, where this removes the one pull that was
   * really the placeholder. Stored as an exclusion rather than by editing the kills, because the
   * kills happened and the log's record of them is not ours to rewrite.
   */
  droppedGaps: Record<string, string[]>;
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
    floor: { ...stored.floor },
    droppedGaps: { ...stored.droppedGaps },
    added: { ...stored.added },
    queue: { ...stored.queue },
    repeat: { ...stored.repeat },
    styleId: { ...stored.styleId },
    onScreen: { ...stored.onScreen },
    // An id is backfilled rather than assumed: a file written before countdowns had one holds a
    // single clock per camp, which is exactly slot 1 (ADR 0135).
    timers: (stored.timers ?? []).map((t) => (t.id ? t : { ...t, id: timerId(t.key, 1) })),
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
  /**
   * You changed zone. Almost always nothing to do — a mob keeps respawning while you're away — but
   * **changing the instance difficulty respawns everything**, and the log reports that as arriving
   * in a different *variant* of the zone you were already in.
   *
   * Every countdown for that place is then measuring from a death the world has since undone, so
   * they are dropped rather than left to come due about nothing.
   */
  noteZone(zone: string | null): void;
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
  markUp(key: string, id?: string): void;
  /**
   * You are standing there and it is **not** up — the disagreement with a countdown that says it
   * should be, and the only lower bound the app has.
   *
   * Records `R >` the time since it died, which ratchets *upward*: the window may not open before
   * that, and where it passes the estimate the two are reported as contradicting rather than one
   * being quietly picked (`contradicted`).
   */
  markNotUp(key: string, id?: string): void;
  /**
   * The log said you looked at it — a consider or a hail — so it is up, and you didn't have to say
   * so. The same thing `markUp` records, arriving free from what a camper does anyway: you consider
   * a named before you pull it.
   *
   * Only ever reaches a timer that is **already counting down**, which is the guard that keeps this
   * quiet: considering a trash mob names nothing we are tracking, and a mob with no running timer
   * has no `killedAt` to measure a sighting from.
   */
  noteSighting(mob: string, zone: string | null): void;
  /**
   * It's dead **now** — start the countdown from this moment, or restart one already running.
   *
   * The hand-operated twin of a kill line, for the times the log can't help: the app wasn't running
   * when you killed it, you're picking up someone else's camp, or a pull went unlogged. It seeds a
   * countdown and nothing more — one death is not a measurement of a respawn, so it teaches the
   * estimate nothing and never touches the kill log, which is the log's own record.
   */
  markDead(key: string): void;
  /**
   * Whether a fresh kill **adds** a countdown or restarts the running one. Off is right for a named;
   * on is the placeholder camp, where three deaths are three clocks
   * ([ADR 0135](../specs/decisions/0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)).
   */
  queue(key: string, on: boolean): void;
  /**
   * Whether a **custom** timer starts itself again when it comes due. A mob's clock never does: it
   * would be inventing a death nobody saw.
   */
  repeat(key: string, on: boolean): void;
  /**
   * Put a timer on the board by hand: a mob you haven't killed twice yet, or something that isn't a
   * mob at all. Returns the key it was filed under, so a caller can act on it straight away.
   *
   * `zone` may be blank — a boat has no camp — and `seconds` may be omitted, leaving a row that
   * says what it's for and waits for you to time it.
   */
  add(name: string, zone: string, seconds?: number | null, kind?: SpawnKind): string | null;
  /** Take a hand-added entry off the board, with everything that was set on it. */
  remove(key: string): void;
  /** Whether a pop should raise a banner. Off by default — see `Stored.notify`. */
  notify(key: string, on: boolean): void;
  /** Which saved style its pop wears, or `null` for the alert defaults. */
  style(key: string, styleId: string | null): void;
  /** Keep this countdown on screen over the game while it runs. */
  showOnScreen(key: string, on: boolean): void;
  /** Correct the article test about a mob. */
  markNamed(mob: string, named: boolean): void;
  /**
   * Throw away everything *measured* about one timer — the kill gaps and the sightings — and start
   * again from now. The kill gaps go by cutoff (the kills themselves are the log's record and not
   * ours to delete); the sightings are stored here, so they go outright.
   */
  relearn(key: string): void;
  /**
   * Drop just the sightings, keeping what the kill gaps taught.
   *
   * The narrower of the two, and the one a mis-click actually needs: "It's up" on the wrong row
   * records a bound that can only tighten, and without this the only way back was to throw away a
   * camp's whole measured history as well.
   */
  forgetSightings(key: string): void;
  /** Drop just the "not up yet" observations, keeping everything else. */
  forgetFloor(key: string): void;
  /**
   * Throw out **one** measured gap, or put it back. Everything else that camp taught survives —
   * which is the whole difference between this and `relearn`.
   */
  setGapDropped(key: string, id: string, dropped: boolean): void;
  /** Drop a running countdown without forgetting anything. `id` picks one of several; all, without. */
  stop(key: string, id?: string): void;
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
   * Countdowns already fired, **by id** — a camp may be running several at once (ADR 0135), and a
   * pop about one of them is not a pop about its siblings.
   *
   * Held in memory rather than on disk on
   * purpose: what's persisted is *when the mob is due*, and whether we happened to have said so
   * yet is about this session. A restart mid-window therefore re-announces nothing, because the
   * startup sweep never alerts about the past either way.
   */
  const announced = new Set<string>();

  /**
   * The zone as the log last wrote it, difficulty and all — the only way to notice the difficulty
   * changing, since every folded view of a zone deliberately calls the variants one place.
   */
  let lastZone: string | null = null;

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
    const learned = new Map(
      learnRespawns(all, isNamed, {
        relearnedAt,
        isDropped: (key, id) => !!state.droppedGaps[key]?.includes(id),
      }).map((l) => [l.key, l]),
    );
    return { isNamed, learned };
  }

  /**
   * Drop the timers that have nothing left to say. A stale one is past its grace period, which
   * means the mob has been up for longer than its own respawn — the countdown describes nothing.
   */
  function prune(at: number): boolean {
    const before = state.timers.length;
    state.timers = state.timers.filter((t) => spawnState(t, at) !== "stale");
    for (const id of announced) if (!state.timers.some((t) => t.id === id)) announced.delete(id);
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
      // A saved style if this timer wears one, the defaults otherwise. Resolved here, at the moment
      // of the alert, and sent *with* it — the overlay only knows the defaults, so a per-timer look
      // could reach the screen no other way.
      // Falling back to the shipped **Spawn timer** look rather than the alert defaults: a pop is
      // news, and arriving in the same red as "dispel now" is exactly what the built-in exists to
      // avoid. If the player has deleted that style, `alertStyle` drops through to the defaults.
      style: alertStyle(settings, { styleId: state.styleId[timer.key] ?? SPAWN_STYLE_ID }),
    });
  }

  /**
   * Has this timer reached the moment it should speak? That's the **window opening**, not the
   * by-time: with padding set, the whole point is to hear about it early, and with none the two are
   * the same instant.
   */
  const speaking = (timer: SpawnTimer, at: number) => spawnState(timer, at) !== "waiting";

  /**
   * What a row is about: a mob's camp, unless the player added it as a plain timer (ADR 0135).
   *
   * Absent `kind` reads as `mob`, which is what every row in a file written before this existed was.
   */
  const kindOf = (key: string): SpawnKind => (state.added[key]?.kind === "custom" ? "custom" : "mob");

  /** The countdowns this camp is running right now. Several, where it cycles placeholders. */
  const clocks = (key: string) => state.timers.filter((t) => t.key === key);

  /**
   * Take these countdowns off the board, and forget we ever spoke about them.
   *
   * One place, because every way a timer can leave — replaced, stopped, staled, repopped away — has
   * to take its `announced` entry with it, and a slot that came back round without one would be a
   * fresh clock that already believed it had spoken.
   */
  function drop(doomed: SpawnTimer[]): void {
    if (!doomed.length) return;
    const gone = new Set(doomed.map((t) => t.id));
    state.timers = state.timers.filter((t) => !gone.has(t.id));
    for (const id of gone) announced.delete(id);
  }

  /** The lowest slot this camp isn't using. Reused as clocks come and go — see `timerId`. */
  function freeSlot(key: string): number {
    const taken = new Set(clocks(key).map((t) => timerSlot(t.id)));
    let slot = 1;
    while (taken.has(slot)) slot += 1;
    return slot;
  }

  /**
   * Put a countdown on the board.
   *
   * **Restarting** replaces whatever this camp had — a fresh kill means the old due time is about a
   * corpse that has been and gone, and re-padding means the old window was the wrong shape.
   * **Queueing** leaves the others alone, which is the placeholder camp: three deaths at one camp are
   * three clocks, not one clock restarted twice (ADR 0135).
   *
   * The number of clocks a camp may run is **bounded**, and past the bound the oldest goes: it is the
   * one nearest staleness anyway, and a camp left on queue in a busy zone must not be able to fill
   * the board.
   *
   * A timer armed with its moment **already past** is never announced. Everything logged while the
   * app was shut is replayed through the live path, so a kill from last night would otherwise pop a
   * banner about a mob that came and went hours ago — the same lie `high-scores` keeps quiet about,
   * caught here by the timer's own age so a log import and a re-pad are covered as well.
   */
  function arm(timer: SpawnTimer, mode: "restart" | "queue" = "restart"): void {
    drop(mode === "queue" ? clocks(timer.key).filter((t) => t.id === timer.id) : clocks(timer.key));
    state.timers = [...state.timers, timer];
    const mine = clocks(timer.key);
    if (mine.length > MAX_CAMP_TIMERS) {
      const byAge = [...mine].sort((a, b) => Date.parse(a.killedAt) - Date.parse(b.killedAt));
      drop(byAge.slice(0, mine.length - MAX_CAMP_TIMERS));
    }
    if (speaking(timer, now())) announced.add(timer.id);
    else announced.delete(timer.id);
  }

  /**
   * Start this camp's clock from a death, however we came to hear about it — a kill line, or the
   * player saying so. One place, because a hand-started clock that queued differently from a logged
   * one would be two answers to the same question.
   *
   * `known` is what the kill log taught, where it has taught anything; the figure itself is settled
   * by `respawnFor`, so a typed one still outranks it. Returns `null` when there is nothing to count
   * down *to* — a countdown to an unknown moment is a blank clock pretending to be information.
   */
  function start(
    identity: Pick<RespawnLearning, "key" | "mob" | "place">,
    killedAt: string,
    known: RespawnLearning | undefined,
  ): SpawnTimer | null {
    const key = identity.key;
    const respawn = respawnFor(known, state.stated[key], state.seen[key], state.floor[key]);
    if (!respawn) return null;
    const mode = state.queue[key] ? "queue" : "restart";
    const timer = timerFrom(identity, killedAt, respawn, state.lead[key], mode === "queue" ? freeSlot(key) : 1);
    if (!timer) return null;
    arm(timer, mode);
    return timer;
  }

  /**
   * Which clock a per-countdown action means. With one running there is no question; with several,
   * `id` says which, and without one the **next due** is the one anybody means by "it's up".
   */
  function clockOf(key: string, id?: string): SpawnTimer | undefined {
    const mine = clocks(key);
    if (id) return mine.find((t) => t.id === id);
    return [...mine].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt))[0];
  }

  /**
   * Start every **repeating** timer that has come due on its next cycle. Custom timers only, by the
   * rule that a mob's clock may not be re-armed from a death nobody saw.
   *
   * Used by the sweep and again at startup, where it is what keeps an egg timer honest after the app
   * has been shut for a fortnight: it rolls forward to the next real moment rather than coming up a
   * hundred cycles overdue, and says nothing about the ones it skipped.
   */
  function refreshRepeats(at: number): boolean {
    let moved = false;
    for (const timer of [...state.timers]) {
      if (!state.repeat[timer.key]) continue;
      const next = rollForward(timer, at);
      if (next === timer) continue;
      drop([timer]);
      state.timers = [...state.timers, next];
      moved = true;
    }
    return moved;
  }

  function sweep(): void {
    const at = now();
    for (const timer of state.timers) {
      if (announced.has(timer.id) || !speaking(timer, at)) continue;
      announced.add(timer.id);
      announce(timer, at);
      log.debug("spawn window open", {
        mob: timer.mob,
        place: timer.place,
        seconds: timer.seconds,
        lead: timer.lead,
      });
    }
    // Announced first, then rewound: a cycle that ends and begins inside one sweep has to be spoken
    // about as the thing that *ended* before it becomes a fresh clock.
    const again = refreshRepeats(at);
    // Only a timer *leaving* is worth telling the windows about: a row that has merely come due
    // recomputes that from the due time it already holds, on its own second hand. A repeat is a new
    // due time, though, and that one nobody downstream can work out for themselves.
    if (prune(at) || again) changed();
  }

  // Anything whose moment has already passed when we start is *not* news. Mark it announced before
  // the first sweep, so the app comes up showing those timers without shouting about the last three
  // hours.
  {
    const at = now();
    refreshRepeats(at);
    for (const timer of state.timers) if (speaking(timer, at)) announced.add(timer.id);
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

      // `learned` is absent when the player typed a figure for a mob we've only killed once — so
      // the fallback has to name the place the same way a learned row does, or the same camp reads
      // two different ways depending on which figure happened to be in play. A named we can't yet
      // time is not a countdown but a blank, which is `start` returning nothing.
      const learned = allLearned.get(key);
      const timer = start(learned ?? { key, mob, place: placeName(zone) }, at, learned);
      if (!timer) return;
      log.debug("timer started", { mob, place: timer.place, due: timer.dueAt, source: timer.source });
      changed();
    },

    view() {
      const at = now();
      const { isNamed, learned } = read();
      const running = state.timers
        .map((timer) => ({
          ...timer,
          state: spawnState(timer, at),
          kind: kindOf(timer.key),
          slot: timerSlot(timer.id),
          onScreen: !!state.onScreen[timer.key],
          // The **id**, not the resolved look: unlike a banner — which is frozen at the moment it
          // fired so nothing restyles it afterwards — a pinned countdown is a live readout, and
          // re-styling it should move it there and then.
          styleId: state.styleId[timer.key],
        }))
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

      // Hand-added entries first, then what the kill log taught laid over the top: a mob you added
      // and have since killed is one row, carrying the real measurements rather than the blank we
      // filed when you typed it.
      const rows = new Map<string, RespawnLearning>();
      for (const [key, { mob, place }] of Object.entries(state.added)) {
        rows.set(key, { key, mob, place, samples: 0, gaps: [] });
      }
      for (const [key, l] of learned) {
        if (isNamed(mobKey(l.mob))) rows.set(key, l);
      }

      const known = [...rows.values()]
        .sort((a, b) => a.mob.localeCompare(b.mob) || a.place.localeCompare(b.place))
        .map((l) => ({
          ...l,
          kind: kindOf(l.key),
          queue: !!state.queue[l.key],
          repeat: !!state.repeat[l.key],
          stated: state.stated[l.key],
          lead: state.lead[l.key],
          notify: !!state.notify[l.key],
          styleId: state.styleId[l.key],
          onScreen: !!state.onScreen[l.key],
          respawn: respawnFor(l, state.stated[l.key], state.seen[l.key], state.floor[l.key]),
          // Every source, not just the one that won — you cannot tell which figure has gone wonky
          // from the answer alone, and the whole point of showing them is to fix one without
          // throwing away the others.
          seen: state.seen[l.key],
          floor: state.floor[l.key],
          running: running.some((t) => t.key === l.key),
          // Only a hand-added row may be removed. One the kill log produced would simply come back
          // on the next `view()`, so offering "remove" there would be a button that doesn't work.
          added: !!state.added[l.key],
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
      // Every clock of the camp, since padding is the camp's and a placeholder cycle has several.
      for (const running of clocks(key)) {
        const fresh = timerFrom(running, running.killedAt, running, state.lead[key], timerSlot(running.id));
        // `seenAt` is carried over, because re-shaping a window must not **un-see** a mob. A
        // sighting is an observation and outranks the countdown until the mob dies again; a fresh
        // timer has none, so arming one wholesale turned a row that read ALIVE back into a guess
        // about a mob the player is standing in front of, and lost the sighting's moment with it.
        // Armed as a queue: this is one clock being reshaped, not the camp being restarted.
        if (fresh) arm(running.seenAt ? { ...fresh, seenAt: running.seenAt } : fresh, "queue");
      }
      changed();
    },

    markUp(key, id) {
      const timer = clockOf(key, id);
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
      // It's up, so there is nothing left to announce about it coming up. This clock only: a
      // sibling on the same camp is a different placeholder and still has its own pop coming.
      announced.add(timer.id);
      changed();
    },

    noteZone(zone) {
      const previous = lastZone;
      lastZone = zone;
      if (!zone || !previous || previous === zone) return;
      // A *different* zone is ordinary travel and changes nothing: the camp you left keeps ticking.
      // The same **place** under a different name is the difficulty changing under you, which is
      // the one zone line that invalidates a countdown. Compared verbatim first, then folded —
      // `samePlace` on its own would call ordinary travel a difficulty change every time you came
      // back to the same camp.
      if (!samePlace(previous, zone)) return;
      const place = placeKey(zone);
      // Mobs only. A repop undoes the *deaths* these clocks measure from; a timer the player made —
      // a lockout, a boat, an egg timer — is not about a mob and the world rebuilding says nothing
      // about it (ADR 0135).
      const doomed = state.timers.filter((t) => timerInPlace(t.key, place) && kindOf(t.key) === "mob");
      if (!doomed.length) return;
      drop(doomed);
      log.debug("difficulty changed; dropped timers for the place", {
        from: previous,
        to: zone,
        dropped: doomed.length,
      });
      changed();
    },

    noteSighting(mob, zone) {
      if (!zone) return;
      const key = timerKey(mob, zone);
      // `markUp` is the whole behaviour — ending the countdown, recording the bound, and silencing
      // a pop about a mob you are looking at. Reaching for it rather than repeating it is what keeps
      // an automatic sighting and a hand-clicked one from ever meaning different things.
      this.markUp(key);
    },

    markDead(key) {
      const at = now();
      const { learned } = read();
      const known = learned.get(key);
      const running = clockOf(key);
      const added = state.added[key];
      // The name and place come from whichever we have, in order of how much it knows: what the
      // kill log taught, then what the player typed in, then a timer already on the board. The
      // middle one matters most here — a hand-added row has no kills behind it, and starting its
      // clock is the whole reason for adding it.
      const identity =
        known ??
        (added ? { key, mob: added.mob, place: added.place } : undefined) ??
        (running ? { key, mob: running.mob, place: running.place } : undefined);
      if (!identity) return;
      // Nothing to count down *to*. Saying "it's dead" can't invent a respawn, and a countdown to
      // an unknown moment would be a blank clock pretending to be information.
      const timer = start(identity, new Date(at).toISOString(), known);
      if (!timer) return;
      log.debug("timer started by hand", { mob: timer.mob, due: timer.dueAt, source: timer.source });
      changed();
    },

    add(name, zone, seconds, kind = "mob") {
      const mob = name.trim();
      if (!mob) return null;
      const where = zone.trim();
      const key = timerKey(mob, where);
      // The place is stored named rather than raw, so a hand-typed "Lower Guk 2" files under the
      // same camp the kill log would have used (ADR 0083). Blank stays blank: not everything worth
      // timing is somewhere.
      state.added[key] = { mob, place: where ? placeName(where) : "", kind };
      // Adding a **mob** by hand *is* the claim that it's worth timing, which is what `named` means
      // here — so a kill of it starts teaching us straight away rather than waiting on the article
      // test. A custom timer claims nothing: it is a clock, not an opinion about what is a named,
      // and the inert flag it used to leave behind outlived the row that wrote it (ADR 0135).
      if (kind === "mob") state.said[mobKey(mob)] = { named: true, mob };
      if (seconds !== undefined && seconds !== null && seconds > 0) state.stated[key] = Math.round(seconds);
      log.debug("timer added by hand", { mob, place: state.added[key].place, seconds });
      changed();
      return key;
    },

    remove(key) {
      // Everything set on it goes with it, or a re-add would silently inherit the old settings.
      // What was *learned* is derived from the kill log and is not ours to delete — re-adding a mob
      // you have killed brings its history back, which is the same promise `markNamed` makes.
      const gone = state.added[key];
      delete state.added[key];
      delete state.stated[key];
      delete state.lead[key];
      delete state.notify[key];
      delete state.seen[key];
      delete state.floor[key];
      delete state.droppedGaps[key];
      delete state.relearned[key];
      delete state.styleId[key];
      delete state.onScreen[key];
      delete state.queue[key];
      delete state.repeat[key];
      drop(clocks(key));
      // Withdraw the "this is a named" claim `add` made, so a timer you deleted leaves nothing
      // behind — but only if nothing else still stands behind it: another hand-added row for the
      // same mob elsewhere, or the log having proved it by the article test on its own.
      if (gone && kindOf(key) === "mob") {
        const mk = mobKey(gone.mob);
        const elsewhere = Object.values(state.added).some((a) => a.kind !== "custom" && mobKey(a.mob) === mk);
        if (!elsewhere && !provenNamed(kills()).has(mk)) delete state.said[mk];
      }
      changed();
    },

    markNotUp(key, id) {
      const timer = clockOf(key, id);
      if (!timer) return; // nothing counting down, so there is no death to measure from
      const seconds = floorFrom(timer.killedAt, now());
      if (seconds === null) return;
      state.floor[key] = raiseFloor(state.floor[key], seconds);
      log.debug("still down", { mob: timer.mob, seconds, floor: state.floor[key].seconds });
      // A mob that isn't up can't still be marked alive — saying so is the plain undo for a
      // mis-clicked "It's up", and re-arms the countdown that sighting had ended.
      if (timer.seenAt) {
        delete timer.seenAt;
        announced.delete(timer.id);
      }
      changed();
    },

    forgetFloor(key) {
      delete state.floor[key];
      changed();
    },

    setGapDropped(key, id, dropped) {
      const current = state.droppedGaps[key] ?? [];
      const next = dropped ? [...new Set([...current, id])] : current.filter((g) => g !== id);
      if (next.length) state.droppedGaps[key] = next;
      else delete state.droppedGaps[key];
      changed();
    },

    notify(key, on) {
      if (on) state.notify[key] = true;
      else delete state.notify[key];
      changed();
    },

    style(key, styleId) {
      // Not checked against the saved styles: one may be deleted later anyway, and `alertStyle`
      // already falls through to the defaults for an id that no longer resolves — an alert that
      // can't be styled must still be seen.
      if (styleId) state.styleId[key] = styleId;
      else delete state.styleId[key];
      changed();
    },

    showOnScreen(key, on) {
      if (on) state.onScreen[key] = true;
      else delete state.onScreen[key];
      changed();
    },

    markNamed(mob, named) {
      const key = mobKey(mob);
      // The spelling travels with the answer so a dismissal stays visible, and therefore undoable.
      state.said[key] = { named, mob: state.said[key]?.mob || mob };
      // Saying "not a named" has to take its countdown with it, or the list keeps a row nothing
      // will ever restart. What was *learned* is untouched: it lives in the kill log, so tracking
      // the mob again brings its whole history back rather than starting from nothing.
      if (!named) drop(state.timers.filter((t) => timerForMob(t.key, key)));
      changed();
    },

    relearn(key) {
      state.relearned[key] = new Date(now()).toISOString();
      // **And the sightings.** They are measurements too (ADR 0097), they ratchet the same way, and
      // they are *stored* rather than derived — so a cutoff over the kill log left them untouched
      // and a bad one was permanent. "Forget what was measured" has to mean all of it, or the
      // figure does not go back to unknown the way the panel promises it will.
      delete state.seen[key];
      delete state.floor[key];
      // The cutoff supersedes them: a gap that no longer counts needs no exclusion of its own,
      // and keeping one would quietly re-exclude a gap measured *after* the reset.
      delete state.droppedGaps[key];
      changed();
    },

    forgetSightings(key) {
      delete state.seen[key];
      changed();
    },

    stop(key, id) {
      drop(id ? clocks(key).filter((t) => t.id === id) : clocks(key));
      changed();
    },

    queue(key, on) {
      if (on) state.queue[key] = true;
      else delete state.queue[key];
      changed();
    },

    repeat(key, on) {
      if (on) state.repeat[key] = true;
      else delete state.repeat[key];
      // A timer switched to repeating while it sits there finished should start again now rather
      // than at some next sweep nobody can predict — and one switched *off* keeps its current
      // cycle, because ending the countdown you are watching is not what "stop repeating" asks for.
      if (on) refreshRepeats(now());
      changed();
    },

    onChanged(cb) {
      listener = cb;
    },

    flush: () => saver.flush(),
    dispose: () => clearEvery(handle),
  };
}
