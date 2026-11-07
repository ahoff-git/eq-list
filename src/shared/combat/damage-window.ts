/**
 * damage-window.ts — which of the stored fights a "what is hitting me" reading is taken over.
 *
 * What hits you changes with where you are, so the reading is over a **window** the player picks, not
 * over all time ([ADR 0361](../../../specs/decisions/0361-damage-taken-is-read-over-a-window-and-priced-by-the-wikis-resist-rule.md)):
 *
 *   - **zone** — the fights since you last arrived where you are now. The default, and the one that
 *     answers "I'm somewhere new": the instant you zone, the window empties and the old advice goes.
 *   - **sitting** — the newest login's fights.
 *   - **recent** — everything the history search hands back (its own cap, newest first).
 *
 * Takes fights **newest first**, as the history search returns them. Pure — the tally is
 * `damage-profile.ts`.
 */
import { placeKey } from "../zones/place";
import type { StoredFight } from "../types";

export type DamageWindow = "zone" | "sitting" | "recent";

export const DAMAGE_WINDOWS: readonly { key: DamageWindow; label: string; hint: string; /** Finishes "…landed on you ___". */ phrase: string }[] = [
  { key: "zone", label: "This zone", phrase: "since you arrived here", hint: "Fights since you last arrived where you are now — the window empties when you zone, so the advice follows you" },
  { key: "sitting", label: "This sitting", phrase: "this sitting", hint: "Every fight since the newest login" },
  { key: "recent", label: "Recent fights", phrase: "in your recent fights", hint: "The newest fights on record, wherever they were" },
];

export const DEFAULT_DAMAGE_WINDOW: DamageWindow = "zone";

/**
 * The fights in `window`, newest first. `here` is the zone you're in now; without it (the log isn't
 * being watched) the zone window is the zone you last fought in.
 */
export function windowFights(fights: readonly StoredFight[], window: DamageWindow, here: string | null): StoredFight[] {
  if (window === "recent") return [...fights];
  if (window === "sitting") {
    const session = fights[0]?.sessionId;
    return session === undefined ? [] : fights.filter((f) => f.sessionId === session);
  }
  const where = here ?? fights[0]?.zone;
  if (!where) return [];
  const place = placeKey(where);
  // A leading run, not a filter: fights back in this zone from before you left it are another visit.
  const run: StoredFight[] = [];
  for (const f of fights) {
    if (!f.zone || placeKey(f.zone) !== place) break;
    run.push(f);
  }
  return run;
}
