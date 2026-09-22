/**
 * The one filter every small, static reference catalogue in this app narrows text by: does a name or
 * description contain every word typed, literally rather than fuzzily.
 *
 * `stances-invocations.ts` and `aa-list.ts` each wrote this same five lines by hand — same split,
 * same lowercase, same "every word must be found somewhere" rule, differing only in which fields they
 * joined into a haystack. Literal rather than fuzzy is the deliberate choice in both: a question like
 * "which AAs help direct damage" is "does the effect text contain these words", not a ranked
 * autocomplete guess, and with a class/category filter already narrowing what's shown, cutting the
 * list is what's needed, not scoring it (`fuzzy.ts` is the module for when scoring *is* the point —
 * a search box over thousands of item/spell names that are easy to misspell).
 *
 * Deliberately not applied to `item-search.ts`/`spell-search.ts`'s own, older `matchesText` — those
 * are settled, tested black boxes with no reason to change, not a third copy of this rule.
 */

/** Does `haystack` contain every whitespace-separated word of `query`, case-insensitively? An empty
 *  (or all-whitespace) query matches everything — "don't narrow" reads as passing every row, the same
 *  convention a blank class/category filter uses. */
export function matchesWords(haystack: string, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = haystack.toLowerCase();
  return words.every((w) => hay.includes(w));
}
