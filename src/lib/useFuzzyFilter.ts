"use client";
import { useMemo, useState } from "react";
import { fuzzyRank } from "@/shared/fuzzy";

/**
 * useFuzzyFilter.ts — the query state and ranking behind every "type to narrow this list" search
 * box: the same typo-tolerant scorer the wiki search and the item/zone pickers already use
 * (`shared/fuzzy.ts`), rather than each tab inventing its own plain substring filter.
 *
 * Blank query is a no-op (the list passes through as given, in its own order) — searching only
 * ever narrows and re-ranks once you've actually typed something.
 */
export function useFuzzyFilter<T>(
  items: readonly T[],
  getText: (item: T) => string,
  opts: { minScore?: number } = {},
): { query: string; setQuery: (query: string) => void; filtered: T[] } {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return items as T[];
    return fuzzyRank(q, items, getText, { limit: items.length, minScore: opts.minScore }).map((m) => m.item);
  }, [items, query, getText, opts.minScore]);
  return { query, setQuery, filtered };
}
