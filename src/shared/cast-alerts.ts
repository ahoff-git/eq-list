/**
 * cast-alerts.ts — pure matching for the "a watched spell is being cast" alert.
 *
 * The log watcher already produces a `CastEvent` for every "<caster> begins casting
 * <spell>." line (see combat-parser.ts). This decides whether such a cast should raise a
 * dispel-prep alert: it's a match when alerts are on and an enabled watch's text is a
 * substring of the spell name (case-insensitive). Your own casts are skipped unless
 * `includeSelf` — you already know what you're casting.
 *
 * An alert is a call to action — "dispel, now" — so a cast that has already finished must
 * not raise one. Lines can arrive long after they were written (a log read from the top, a
 * replay), and a barrage of warnings about fights that ended hours ago is worse than silence,
 * so anything older than `LIVE_WITHIN_MS` is ignored.
 *
 * No I/O, no state: a black box the main process feeds and tests pin down. (Note it can
 * only match casts the log *names*; generic "begins to cast a spell" lines carry no name.)
 */
import { SELF } from "./combat-parser";
import type { CastEvent, CastAlertSettings, CastWatch } from "./types";

/**
 * How recent a cast has to be to be worth warning about. Generous next to a cast time, tight
 * next to any replay: the watcher polls twice a second, so a live cast is always well inside.
 */
export const LIVE_WITHIN_MS = 30_000;

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
  const at = Date.parse(event.at);
  if (!Number.isNaN(at) && now - at > LIVE_WITHIN_MS) return null;
  const spell = event.spell.toLowerCase();
  for (const w of settings.watches) {
    if (!w.enabled) continue;
    const needle = w.spell.trim().toLowerCase();
    if (needle && spell.includes(needle)) return w;
  }
  return null;
}
