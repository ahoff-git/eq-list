/**
 * faction-watch.ts — the raw-line watch a faction page's "🔔 Alert me" button adds
 * ([ADR 0193](../../specs/decisions/0193-a-faction-alert-rides-the-existing-line-watch.md)).
 *
 * No new event kind and no parser: `CastWatch.onLine` already matches a substring against whole log
 * lines (ADR 0050), which is exactly "tell me when the game says something about this faction".
 *
 * **`TRIGGER` is a best-effort guess, not a verified one.** Every other phrase this app matches was
 * checked against a real captured log line first — `specs/log-watching/README.md` names faction hits
 * as the one deliberately deferred gap. This ships ahead of that check because "faction standing" is
 * the near-universal EQ system-message opener, and a wrong guess here only costs a missed banner,
 * never a bad parse or a wrong shopping-list entry. Correct it (or replace this with a real
 * `FactionEvent` condition) the moment a real line is in hand.
 */
import type { CastWatch } from "./types";

const TRIGGER = "faction standing";

/**
 * Is this faction already watched? Judged by what the watch matches — an `onLine` rule with a `line`
 * condition naming this exact faction — the same way the watch library judges a rule already added
 * (`isAdded`, `watch-library.ts`): by behavior, not by id, so a page reopened after the watch was
 * added doesn't offer to add a second, identical one.
 */
export function isFactionWatched(watches: readonly CastWatch[], faction: string): boolean {
  return watches.some(
    (w) =>
      w.onLine &&
      w.spell === TRIGGER &&
      w.conditions?.some((c) => c.field === "line" && c.text === faction && !c.exclude),
  );
}

/** A new watch for one faction's standing, scoped by name so it never fires on another's. */
export function buildFactionWatch(faction: string): CastWatch {
  return {
    id: crypto.randomUUID(),
    spell: TRIGGER,
    enabled: true,
    onCast: false,
    onLine: true,
    conditions: [{ field: "line", op: "contains", text: faction }],
    message: `${faction} standing changed`,
  };
}
