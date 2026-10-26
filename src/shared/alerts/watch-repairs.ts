/**
 * watch-repairs.ts — mend copies of a library rule that shipped wrong.
 *
 * A rule added from the library is a **copy** in your settings, so fixing the library mends nobody who
 * already has it. Only an untouched copy is mended: one whose conditions are still exactly what the
 * library once shipped. A copy you've edited is yours, and the panel shows its conditions to change.
 *
 * Pure; the settings file handling is `electron/migrations.ts`. Idempotent by construction — a mended
 * copy no longer looks like the broken one.
 */
import type { CastWatch, WatchCondition } from "../types";
import { TELL_LINE } from "./watch-library";

/** What the "A tell, minus the noise" rule shipped with before it matched the tell's shape. */
const OLD_TELL: WatchCondition[] = [
  { field: "line", op: "starts", text: "You tell", exclude: true },
  { field: "line", op: "contains", text: "auction", exclude: true },
];

/** …and what it ships with now. */
const NEW_TELL: WatchCondition[] = [
  { field: "line", op: "regex", text: TELL_LINE },
  { field: "line", op: "contains", text: "auction", exclude: true },
];

/** The same conditions, in any order — what the panel shows doesn't depend on order, so neither does this. */
function sameConditions(a: WatchCondition[] = [], b: WatchCondition[]): boolean {
  const key = (c: WatchCondition) => `${c.field}|${c.op}|${c.text.toLowerCase()}|${!!c.exclude}`;
  return a.length === b.length && a.map(key).sort().join("\n") === b.map(key).sort().join("\n");
}

/** An untouched copy of the old tell rule. */
function isOldTell(w: CastWatch): boolean {
  return w.spell.trim().toLowerCase() === "tells you" && !!w.onLine && (w.match ?? "all") === "all" && sameConditions(w.conditions, OLD_TELL);
}

/** The watches with every untouched old tell rule mended, and how many were. */
export function repairTellRules(watches: CastWatch[]): { watches: CastWatch[]; repaired: number } {
  let repaired = 0;
  const next = watches.map((w) => {
    if (!isOldTell(w)) return w;
    repaired += 1;
    return { ...w, conditions: NEW_TELL.map((c) => ({ ...c })) };
  });
  return { watches: repaired ? next : watches, repaired };
}
