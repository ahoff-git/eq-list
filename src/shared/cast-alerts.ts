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
 * No I/O, no state: a black box the main process feeds and tests pin down. (Note it can
 * only match casts the log *names*; generic "begins to cast a spell" lines carry no name.)
 */
import { SELF } from "./combat-parser";
import type { AlertStyle, BuffFadedEvent, CastEvent, CastAlertSettings, CastWatch, LogLine } from "./types";

/**
 * The style an alert should use: the watch's overrides laid over the defaults, field by field.
 *
 * Resolved **here**, at the moment of the alert, and sent with it — rather than letting the
 * overlay read the settings itself. The overlay would only know the defaults, so a watch's own
 * color would never reach the screen; and an alert already on screen shouldn't restyle itself
 * because a later alert had different ideas.
 */
export function alertStyle(settings: CastAlertSettings, watch?: CastWatch | null): AlertStyle {
  const base: AlertStyle = {
    sound: settings.sound,
    flash: settings.flash,
    color: settings.color,
    soundName: settings.soundName,
    position: settings.position,
    durationMs: settings.durationMs,
    animation: settings.animation,
  };
  const over = watch?.style;
  if (!over) return base;
  // Only the keys the watch actually set: `{ color: undefined }` must not blank out a default.
  const set = Object.fromEntries(Object.entries(over).filter(([, v]) => v !== undefined));
  return { ...base, ...set };
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
  return caster !== SELF && !/^(?:an?|the)\s/i.test(caster);
}

/** The watch a cast matches (first enabled one whose text is in the spell name), or null. */
export function matchCast(
  event: Pick<CastEvent, "caster" | "spell" | "at">,
  settings: CastAlertSettings,
  now: number = Date.now(),
): CastWatch | null {
  if (!settings.enabled) return null;
  if (event.caster === SELF && !settings.includeSelf) return null;
  // An unreadable timestamp can't be judged stale, so it's allowed through: missing an alert
  // is the worse failure of the two.
  if (stale(event.at, now)) return null;
  const named = isNamedCaster(event.caster);
  const spell = event.spell.toLowerCase();
  for (const w of settings.watches) {
    if (!w.enabled) continue;
    // Unset means on: every watch that predates the choice is a cast watch.
    if (w.onCast === false) continue;
    // A named caster (player / pet / named NPC) only fires a watch that opted them in.
    if (named && !w.includePlayers) continue;
    if (matchesWatch(w, spell)) return w;
  }
  return null;
}

/** Is this watch's text in what it was pointed at — a spell name, or a whole line? (Both lowercased.) */
function matchesWatch(w: CastWatch, text: string): boolean {
  const needle = w.spell.trim().toLowerCase();
  return !!needle && text.includes(needle);
}

/** Too old to act on — the same liveness rule casts get, for the same reason. */
function stale(at: string, now: number): boolean {
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
  event: Pick<BuffFadedEvent, "spell" | "at">,
  settings: CastAlertSettings,
  now: number = Date.now(),
): CastWatch | null {
  if (!settings.enabled) return null;
  if (stale(event.at, now)) return null;
  const spell = event.spell.toLowerCase();
  for (const w of settings.watches) {
    if (!w.enabled || !w.onFade) continue;
    if (matchesWatch(w, spell)) return w;
  }
  return null;
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
): CastWatch | null {
  if (!settings.enabled) return null;
  if (stale(line.at, now)) return null;
  const message = line.message.toLowerCase();
  for (const w of settings.watches) {
    if (!w.enabled || !w.onLine) continue;
    if (matchesWatch(w, message)) return w;
  }
  return null;
}

/** Does any enabled watch look at raw lines? Lets a caller skip the work when none does. */
export function watchesLines(settings: CastAlertSettings): boolean {
  return settings.enabled && settings.watches.some((w) => w.enabled && w.onLine && !!w.spell.trim());
}
