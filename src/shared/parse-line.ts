/**
 * parse-line.ts — one raw log line in, at most one typed event out, in a single pass.
 *
 * This is the boundary where text stops being text. Everything downstream — the store,
 * the meter, the trackers — works on objects; nothing re-reads a line, and nothing else
 * needs to know that the log is a file of strings at all.
 *
 * Why it exists: the watcher used to hand the same raw string to every parser in turn,
 * and each one independently re-ran the timestamp regex before looking at the message.
 * On a real log that's up to seven splits of every line, thousands of times a session,
 * to produce one event. Now `splitLine` runs once and the matchers share the result.
 *
 * Order is by frequency, not importance: combat is the bulk of a real log, so it goes
 * first and the rest never see those lines. Every matcher returns null for lines it
 * doesn't own, so the order only affects cost — never the outcome.
 */
import { parseCombat } from "./combat-parser";
import { parseCoin, parseKill, parseLevel, parseLoc, parseLoot, parseXp, parseZone, splitLine } from "./log-parser";
import type { CombatEvent, LogEvent, LogLine } from "./types";

/** Everything a log line can turn into. */
export type ParsedEvent = LogEvent | CombatEvent;

/** The matchers, in cost order. */
const MATCHERS: ((line: LogLine) => ParsedEvent | null)[] = [
  parseCombat,
  parseLoot,
  parseZone,
  parseXp,
  parseKill,
  parseLoc,
  parseLevel,
  parseCoin,
];

/**
 * Parse one already-split line. Exported separately so a caller that already has a
 * `LogLine` (a replay, a test) doesn't pay to split it again.
 */
export function parseSplitLine(line: LogLine): ParsedEvent | null {
  for (const match of MATCHERS) {
    const event = match(line);
    if (event) return event;
  }
  return null;
}

/**
 * Parse one raw log line. `logId` travels onto the event so anything downstream can point
 * back at the source line without holding or re-parsing the text.
 */
export function parseLine(raw: string, logId = 0): ParsedEvent | null {
  const line = splitLine(raw, logId);
  return line ? parseSplitLine(line) : null;
}
