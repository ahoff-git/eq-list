/**
 * log-search.ts — "every line of my log that mentions X", one line at a time.
 *
 * Pure: the caller feeds it lines in file order (`electron/log-search.ts` streams the file) and asks
 * for the answer at the end. No I/O here, so it is a black box a test can drive with a handful of
 * strings.
 *
 * The match is a case-insensitive substring of the **whole line, timestamp included** — so
 * "slain" finds every kill and "Aug 29 00:4" finds that ten minutes — which is what a person
 * scanning a log by eye is doing anyway. Only a matched line is parsed, to tag it with what the parser
 * read it as; parsing all 800k lines of a real log to filter them would cost the search most of its
 * time for an answer nobody asked for.
 *
 * Only the newest `limit` matches are kept (a ring, dropped from the oldest end), because a common
 * word matches tens of thousands of lines and nobody reads past the first screens of them; `total`
 * still counts them all so the list can say what it left out.
 */
import { splitLine } from "./log-parser";
import { isCombatEvent, parseSplitLine } from "./parse-line";
import type { LogSearchHit, LogSearchOptions, LogSearchResult } from "./types";

/** Matches sent back when the caller doesn't say — a few screens, and cheap to clone over IPC. */
export const LOG_SEARCH_LIMIT = 500;

/** Shorter than this matches too much of the log to be a search; the caller asks for more. */
export const LOG_SEARCH_MIN_CHARS = 2;

export interface LogSearch {
  /** One raw line of the file, with its 1-based line number. */
  feed(raw: string, line: number): void;
  /** The newest matches, newest first, and how many lines matched in all. */
  result(): Pick<LogSearchResult, "total" | "hits">;
}

export function createLogSearch(query: string, { combatOnly = false, limit = LOG_SEARCH_LIMIT }: LogSearchOptions = {}): LogSearch {
  const needle = query.trim().toLowerCase();
  const hits: LogSearchHit[] = [];
  let total = 0;

  return {
    feed(raw, line) {
      if (needle.length < LOG_SEARCH_MIN_CHARS || !raw.toLowerCase().includes(needle)) return;
      const split = splitLine(raw, line);
      if (!split) return; // a continuation or a blank — not a log line, so nothing to time it by
      const event = parseSplitLine(split);
      if (combatOnly && !(event && isCombatEvent(event))) return;
      total++;
      hits.push({ line, at: split.at, message: split.message, kind: event?.kind });
      if (hits.length > limit) hits.shift();
    },
    result: () => ({ total, hits: [...hits].reverse() }),
  };
}
