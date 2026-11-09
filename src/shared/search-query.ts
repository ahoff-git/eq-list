/**
 * search-query.ts — what a typed search is allowed to be before anything searches with it.
 *
 * The fuzzy matcher the wiki and Lucy searches use costs about **0.9 ms per character of the query** over the 24,000
 * pages a real cache holds, and it runs on the main process — the same one that follows the game log and raises the
 * overlay's alerts. Nothing capped the query, so a 2 MB string (found by fuzzing the app's own API) held main at 100%
 * CPU for as long as it takes to finish, about half an hour, and a pasted 5,000-character line froze everything for four
 * seconds. No item, spell, zone or faction name is anywhere near a hundred characters.
 *
 * Two jobs, both at the edge: only a string is a query (a handler handed a number or `null` threw "term.trim is not a
 * function", which the caller sees as a rejected search), and only the first `MAX_QUERY_CHARS` of it count.
 *
 * See [ADR 0378](../../specs/decisions/0378-a-typed-search-is-capped-before-it-searches.md).
 */

/** Longer than any name in the game; short enough that a search stays a fraction of a second. */
export const MAX_QUERY_CHARS = 120;

/** `raw` as a query: a string, trimmed, and no longer than `max`. Anything that isn't a string is the empty query. */
export function cleanQuery(raw: unknown, max: number = MAX_QUERY_CHARS): string {
  if (typeof raw !== "string") return "";
  return (raw.length > max ? raw.slice(0, max) : raw).trim();
}
