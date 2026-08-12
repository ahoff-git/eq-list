/**
 * fight-search.ts — "is this recorded fight one I'm looking for?".
 *
 * One rule, in one place, like `kill-filters.ts`: the history tab's search box asks main to
 * narrow the stored fights, and main owns the list — so the matching itself lives here, pure
 * and I/O-free, where it can be tested on its own and reused if another view ever needs it.
 *
 * What it searches is **what the fight is called and where it happened** — the two things a
 * player remembers about a fight from last week ("that Minotaur Lord in Steamfont"). Numbers
 * and timestamps are deliberately not searchable: they're what the list already sorts and
 * shows, and matching digits against damage totals would turn "10" into noise.
 */
import type { StoredFight } from "./types";

/**
 * Every whitespace-separated word must appear somewhere in the fight's name or zone, in any
 * order — so "coyote steam" finds the coyotes in Steamfont without knowing which field holds
 * which. Case-insensitive substring matching, as everywhere else in the app.
 *
 * An empty term matches everything: a filter with nothing in it filters nothing.
 */
export function fightMatches(fight: StoredFight, term: string): boolean {
  const words = searchWords(term);
  if (words.length === 0) return true;
  const haystack = `${fight.label} ${fight.zone ?? ""}`.toLowerCase();
  return words.every((w) => haystack.includes(w));
}

/** The term broken into the words that all have to match. Exported for the callers that count them. */
export function searchWords(term: string): string[] {
  return term.toLowerCase().split(/\s+/).filter(Boolean);
}
