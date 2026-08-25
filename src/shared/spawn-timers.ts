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
 * And one that does the opposite, which is why it is handled rather than tolerated: **changing the
 * instance difficulty respawns everything.** That makes a gap arbitrarily *short* for a reason that
 * has nothing to do with the mob — the one kind of error a bound that only falls can never recover
 * from — so such a gap is thrown out entirely (see `learnRespawns`).
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
 *   - **And there is exactly one lower bound, which only the player can give.** Saying a mob is
 *     *not* up yet proves `R >` that, so it ratchets *upward* — the only figure here that does. It
 *     sets the earliest the window may open, and where it passes the estimate it proves the estimate
 *     wrong rather than merely soft (`contradicted`).
 *   - **And the player owns the padding.** We refuse to invent a lower bound for the window —
 *     there is no observation that could support one — so how early to start watching is a number
 *     the person at the camp sets, per mob, because they know whether this one walks.
 *
 * Pure: no clock of its own, no I/O, no timers. `now` arrives as an argument wherever it's needed,
 * so an eight-hour countdown is tested in a millisecond. The holder that actually waits, persists a
 * due time and raises the alert is [electron/spawn-tracker.ts](../../electron/spawn-tracker.ts).
 */
import { mobKey } from "./mob-stats";
import {
  confidenceOf,
  contradicts,
  disagrees,
  plausible,
  settle,
  tighten,
  tightestOf,
  type Confidence,
  type SampleScale,
} from "./estimates";
import { formatDuration, parseDuration, UNIT_SECONDS } from "./duration";
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
 * What an observation has to fall inside to count — the two constants above, as the shape
 * `estimates.plausible` takes. Every kind of evidence here is checked against it: a kill gap, a
 * sighting and a "not up yet" are all claims about the same quantity, and a floor that let one of
 * them through on different terms would be a hole in the ratchet.
 */
export const RESPAWN_RANGE = { min: MIN_RESPAWN_SECONDS, max: MAX_RESPAWN_SECONDS };

/**
 * When a respawn stops being an anecdote. Lower than a drop rate's, and deliberately: a rate needs
 * dozens of kills before it means anything, while three independent gaps agreeing about a timer is
 * genuinely worth acting on.
 */
export const RESPAWN_SAMPLES: SampleScale = { fair: 3, solid: 8 };

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
 * The longest a **hand-made** timer may be. A week, because the things a player times by hand that
 * aren't respawns are lockouts and reset windows, and those are measured in days
 * ([ADR 0135](../../specs/decisions/0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)).
 *
 * Deliberately looser than `MAX_RESPAWN_SECONDS`, which bounds what we'll believe about a *mob* —
 * two ceilings because they answer different questions. "Is this a plausible respawn?" is a claim
 * about the world we could be wrong about; "how long is this egg timer?" is whatever the player says.
 */
export const MAX_TIMER_SECONDS = 7 * 24 * SECONDS_PER_HOUR;

/**
 * How many countdowns one camp may run at once (ADR 0135). A camp with placeholders wants several —
 * that's the whole point — but a `queue` camp left on in a busy zone would otherwise fill the board,
 * so the number is bounded rather than trusted, exactly as `MAX_REPEAT` is for an alert.
 */
export const MAX_CAMP_TIMERS = 8;

/**
 * A typed interval, in whole seconds — `0` for blank, `null` for text we can't read.
 *
 * The inverse of `formatDuration`, and **not** `parseDelay`: a cue tops out at thirty minutes and
 * knows no unit longer than a minute, so borrowing it here refused a typed `4h` outright and turned
 * a typed `240m` into 30m without saying so (ADR 0135). Hours and days are the units this feature is
 * actually about.
 */
export function parseInterval(text: string | null | undefined): number | null {
  return parseDuration(text, { units: ["s", "m", "h", "d"], max: MAX_TIMER_SECONDS });
}

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

/**
 * Is this timer's camp in this place? `place` is a `placeKey`, not a zone name.
 *
 * Here rather than an `endsWith("|" + place)` at the call site, because the `|` convention is this
 * module's and a caller that knows it is a second copy of the key format waiting to disagree.
 */
export function timerInPlace(key: string, place: string): boolean {
  return key.slice(key.indexOf("|") + 1) === place;
}

/** Is this timer's camp about this mob? `mob` is a `mobKey`. For the same reason as above. */
export function timerForMob(key: string, mob: string): boolean {
  return key.slice(0, key.indexOf("|")) === mob;
}

/**
 * The identity of one **countdown**: its camp and which of that camp's clocks it is (ADR 0135).
 *
 * Slots are reused as clocks come and go, so `#2` is only ever "the second one currently running" —
 * a label to click and to tell two identical rows apart, never a claim about a spawn point.
 */
export function timerId(key: string, slot: number): string {
  return `${key}#${slot}`;
}

/** Which clock of its camp this is, from its id. `1` for anything we can't read a slot out of. */
export function timerSlot(id: string): number {
  const slot = Number(id.slice(id.lastIndexOf("#") + 1));
  return Number.isInteger(slot) && slot > 0 ? slot : 1;
}

/**
 * One measured gap between two consecutive kills — the unit the estimate is actually built from.
 *
 * Listed so a single bad one can be thrown out. Before this the finest tool was `relearn`, which
 * draws a line under *everything* measured so far: right for "this camp's history is nonsense",
 * far too blunt for "that one gap was me pulling the placeholder by mistake".
 */
export interface RespawnGap {
  /**
   * The two kill moments it spans. Derived rather than stored, so it stays stable across a re-read
   * of the log — and an exclusion whose pair stops being consecutive (an import dropped a kill
   * between them) simply goes inert rather than silently excluding some *other* gap.
   */
  id: string;
  seconds: number;
  /** The later of the two kills, which is what a reader recognises the gap by. */
  endedAt: string;
  /** Thrown out by the player. Still listed — an exclusion you can't see is one you can't undo. */
  dropped: boolean;
}

/** The identity of a gap: the pair of kills it lies between. */
export function gapId(beforeAt: number, afterAt: number): string {
  return `${new Date(beforeAt).toISOString()}|${new Date(afterAt).toISOString()}`;
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
  /**
   * Every gap that counts, or would if the player hadn't dropped it — shortest first, since the
   * shortest *is* the estimate and is the one anybody opening this list came to look at.
   *
   * Gaps that were never evidence (outside the plausible bounds, spanning a difficulty change,
   * before a relearn cutoff) are absent rather than listed as excluded: they are not decisions
   * anybody made and nothing can be done about them.
   */
  gaps: RespawnGap[];
}

/** How the caller narrows what counts as evidence. Both are the player's own corrections. */
export interface LearnOptions {
  /** Ignore every gap *beginning* before this moment, per timer — the relearn cutoff. */
  relearnedAt?: (key: string) => number | undefined;
  /** Has the player thrown this particular gap out? */
  isDropped?: (key: string, id: string) => boolean;
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
 * `options.isDropped` throws out **one** gap: the finest correction available, for the pull that was
 * really the placeholder or the evening two people were killing it. Everything else about that camp
 * survives, which is what `relearnedAt` below cannot offer.
 *
 * `options.relearnedAt` is the way back up from a bound that only ever falls: a timer told to start over
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
  options: LearnOptions = {},
): RespawnLearning[] {
  const { relearnedAt, isDropped } = options;
  const groups = new Map<string, { mob: string; zone: string; kills: { at: number; zone: string }[] }>();

  for (const k of kills) {
    if (!k.zone || k.sharedBy) continue;
    if (!isNamed(mobKey(k.mob))) continue;
    const at = Date.parse(k.at);
    if (Number.isNaN(at)) continue;
    const key = timerKey(k.mob, k.zone);
    const group = groups.get(key);
    // The zone is carried **as the log wrote it**, difficulty and all, even though the group folds
    // the variants together — see the gap rule below for why the raw string has to survive.
    if (group) group.kills.push({ at, zone: k.zone });
    else groups.set(key, { mob: k.mob, zone: k.zone, kills: [{ at, zone: k.zone }] });
  }

  const learned: RespawnLearning[] = [];
  for (const [key, { mob, zone, kills: group }] of groups) {
    // Records arrive in log order, but an imported log can interleave with live kills — so sort
    // rather than assume, since a negative gap would read as a wildly short respawn.
    group.sort((a, b) => a.at - b.at);
    const since = relearnedAt?.(key);
    let shortest: number | undefined;
    let longest: number | undefined;
    let samples = 0;
    const gaps: RespawnGap[] = [];
    for (let i = 1; i < group.length; i += 1) {
      const [before, after] = [group[i - 1], group[i]];
      // A gap that *starts* before the reset is evidence from the period being thrown away, even
      // if it ends after it.
      if (since !== undefined && before.at < since) continue;
      // **Changing the instance difficulty respawns everything**, so a gap whose two ends were
      // recorded in different variants of the zone measures the difficulty change, not the mob.
      // Left in, it is the worst kind of sample: arbitrarily short, and permanent against a bound
      // that only ever falls.
      //
      // Compared **verbatim** rather than folded, which is the one thing the raw zone is kept for.
      // `timerKey` deliberately groups the variants into one camp (ADR 0083) — Lower Guk is Lower
      // Guk — so by the time a gap is being measured the difference is invisible unless it was
      // carried this far. `kill-log.ts` makes the same exception for the same reason, about which
      // `/loc` fix may place a kill (ADR 0059).
      if (before.zone !== after.zone) continue;
      const gap = Math.round((after.at - before.at) / MS_PER_SECOND);
      // Implausible on either side is discarded, never clamped: see the ratchet note up top.
      if (!plausible(gap, RESPAWN_RANGE)) continue;
      const id = gapId(before.at, after.at);
      const dropped = !!isDropped?.(key, id);
      gaps.push({ id, seconds: gap, endedAt: new Date(after.at).toISOString(), dropped });
      if (dropped) continue;
      samples += 1;
      shortest = tighten(shortest, gap, "upper");
      longest = tighten(longest, gap, "lower");
    }
    // Shortest first: the shortest gap *is* the figure, so it is what anyone opening the list came
    // to check. Ties keep the later one first, which is the one still fresh in mind.
    gaps.sort((a, b) => a.seconds - b.seconds || b.endedAt.localeCompare(a.endedAt));
    learned.push({
      key,
      mob,
      place: placeName(zone),
      shortestSeconds: shortest,
      longestSeconds: longest,
      samples,
      lastKillAt: new Date(group[group.length - 1].at).toISOString(),
      gaps,
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

/**
 * What standing at the camp and saying it is **not** up has taught: the longest confirmed "not yet",
 * and how many times you've said so.
 *
 * The mirror of a sighting, and the only **lower** bound this app has. `R > (when you said so) −
 * (when it died)`, so it ratchets *upward* where everything else ratchets down.
 *
 * [ADR 0094](../../specs/decisions/0094-a-spawn-timer-is-a-window-not-an-instant.md) refused to invent
 * a lower bound because no observation could support one, and
 * [ADR 0097](../../specs/decisions/0097-a-sighting-is-the-tightest-evidence-there-is.md) refused to
 * read *silence* as one — the mob may be up and out of sight, which is the wandering problem. Both
 * still hold. This is neither: it is the player **asserting** a negative about a camp they are
 * sitting in, which is a thing only they can know and exactly the kind of judgement the rest of the
 * feature already trusts them for.
 */
export interface Floor {
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
  /**
   * The tightest **lower** bound: you stood there and said it wasn't up yet. Not part of the
   * estimate — which is a by-time and only ever falls — but it says the window cannot open before
   * this, and if it reaches `seconds` the evidence is contradicting itself (`contradicted`).
   */
  floorSeconds?: number;
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
  floor?: Floor,
): Respawn | undefined {
  const withFloor = (r: Respawn | undefined): Respawn | undefined =>
    r && floor && floor.seconds > 0 ? { ...r, floorSeconds: floor.seconds } : r;

  // Both observed figures are **upper** bounds on the same quantity, so the tighter is simply the
  // better one — `tightestOf` is the shared rule, and it carries which source won because "seen up
  // three times" and "from three kill gaps" are worth different amounts to a reader. A sighting is
  // listed first so it takes a tie: it excludes the time spent reaching and killing the mob. It is
  // *not* otherwise privileged — a kill gap that came in tighter is a real bound, and preferring
  // the sighting anyway would be discarding evidence to protect a label.
  const best = tightestOf<Respawn>([
    seen && seen.seconds > 0
      ? { value: seen.seconds, source: { seconds: seen.seconds, source: "seen", samples: seen.count } }
      : undefined,
    learned?.shortestSeconds === undefined
      ? undefined
      : {
          value: learned.shortestSeconds,
          source: {
            seconds: learned.shortestSeconds,
            source: "killed",
            samples: learned.samples,
            spreadSeconds: learned.longestSeconds,
          },
        },
  ]);

  // What the player typed outranks all of it, and never destroys it: `best` is still computed, so
  // clearing the override restores the inference rather than leaving a blank.
  const chosen = settle(stated, best?.source.seconds);
  if (!chosen) return undefined;
  return withFloor(
    chosen.stated ? { seconds: chosen.value, source: "stated", samples: 0 } : best!.source,
  );
}

/**
 * Does the evidence disagree with itself? A floor at or above the by-time says the mob provably had
 * *not* spawned by a moment the estimate claims it must have.
 *
 * Reported rather than resolved. One of the two is wrong — a mis-clicked sighting, a placeholder
 * cycle, or a "not up" from a camp the mob had wandered out of — and which one is a judgement about
 * an evening the app did not attend. Picking for the player would mean silently discarding a real
 * observation; saying so puts them one click from dropping whichever they know to be wrong.
 */
export function contradicted(respawn: Respawn): boolean {
  return contradicts(respawn.seconds, respawn.floorSeconds);
}

/** How much a learned figure is worth, on this feature's own scale. */
export function respawnConfidence(respawn: Respawn): Confidence {
  return respawn.source === "stated" ? "solid" : confidenceOf(respawn.samples, RESPAWN_SAMPLES);
}

/**
 * What a "not up yet" at `atMs` says about a mob that died at `killedAt`, or `null` when it says
 * nothing usable. Bounded exactly like a sighting, and for the same reasons.
 */
export function floorFrom(killedAt: string, atMs: number): number | null {
  return sinceDeath(killedAt, atMs);
}

/** Fold a fresh "not yet" into what earlier ones taught — the **longest** wins, and the count grows. */
export function raiseFloor(floor: Floor | undefined, seconds: number): Floor {
  return { seconds: tighten(floor?.seconds, seconds, "lower"), count: (floor?.count ?? 0) + 1 };
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
  if (respawn.source !== "killed") return false;
  return disagrees(respawn.seconds, respawn.spreadSeconds, ERRATIC_RATIO);
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
  return sinceDeath(killedAt, seenAtMs);
}

/**
 * Seconds between a death and a moment, when that is a usable observation — the shared body of
 * `sightingFrom` and `floorFrom`, which differ only in which direction they then ratchet.
 */
function sinceDeath(killedAt: string, atMs: number): number | null {
  const died = Date.parse(killedAt);
  if (Number.isNaN(died)) return null;
  const seconds = Math.round((atMs - died) / MS_PER_SECOND);
  return plausible(seconds, RESPAWN_RANGE) ? seconds : null;
}

/** Fold a fresh sighting into what earlier ones taught — the shortest wins, and the count grows. */
export function tightenSighting(seen: Sighting | undefined, seconds: number): Sighting {
  return { seconds: tighten(seen?.seconds, seconds, "upper"), count: (seen?.count ?? 0) + 1 };
}

/** A countdown: one death, in one place, with a window we expect the mob back in. */
export interface SpawnTimer {
  /**
   * This countdown's own identity, `key#slot` — because a camp may be running several at once
   * ([ADR 0135](../../specs/decisions/0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)).
   *
   * The **slot** is a small number reused as clocks come and go, which is what lets two rows for one
   * name be told apart on screen and in a click. It says nothing about *which* spawn point this is:
   * the clocks are anonymous and interchangeable, and that is exactly what makes killing any
   * placeholder able to start any of them.
   */
  id: string;
  /** The camp: one mob, one place. What is *learned and configured* is keyed by this, not by `id`. */
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
  slot = 1,
): SpawnTimer | null {
  const at = Date.parse(killedAt);
  if (Number.isNaN(at)) return null;
  // Clamped rather than refused, and never past the kill itself: a window that opened before the
  // mob died would be permanently open, which is the one setting that says nothing at all.
  const padding = Math.min(Math.max(Math.round(lead), 0), Math.min(respawn.seconds, MAX_LEAD_SECONDS));
  const due = at + respawn.seconds * MS_PER_SECOND;
  // **A measured floor overrules the padding.** You stood there and said it had not spawned yet, so
  // watching earlier than that is watching for something you have proof was not there — which is
  // the one thing padding was never able to know
  // ([ADR 0094](../../specs/decisions/0094-a-spawn-timer-is-a-window-not-an-instant.md) refused to
  // invent this number precisely because no observation supported it; now one does). It can only
  // ever move the window *later*, never past the by-time.
  const opens = due - padding * MS_PER_SECOND;
  const floorAt = respawn.floorSeconds ? at + respawn.floorSeconds * MS_PER_SECOND : opens;
  const watchFrom = Math.min(Math.max(opens, floorAt), due);
  return {
    id: timerId(learning.key, slot),
    key: learning.key,
    mob: learning.mob,
    place: learning.place,
    killedAt,
    watchFrom: new Date(watchFrom).toISOString(),
    dueAt: new Date(due).toISOString(),
    seconds: respawn.seconds,
    source: respawn.source,
    samples: respawn.samples,
    spreadSeconds: respawn.spreadSeconds,
    lead: padding,
  };
}

/**
 * The same timer, advanced to its next **future** moment — for a repeating one that came due while
 * nobody was looking.
 *
 * Chained from the by-time rather than restarted from now, so a timer that has run all afternoon is
 * still on its original beat instead of drifting by however long it took anyone to notice. Whole
 * intervals only, and it never announces the cycles it skipped: an alert about something that
 * happened three hours ago is the opposite of what an overlay is for (ADR 0092), and rolling forward
 * silently is that rule applied to a clock that repeats.
 *
 * Returns the timer unchanged when it isn't overdue, so a caller can apply it unconditionally.
 */
export function rollForward(timer: SpawnTimer, nowMs: number): SpawnTimer {
  const period = Math.round(timer.seconds) * MS_PER_SECOND;
  const due = Date.parse(timer.dueAt);
  if (!period || Number.isNaN(due) || due > nowMs) return timer;
  // One arithmetic step rather than a loop: an app closed for a week must not walk a 30-second
  // timer forward twenty thousand times to work out where it would be.
  const cycles = Math.floor((nowMs - due) / period) + 1;
  const shift = cycles * period;
  const started = Date.parse(timer.killedAt);
  const opens = Date.parse(timer.watchFrom);
  return {
    ...timer,
    killedAt: Number.isNaN(started) ? timer.killedAt : new Date(started + shift).toISOString(),
    watchFrom: Number.isNaN(opens) ? timer.watchFrom : new Date(opens + shift).toISOString(),
    dueAt: new Date(due + shift).toISOString(),
    // A repeat is a fresh clock, so a sighting of the last one says nothing about this one.
    seenAt: undefined,
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
  // Past a day the figure is a hand-typed one — a lockout, a reset window — and `formatDuration`
  // already says those the way they're typed. Below it the rounding above is the point, so the two
  // are not interchangeable and this is a threshold rather than a delegation everywhere.
  if (total >= UNIT_SECONDS.d) return formatDuration(Math.round(total / SECONDS_PER_MINUTE) * SECONDS_PER_MINUTE);
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
  // The contradiction leads: it is the stronger statement of the two, and unlike a wide spread it
  // says something is provably *wrong* rather than merely soft.
  if (contradicted(respawn)) {
    return `You've seen it still down at ${formatInterval(respawn.floorSeconds ?? 0)}, which is past this figure — so one of them is wrong. A mis-clicked sighting, a placeholder cycle, or it had wandered off. Drop whichever you don't believe under Evidence.`;
  }
  if (!erratic(respawn)) return null;
  return "Gaps this far apart usually mean a placeholder cycle, a mob that wanders, or arriving late — treat it as a hint, and pad it.";
}
