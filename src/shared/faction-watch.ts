/**
 * faction-watch.ts — the raw-line watch a faction page's "🔔 Alert me" button adds
 * ([ADR 0193](../../specs/decisions/0193-a-faction-alert-rides-the-existing-line-watch.md)).
 *
 * No new event kind and no parser: `CastWatch.onLine` already matches a substring against whole log
 * lines (ADR 0050), which is exactly "tell me when the game says something about this faction".
 *
 * **`TRIGGER` was a best-effort guess and is now a verified one.** ADR 0193 shipped this ahead of a
 * real captured line, on the bet that "faction standing" is the near-universal EQ system-message
 * opener; a real log has since confirmed the bet was right (`specs/log-parser.ts`'s
 * `parseFactionChange`, [ADR 0218](../../specs/decisions/0218-a-faction-hit-is-parsed-not-only-watched.md)
 * reads the same wording structurally). Left as a raw-line watch anyway rather than rebuilt on top
 * of `FactionEvent`: this is a **banner**, and the structured event's own store
 * (`electron/faction-log.ts`) already gives a faction page everything a wired-up condition would —
 * every hit that's landed, and the net it comes to — without this alerting path needing to change.
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
