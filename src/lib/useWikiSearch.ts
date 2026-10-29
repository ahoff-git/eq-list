"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { createLogger } from "@/shared/logging";
import type { SearchResult } from "@/shared/types";

const log = createLogger("wiki-search");

/** How long to sit on a keystroke before asking the wiki — same rhythm as the Search tab. */
const SEARCH_DEBOUNCE_MS = 200;

/** Below this a query matches nearly everything, so it's not worth asking. */
export const MIN_QUERY_CHARS = 2;

/**
 * The wiki's title matches for what's typed, once typing has settled: one request per settled
 * query rather than one per keystroke, and a stale answer never overwrites a newer one. Returns the
 * settled query too, since a caller's other lookups (Lucy's) key off the same moment.
 */
export function useWikiSearch(text: string): { hits: SearchResult[]; settled: string } {
  const [settled, setSettled] = useState("");
  useEffect(() => {
    const next = text.trim().length >= MIN_QUERY_CHARS ? text : "";
    if (!next) {
      setSettled("");
      return;
    }
    const id = setTimeout(() => setSettled(next), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [text]);

  const [hits, setHits] = useState<SearchResult[]>([]);
  useEffect(() => {
    const a = api();
    if (!a || !settled) {
      setHits([]);
      return;
    }
    let cancelled = false;
    void a.wiki.search(settled).then((res) => {
      if (cancelled) return;
      log.debug("wiki hits", settled, res.length);
      setHits(res);
    });
    return () => {
      cancelled = true;
    };
  }, [settled]);

  return { hits, settled };
}
