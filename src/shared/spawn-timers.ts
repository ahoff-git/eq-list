/**
 * spawn-timers.ts — how long a named takes to come back, learned from the times you killed it.
 *
 * The kill log already records every kill with what it was, where, and when
 * ([ADR 0022](../../specs/decisions/0022-invocation-effects-and-kill-locations.md)); `mob-stats.ts`
 * rolls those up into counts and drops the *interval* between two of them on the floor. That
 * interval is the one number a camper actually wants, measured on this server and this build rather
 * than copied off a page about a different one — the same argument
 * [ADR 0025](../../specs/decisions/0025-observation-over-the-wiki.md) makes about drop rates.
 *
 * **This is a soft measurement of a soft thing, and the code says so rather than rounding it away**
 * ([ADR 0094](../../specs/decisions/0094-a-spawn-timer-is-a-window-not-an-instant.md)). Three
 * things in the game make it soft, and none of them is a bug we can parse our way out of:
 *
 *   - **A named may not be what spawned.** Plenty sit on a placeholder cycle, so the thing that
 *     popped on time was a different mob and your next kill of the *named* is several cycles later.
 *   - **A mob walks.** It can be up on time and nowhere near you for minutes afterwards.
 *   - **You are not a stopwatch.** You arrive when you arrive.
 *
 * All three widen the gap you observe and none of them can shorten it, which is what makes the
 * learning rule work at all and also what makes a single number a lie:
 *
 *   - **The estimate is the shortest gap ever seen, never the average.** You cannot kill a mob
 *     before it spawns, so every gap you observe is an *upper bound* on the true respawn — you
 *     arrived late by an unknown amount. The shortest is the tightest bound available and a longer
 *     one says nothing at all. An average would describe your evening, not the mob.
 *   - **Which makes it a ratchet: it only ever falls.** Nothing observed can widen it again, so a
 *     gap that isn't plausible is thrown away rather than clamped — against a number that only
 *     shrinks, one invented short value is permanent — and the way back up is a hand-typed figure,
 *     which nothing here may overwrite.
 *   - **So both ends of the evidence are kept.** The *spread* between the shortest and longest gap
 *     is the honest measure of how much the figure is worth: gaps that cluster mean several
 *     independent arrivals agreed, gaps that disagree mean the shortest is probably still nowhere
 *     near the truth. Reported, never averaged away.
 *   - **And the player owns the padding.** We refuse to invent a lower bound for the window —
 *     there is no observation that could support one — so how early to start watching is a number
 *     the person at the camp sets, per mob, because they know whether this one walks.
 *
 * Pure: no clock of its own, no I/O, no timers. `now` arrives as an argument wherever it's needed,
 * so an eight-hour countdown is tested in a millisecond. The holder that actually waits, persists a
 * due time and raises the alert is [electron/spawn-tracker.ts](../../electron/spawn-tracker.ts).
 */
import { mobKey } from "./mob-stats";
import { placeKey, placeName } from "./zones/place";
import type { KillRecord } from "./types";

const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const SECONDS_PER_HOUR = MINUTES_PER_HOUR * SECONDS_PER_MINUTE;
const MS_PER_SECOND = 1000;

/**
 * Below this a "gap" is not a respawn. Two kills of one name a minute apart are two mobs sharing
 * it, or a placeholder and its named counted as one — never a mob that repopped that fast. Set at
 * the low end of what a real timer can be so a genuinely fast placeholder still teaches us
 * something.
 */
export const MIN_RESPAWN_SECONDS = 90;

/**
 * Above this, the gap is you not being there rather than the mob being slow. A named on a longer
 * timer than half a day exists, but we would never *measure* it — every observation of it would be
 * an arrival time — so recording one would be recording a fiction with a number attached.
 *
 * Generous on purpose: a placeholder cycle multiplies the gap between two kills of the *named* by
 * however many pops it took, and those are real observations of something, even if what they
 * measure is the cycle rather than the spawn.
 */
export const MAX_RESPAWN_SECONDS = 12 * SECONDS_PER_HOUR;

/**
 * How far apart the shortest and longest gap have to be before the figure is worth distrusting out
 * loud. Half again is a low bar deliberately: a fixed respawn watched by a prompt player produces
 * gaps within seconds of each other, so anything this loose already means something else is going
 * on — a placeholder, a walker, or an evening you wandered off in the middle of.
 */
export const ERRATIC_RATIO = 1.5;

/**
 * How long a timer stays on the board after its by-time. Long enough that a pop you stepped away
 * from is still there when you sit down, and that a mob which spawned on time and **walked** has a
 * chance to arrive; short enough that yesterday's camp isn't. Past it the timer is stale — it says
 * nothing true any more, because the mob has been up (and probably killed by someone else) for
 * longer than its own respawn.
 */
export const OVERDUE_GRACE_SECONDS = 30 * SECONDS_PER_MINUTE;

/** The longest lead we'll accept — past this the "warning" covers the whole respawn. */
export const MAX_LEAD_SECONDS = 2 * SECONDS_PER_HOUR;

/**
 * The identity of a timer: one named, in one place. Two zones' copies are two timers.
 *
 * A placeholder cycle wants a *different* identity — several mob names sharing one spawn point —
 * and this is the seam it would go through: everything downstream keys off the string rather than
 * off the mob, so a future "these three names are one cycle" mapping changes what is put in here
 * and nothing else. Not built, because guessing which names share a spawn is exactly the kind of
 * thing this file refuses to do without evidence.
 */
export function timerKey(mob: string, zone: string): string {
  return `${mobKey(mob)}|${placeKey(zone)}`;
}

/** What repeated kills of one named in one place have taught about its respawn. */
export interface RespawnLearning {
  key: string;
  /** For display — the spelling the kill log settled on. */
  mob: string;
  /** For display — the place named by the mapping table, not by whichever kill arrived first. */
  place: string;
  /**
   * The shortest usable gap ever seen, in seconds: the tightest **upper bound** we can honestly
   * claim. Absent when there have never been two comparable kills.
   */
  shortestSeconds?: number;
  /**
   * The longest usable gap, kept as the other end of the evidence rather than discarded. On its own
   * it means little — a long gap is usually just you arriving late — but *next to* the shortest it
   * is the only measure we have of how much the estimate is worth.
   */
  longestSeconds?: number;
  /** Usable gaps behind those figures. `0` means kills exist but no two could be compared. */
  samples: number;
  /** The most recent kill, ISO — where a countdown would be measured from. */
  lastKillAt?: string;
}

/**
 * The mobs we have proof are named — one kill written without an article is enough, and settles it
 * for that name everywhere.
 *
 * A record with `named` **absent** is unknown, not plain: it was stored before the flag existed and
 * the article is gone for good. So it neither proves nor disproves, and one fresh kill fixes it.
 * `named: false` is a real answer and is simply not proof of the thing we're collecting.
 */
export function provenNamed(kills: KillRecord[]): Set<string> {
  const named = new Set<string>();
  for (const k of kills) {
    if (!k.named) continue;
    // **The victim's name is only half the answer.** The log reports every death in earshot, and a
    // player, a pet and a boss are all written without an article — so "Bunnyslayer has been slain
    // by a froglok shaman!" reads exactly like a named dying. What separates them is who did the
    // killing: a *person* kills a named, a *mob* kills a player or a pet. Without this a busy
    // dungeon fills the board with every death that happened near you.
    //
    // Absent is unknown and starts nothing, for the same reason `named` absent does: one more kill
    // settles it, and a clean list is worth more than a row we can't justify.
    if (!k.killerNamed) continue;
    named.add(mobKey(k.mob));
  }
  return named;
}

/**
 * Learn every named's respawn from the kill log.
 *
 * `isNamed` is passed in rather than derived here because the answer has two sources that this
 * module has no business merging: what the log proved (`provenNamed`) and what the player said.
 * The tracker owns that union.
 *
 * Three kinds of kill are skipped, each for its own reason:
 *   - **no zone** — a kill that can't be placed can't be compared with the one before it;
 *   - **a peer's** — their clock is not yours, and against a bound that only ever falls a single
 *     skewed timestamp is a wrong answer nothing but a hand-typed value can undo (ADR 0092);
 *   - **not a named** — a camp of identical spawns produces gaps that are about how fast you kill,
 *     not about respawn.
 *
 * A *bystander's* kill in your own log is kept, though it never counts towards a drop rate
 * ([ADR 0027](../../specs/decisions/0027-only-your-kills-count.md)): a mob dying is evidence of
 * when it died whoever swung the sword, and it is your clock that wrote the line.
 *
 * `relearnedAt` is the way back up from a bound that only ever falls: a timer told to start over
 * ignores every **gap beginning** before the moment it was told, so a figure tightened by a
 * mis-parsed or misremembered evening can be dropped without deleting the kills themselves. A
 * cutoff rather than a stored number, so the learned figure stays **derived** and one correction
 * re-derives every answer that depended on it
 * ([ADR 0024](../../specs/decisions/0024-mob-knowledge.md)).
 *
 * It filters *gaps*, not kills: a mob whose evidence has all been thrown away is still a named you
 * have killed, and must keep its row — with nothing in the interval column — rather than vanishing
 * from the list and taking the figure you typed for it with it.
 */
export function learnRespawns(
  kills: KillRecord[],
  isNamed: (key: string) => boolean,
  relearnedAt?: (key: string) => number | undefined,
): RespawnLearning[] {
  const groups = new Map<string, { mob: string; zone: string; times: number[] }>();

  for (const k of kills) {
    if (!k.zone || k.sharedBy) continue;
    if (!isNamed(mobKey(k.mob))) continue;
    const at = Date.parse(k.at);
    if (Number.isNaN(at)) continue;
    const key = timerKey(k.mob, k.zone);
    const group = groups.get(key);
    if (group) group.times.push(at);
    else groups.set(key, { mob: k.mob, zone: k.zone, times: [at] });
  }

  const learned: RespawnLearning[] = [];
  for (const [key, { mob, zone, times }] of groups) {
    // Records arrive in log order, but an imported log can interleave with live kills — so sort
    // rather than assume, since a negative gap would read as a wildly short respawn.
    times.sort((a, b) => a - b);
    const since = relearnedAt?.(key);
    let shortest: number | undefined;
    let longest: number | undefined;
    let samples = 0;
    for (let i = 1; i < times.length; i += 1) {
      // A gap that *starts* before the reset is evidence from the period being thrown away, even
      // if it ends after it.
      if (since !== undefined && times[i - 1] < since) continue;
      const gap = Math.round((times[i] - times[i - 1]) / MS_PER_SECOND);
      // Implausible on either side is discarded, never clamped: see the ratchet note up top.
      if (gap < MIN_RESPAWN_SECONDS || gap > MAX_RESPAWN_SECONDS) continue;
      samples += 1;
      if (shortest === undefined || gap < shortest) shortest = gap;
      if (longest === undefined || gap > longest) longest = gap;
    }
    learned.push({
      key,
      mob,
      place: placeName(zone),
      shortestSeconds: shortest,
      longestSeconds: longest,
      samples,
      lastKillAt: new Date(times[times.length - 1]).toISOString(),
    });
  }

  // Soonest-known first is meaningless as an order; the mob's name is what a reader scans for.
  return learned.sort((a, b) => a.mob.localeCompare(b.mob) || a.place.localeCompare(b.place));
}

/**
 * Where a respawn figure came from, which decides both how it may be worded and how much it is
 * worth. All three are **upper bounds** on the true respawn; they differ in how loose.
 *
 *   - `stated` — you typed it. Outranks everything and is never overwritten.
 *   - `seen` — you marked it **up**. `R ≤ (the moment you saw it) − (the moment it died)`, which
 *     is the tightest evidence the app can gather, because unlike a kill gap it excludes the time
 *     you then spent getting to the mob and killing it.
 *   - `killed` — the gap between two of your kills. Everything a sighting excludes is still in
 *     here, plus however many placeholder cycles went by.
 */
export type RespawnSource = "stated" | "seen" | "killed";

/** What marking a mob **up** has taught: the tightest death-to-sighting gap, and how many there were. */
export interface Sighting {
  seconds: number;
  count: number;
}

/** A respawn we're prepared to act on, and the provenance that makes it sayable. */
export interface Respawn {
  /** The **by-time**: we expect it to have spawned within this long. Not "it spawns at". */
  seconds: number;
  source: RespawnSource;
  /** Observations behind the figure — kill gaps, or sightings. `0` for a stated one. */
  samples: number;
  /**
   * The longest **kill gap** seen, when there is one — the other end of that evidence (see
   * `erratic`). Only ever about kill gaps, since a sighting has no matching loose end.
   */
  spreadSeconds?: number;
}

/**
 * The figure to use for a mob: what the player typed, or failing that what we learned.
 *
 * A stated value **wins outright and is never overwritten** — the rule EQBuddy keeps a whole file
 * for. What was learned is not discarded when one is set, only outranked, so clearing the override
 * restores the observation rather than leaving nothing
 * ([ADR 0056](../../specs/decisions/0056-a-dropped-record-keeps-what-it-taught.md)).
 */
export function respawnFor(
  learned: RespawnLearning | undefined,
  stated: number | undefined,
  seen?: Sighting,
): Respawn | undefined {
  if (stated !== undefined && stated > 0) return { seconds: stated, source: "stated", samples: 0 };

  const killed =
    learned?.shortestSeconds === undefined
      ? undefined
      : {
          seconds: learned.shortestSeconds,
          source: "killed" as const,
          samples: learned.samples,
          spreadSeconds: learned.longestSeconds,
        };
  const sighted = seen && seen.seconds > 0 ? { seconds: seen.seconds, source: "seen" as const, samples: seen.count } : undefined;

  // Both are upper bounds, so the smaller is simply the better one — the same rule that picks the
  // shortest gap, applied one level up. A sighting usually wins because it excludes the time spent
  // reaching and killing the mob, but it isn't privileged: if a kill gap somehow came in tighter,
  // that is a real bound too and pretending otherwise would be discarding evidence.
  if (!killed) return sighted;
  if (!sighted) return killed;
  return sighted.seconds <= killed.seconds ? sighted : killed;
}

/**
 * Do the observed gaps disagree enough that the figure should be read as a hint rather than a
 * timer?
 *
 * Only ever asked of a **kill-gap** figure. A stated one isn't a guess, and a sighting has no
 * second end to disagree with — its looseness is one short step (how long before you looked),
 * where a kill gap's can be several placeholder cycles.
 */
export function erratic(respawn: Respawn): boolean {
  if (respawn.source !== "killed" || respawn.spreadSeconds === undefined) return false;
  return respawn.spreadSeconds > respawn.seconds * ERRATIC_RATIO;
}

/**
 * What a sighting at `seenAt` says about a mob that died at `killedAt`, or `null` when it says
 * nothing usable.
 *
 * Bounded exactly like a kill gap, and for the same reasons: under the floor it's a double-count
 * or a misclick, over the ceiling you simply weren't looking. Discarded rather than clamped,
 * because this feeds the ratchet and an invented short number there is permanent.
 */
export function sightingFrom(killedAt: string, seenAtMs: number): number | null {
  const died = Date.parse(killedAt);
  if (Number.isNaN(died)) return null;
  const seconds = Math.round((seenAtMs - died) / MS_PER_SECOND);
  if (seconds < MIN_RESPAWN_SECONDS || seconds > MAX_RESPAWN_SECONDS) return null;
  return seconds;
}

/** Fold a fresh sighting into what earlier ones taught — the shortest wins, and the count grows. */
export function tightenSighting(seen: Sighting | undefined, seconds: number): Sighting {
  if (!seen) return { seconds, count: 1 };
  return { seconds: Math.min(seen.seconds, seconds), count: seen.count + 1 };
}

/** A countdown: one named, in one place, with a window we expect it back in. */
export interface SpawnTimer {
  key: string;
  mob: string;
  place: string;
  /** The kill that started it, ISO. */
  killedAt: string;
  /**
   * When to start watching — `dueAt` less the player's padding. Equal to `dueAt` when they haven't
   * asked for any, which is every timer until someone decides this one needs it.
   */
  watchFrom: string;
  /**
   * The **by-time**, ISO: we expect it to have spawned by now. Stored rather than a remaining time,
   * so it survives a restart.
   */
  dueAt: string;
  /** The interval used, and where it came from — a learned one is a bound, a stated one is a claim. */
  seconds: number;
  source: RespawnSource;
  /** Gaps behind a learned interval, carried so the row can say how much to believe it. */
  samples: number;
  /** The longest gap seen, carried for the same reason (see `erratic`). */
  spreadSeconds?: number;
  /** The padding this timer was armed with, in seconds. */
  lead: number;
  /**
   * When the player said they could see it, ISO. Set means the mob **is** up — an observation,
   * not the countdown's opinion — and outranks every other state until it dies again.
   */
  seenAt?: string;
}

/**
 * Start a countdown from a kill. Pure — the window is arithmetic, not a timer.
 *
 * `lead` is the player's own allowance for everything this file can't measure: a mob that walks, a
 * placeholder cycle, or simply wanting to be in position before it matters. It is **theirs to set
 * and ours to refuse to guess** — there is no observation that could tell us how early a mob might
 * really pop, so inventing a lower bound would be dressing a guess as a measurement.
 */
export function timerFrom(
  learning: Pick<RespawnLearning, "key" | "mob" | "place">,
  killedAt: string,
  respawn: Respawn,
  lead = 0,
): SpawnTimer | null {
  const at = Date.parse(killedAt);
  if (Number.isNaN(at)) return null;
  // Clamped rather than refused, and never past the kill itself: a window that opened before the
  // mob died would be permanently open, which is the one setting that says nothing at all.
  const padding = Math.min(Math.max(Math.round(lead), 0), Math.min(respawn.seconds, MAX_LEAD_SECONDS));
  const due = at + respawn.seconds * MS_PER_SECOND;
  return {
    key: learning.key,
    mob: learning.mob,
    place: learning.place,
    killedAt,
    watchFrom: new Date(due - padding * MS_PER_SECOND).toISOString(),
    dueAt: new Date(due).toISOString(),
    seconds: respawn.seconds,
    source: respawn.source,
    samples: respawn.samples,
    spreadSeconds: respawn.spreadSeconds,
    lead: padding,
  };
}

/**
 * Where a timer is in its life.
 *
 * `window` is the player's padding playing out — it *might* be up, and that is the whole reason the
 * padding exists. `up` means the by-time has passed, so on the evidence it should have spawned; it
 * does **not** mean the mob is standing in front of you, because a mob that spawned on time may
 * still be walking. `stale` is past the grace period, when it has been up longer than its own
 * respawn and the countdown describes nothing.
 *
 * With no padding — every timer, until someone sets some — `window` never happens and this behaves
 * exactly as a point-in-time countdown does.
 *
 * A stale timer is dropped rather than shown, and is **never** alerted retroactively: an alert
 * about something that happened three hours ago is the opposite of what an overlay is for.
 */
export type SpawnState = "waiting" | "window" | "up" | "alive" | "stale";

export function spawnState(timer: Pick<SpawnTimer, "watchFrom" | "dueAt" | "seenAt">, nowMs: number): SpawnState {
  // A sighting outranks the clock outright, in both directions: it can say a mob is up before the
  // window opens, and it keeps saying so long after the countdown would have given up. That is the
  // claim-versus-observation rule this whole app runs on — the estimate is what we *guessed*, and
  // the player standing there looking at the mob is what we *know*.
  if (timer.seenAt && !Number.isNaN(Date.parse(timer.seenAt))) return "alive";
  const due = Date.parse(timer.dueAt);
  if (Number.isNaN(due)) return "stale"; // unreadable is not a countdown we can honour
  const open = Date.parse(timer.watchFrom);
  if (!Number.isNaN(open) && nowMs < open) return "waiting";
  if (nowMs < due) return "window";
  return nowMs - due <= OVERDUE_GRACE_SECONDS * MS_PER_SECOND ? "up" : "stale";
}

/** Milliseconds until the by-time — negative once it's passed, so a caller can say "3m ago". */
export function remainingMs(timer: Pick<SpawnTimer, "dueAt">, nowMs: number): number {
  const due = Date.parse(timer.dueAt);
  return Number.isNaN(due) ? 0 : due - nowMs;
}

/**
 * How far ahead of this window's own clock the main process is, from a view it just sent.
 *
 * The countdowns are measured against **main's** clock, because main is what decides a timer is due
 * and raises the banner — a row reading `0:00` while main still calls it waiting is the kind of
 * disagreement nobody can debug from the screen. But a renderer has to re-render every second on
 * its *own* clock, so the two are reconciled here, once per fetch, as an offset.
 *
 * An offset rather than a counter, and that distinction is the whole point: a free-running "seconds
 * since I loaded this" **adds to** the timestamp of every later fetch, so the displayed clock runs
 * ahead by however long the panel has been open, and every refetch makes it worse. Anchored to
 * `Date.now()` there is nothing to accumulate.
 *
 * Unreadable input is no skew rather than a guess — the local clock is a fine approximation of a
 * clock on the same machine, and `NaN` propagating into a countdown would blank every row.
 */
export function clockSkew(mainNow: string, localNow: number): number {
  const parsed = Date.parse(mainNow);
  return Number.isNaN(parsed) ? 0 : parsed - localNow;
}

/**
 * Milliseconds to this timer's **next** boundary: the window opening while we're still waiting for
 * it, the by-time thereafter. One function because the row shows one clock, and which moment that
 * clock is counting to is a property of where the timer has got to rather than a choice the caller
 * should have to make.
 */
export function countdownMs(timer: Pick<SpawnTimer, "watchFrom" | "dueAt">, nowMs: number): number {
  const open = Date.parse(timer.watchFrom);
  if (!Number.isNaN(open) && nowMs < open) return open - nowMs;
  return remainingMs(timer, nowMs);
}

/**
 * A countdown, as a clock rather than as prose — `1:04:12`, `12:04`, `0:07`.
 *
 * Deliberately not `formatDelay` from [alert-schedule.ts](./alert-schedule.ts): that one prints a
 * *setting* the player typed and has to round-trip back through `parseDelay`, which knows only
 * seconds and minutes. This prints a *clock that is running*, wants hours, and is never parsed
 * back. Negative input reads as zero; how overdue something is, is the caller's sentence to write.
 */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.round(ms / MS_PER_SECOND));
  const hours = Math.floor(total / SECONDS_PER_HOUR);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = total % SECONDS_PER_MINUTE;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/**
 * An interval as a phrase — `22m`, `6h 30m`. For the figure itself rather than a running clock,
 * which is why it reads in words and stops at minutes: nobody camps to the second.
 */
export function formatInterval(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < SECONDS_PER_MINUTE) return `${total}s`;
  // Rounded to whole minutes **first**, then split. Rounding the leftover seconds against the hour
  // instead let the minutes reach 60 without the hour hearing about it, so 1h 59m 40s printed as
  // "1h 60m" and 59m 30s as "60m" — clocks that don't exist, on the figure a camper reads first.
  const minutes = Math.round(total / SECONDS_PER_MINUTE);
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  if (!hours) return `${minutes}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/**
 * How to word a respawn figure so it can't be mistaken for a fact it isn't.
 *
 * The learned number is an **upper bound from a sample**, and "22m" alone claims a precision we
 * have not got — so the sample count travels with it, exactly as it does for a drop rate
 * ([ADR 0024](../../specs/decisions/0024-mob-knowledge.md)). When the gaps behind it disagree, the
 * *range* leads instead of the figure, because a reader who sees "22m" will camp to 22 minutes
 * however small the print underneath is. A stated figure needs no hedge: the player is not guessing
 * about what they typed.
 */
export function describeRespawn(respawn: Respawn): string {
  if (respawn.source === "stated") return `${formatInterval(respawn.seconds)} (you set this)`;
  if (respawn.source === "seen") {
    const times = respawn.samples === 1 ? "seen up once" : `seen up ${respawn.samples} times`;
    return `at most ${formatInterval(respawn.seconds)}, ${times}`;
  }
  const gaps = respawn.samples === 1 ? "1 gap" : `${respawn.samples} gaps`;
  if (erratic(respawn) && respawn.spreadSeconds !== undefined) {
    return `${formatInterval(respawn.seconds)}–${formatInterval(respawn.spreadSeconds)}, from ${gaps}`;
  }
  return `at most ${formatInterval(respawn.seconds)}, from ${gaps}`;
}

/**
 * The sentence to put under a figure that shouldn't be trusted as a timer, or `null` when there's
 * nothing to warn about.
 *
 * Named causes rather than a bare "low confidence", because the causes are **actionable** and the
 * confidence isn't: a placeholder means camp the cycle rather than the named, a walker means the
 * padding is the fix, and arriving late means kill it promptly a few times and the figure tightens
 * itself. This is the one place the app says out loud that a spawn timer is a soft thing.
 */
export function respawnCaveat(respawn: Respawn): string | null {
  if (!erratic(respawn)) return null;
  return "Gaps this far apart usually mean a placeholder cycle, a mob that wanders, or arriving late — treat it as a hint, and pad it.";
}
