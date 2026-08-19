/**
 * cast-alerts.ts — pure matching for the "a watched spell is being cast" alert.
 *
 * The log watcher already produces a `CastEvent` for every "<caster> begins casting
 * <spell>." line (see combat-parser.ts). This decides whether such a cast should raise a
 * dispel-prep alert: it's a match when alerts are on and an enabled watch's text is a
 * substring of the spell name (case-insensitive). Your own casts are skipped unless
 * `includeSelf` — you already know what you're casting.
 *
 * A watch fires on ordinary **mobs** by default, but not on *named* casters — another player, a
 * pet, or a named NPC — because a groupmate casting Charm is not a threat to prep against. A
 * caster is "named" when its log name carries no article ("BunnySlayer", "Lord Nagafen"), as
 * opposed to a plain mob ("a gnoll"); a watch's `includePlayers` opts those back in. The article
 * heuristic is all the log gives us, so a *named boss* also needs `includePlayers` to alert —
 * an honest limit, and the toggle is right there.
 *
 * An alert is a call to action — "dispel, now" — so a cast that has already finished must
 * not raise one. Lines can arrive long after they were written (a log read from the top, a
 * replay), and a barrage of warnings about fights that ended hours ago is worse than silence,
 * so anything older than `LIVE_WITHIN_MS` is ignored.
 *
 * A watch can also be pointed at the **raw log line** instead of a spell name (`onLine`), which is
 * how "BunnySlayer invites you to a party" raises an alert without a parser and an event kind for
 * every sentence the game can print. Same list, same styles, same overlay.
 *
 * Past the trigger, a watch may carry **conditions** — "not from a warder", "only in Lower Guk",
 * "either spelling". Those are [watch-conditions.ts](./watch-conditions.ts)'s business, not this
 * file's: everything here is about *the event* (whose cast may fire a watch, how recent it must be,
 * which kind of prompt it is), and everything there is about *the watch*. What joins them is the
 * `WatchSubject` each matcher builds — the same fields whatever kind of line it came from.
 *
 * Three neighbours own the rest of an alert, and none of it is here: *when* it speaks is
 * [alert-schedule.ts](./alert-schedule.ts), *how it looks* is [alert-styles.ts](./alert-styles.ts),
 * and *what the banner says* is built where the alert is raised (`electron/alert-router.ts`).
 *
 * No I/O, no state: a black box the main process feeds and tests pin down. (Note it can
 * only match casts the log *names*; generic "begins to cast a spell" lines carry no name.)
 */
import { SELF } from "./combat-parser";
import { hasArticle } from "./log-parser";
import { conditionsHold, watchSpeaks, type WatchSubject } from "./watch-conditions";
import type { BuffFadedEvent, CastEvent, CastAlertSettings, CastWatch, LogLine } from "./types";

/**
 * What the app knows that the line doesn't. Passed in rather than read, because this file has no
 * state — and optional, because a caller that doesn't track the zone simply has no zone conditions.
 */
export interface MatchContext {
  /** The zone you're in, for a `zone` condition. `null` — not zoned in yet — reads as no zone. */
  zone?: string | null;
}

/**
 * How recent a cast has to be to be worth warning about. Generous next to a cast time, tight
 * next to any replay: the watcher polls twice a second, so a live cast is always well inside.
 */
export const LIVE_WITHIN_MS = 30_000;

/**
 * A caster is "named" — a player, pet, or named NPC rather than a plain mob — when its (already
 * article-folded) log name has no leading "a/an/the". Self is never named (it's handled by
 * `includeSelf`). This is the only player-vs-mob signal a single cast line offers.
 */
function isNamedCaster(caster: string): boolean {
  return caster !== SELF && !hasArticle(caster);
}

/** The watch a cast matches (the first enabled one it satisfies), or null. */
export function matchCast(
  event: Pick<CastEvent, "caster" | "spell" | "at"> & Partial<Pick<CastEvent, "raw">>,
  settings: CastAlertSettings,
  now: number = Date.now(),
  context: MatchContext = {},
): CastWatch | null {
  if (!settings.enabled) return null;
  // An unreadable timestamp can't be judged stale, so it's allowed through: missing an alert
  // is the worse failure of the two.
  if (stale(event.at, now)) return null;
  const self = event.caster === SELF;
  const named = isNamedCaster(event.caster);
  const subject = subjectOf(event.spell, event, context, { caster: event.caster });
  return firstWatch(settings, subject, (w) => {
    // Unset means on: every watch that predates the choice is a cast watch.
    if (w.onCast === false) return false;
    // Your own casts: the watch's own answer if it gave one, otherwise the group's. Per watch
    // because a "recast it" cue is *only* ever about your own casting.
    if (self) return w.includeSelf ?? settings.includeSelf;
    // A named caster (player / pet / named NPC) only fires a watch that opted them in.
    return !named || !!w.includePlayers;
  });
}

/**
 * What the log said, as conditions read it. `text` is whatever this kind of event offers the
 * trigger; `line` is always the sentence it came from, so a `line` condition works even on an event
 * the parser modelled.
 */
function subjectOf(
  text: string,
  event: { raw?: string },
  context: MatchContext,
  extra: Partial<WatchSubject> = {},
): WatchSubject {
  return { subject: text, line: event.raw ?? text, zone: context.zone, ...extra };
}

/**
 * The first enabled watch that this subject satisfies — the shared spine of all three matchers.
 *
 * `wants` is the part each matcher owns: which watches are even eligible for this kind of event.
 * Everything after it is common, which is what keeps a condition behaving identically whether the
 * line was a cast, a fade or something no parser models.
 */
function firstWatch(
  settings: CastAlertSettings,
  subject: WatchSubject,
  wants: (w: CastWatch) => boolean,
): CastWatch | null {
  for (const w of settings.watches) {
    if (!w.enabled || !wants(w)) continue;
    if (!watchSpeaks(w)) continue; // a blank watch matches nothing, however it got that way
    if (conditionsHold(w, subject, triggerHit(w, subject.subject))) return w;
  }
  return null;
}

/**
 * Does the watch's own trigger text appear in what it was pointed at? `null` when the trigger is
 * blank — a watch may now be nothing but conditions, and a blank trigger has to step aside for them
 * rather than fail them (see `conditionsHold`).
 */
function triggerHit(w: CastWatch, text: string): boolean | null {
  const needle = w.spell.trim().toLowerCase();
  if (!needle) return null;
  return text.toLowerCase().includes(needle);
}

/**
 * Too old to act on — the same liveness rule casts get, for the same reason.
 *
 * Exported because it is not really about casting: **everything logged while the app was shut is fed
 * through the live path**, so any alert raised from a log line has to ask this question. The loot
 * alert (`alert-router.ts`) is the second caller, and it reuses this rather than keeping a "is the
 * log news yet" flag of its own.
 */
export function stale(at: string, now: number): boolean {
  const t = Date.parse(at);
  return !Number.isNaN(t) && now - t > LIVE_WITHIN_MS;
}

/**
 * The watch a *fade* matches (a watch with `onFade`, whose text is in the faded spell), or null.
 *
 * None of the caster rules apply here: a fade line has no caster, only the spell and — for one
 * you'd cast on something else — who it wore off. So `includeSelf`/`includePlayers` are
 * irrelevant, and a fade on you, on your pet and on your target are all reportable. What the
 * player asked for is the prompt itself: "your root is gone, re-root".
 *
 * One honest limit, and it's the common case rather than a corner: a fade **on you** is always
 * worded per spell ("The light breeze fades.", "The spirit of travel leaves you.") and names no
 * spell, because EQL never prints the generic "worn off." sentence for your own buffs. So a watch
 * for one has to hold the words the log used, not the spell's name — often the same word, and
 * where it isn't, the watch's `message` is what puts the real name back on the banner.
 */
export function matchFade(
  event: Pick<BuffFadedEvent, "spell" | "at"> & Partial<Pick<BuffFadedEvent, "target" | "pet" | "raw">>,
  settings: CastAlertSettings,
  now: number = Date.now(),
  context: MatchContext = {},
): CastWatch | null {
  if (!settings.enabled) return null;
  if (stale(event.at, now)) return null;
  // "your pet" rather than the pet's name, so a `target` condition reads the way the banner does.
  const target = event.pet ? "your pet" : event.target;
  const subject = subjectOf(event.spell, event, context, { target });
  return firstWatch(settings, subject, (w) => !!w.onFade);
}

/**
 * The watch a whole **log line** matches (a watch with `onLine`, whose text is in the line), or null.
 *
 * The line is matched with its timestamp already off, and *every* line is offered — including the
 * ones that also became a typed event — because a watch here is the player saying "tell me when the
 * game says this", and which lines the parsers happen to model is not their concern.
 *
 * None of the caster rules apply: a line names no caster we can classify, so `includeSelf` /
 * `includePlayers` are irrelevant. The liveness rule does, for the same reason as everywhere else —
 * a party invite from last night is not something to react to.
 */
export function matchLine(
  line: Pick<LogLine, "message" | "at">,
  settings: CastAlertSettings,
  now: number = Date.now(),
  context: MatchContext = {},
): CastWatch | null {
  if (!settings.enabled) return null;
  if (stale(line.at, now)) return null;
  return firstWatch(settings, lineSubject(line.message, context), (w) => !!w.onLine);
}

/**
 * A whole log line as a subject: it is both the thing the trigger reads and the line itself.
 *
 * Exported because a waiting cue is called off by the log's own words (`CastWatch.cancelWhen`), and
 * that check has to read a line exactly the way a line watch does — one definition, not two.
 */
export function lineSubject(message: string, context: MatchContext = {}): WatchSubject {
  return { subject: message, line: message, zone: context.zone };
}

/** Does any enabled watch look at raw lines? Lets a caller skip the work when none does. */
export function watchesLines(settings: CastAlertSettings): boolean {
  return settings.enabled && settings.watches.some((w) => w.enabled && w.onLine && watchSpeaks(w));
}
