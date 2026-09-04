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
import { parseCoin, parseGameTime, parseKill, parseLevel, parseLoc, parseLogin, parseLoot, parseParty, parseSighting, parseXp, parseZone, splitLine } from "./log-parser";
import type { CombatEvent, LogEvent, LogLine } from "./types";

/** Everything a log line can turn into. */
export type ParsedEvent = LogEvent | CombatEvent;

/**
 * The kinds that are *combat*, as a total map of `CombatEvent["kind"]` — so adding a combat
 * event without listing it here is a **compile error**.
 *
 * It lives here, once, because two places need the answer and they must not disagree: the live
 * watcher's `combat` channel and the log importer's replay. This has already gone wrong the
 * loose way — `stance` and `invocation` were absent from the watcher's copy, so the tracker
 * never learned which mode was in force and filed every swing under "unknown", leaving the
 * whole of [ADR 0020](../../specs/decisions/0020-split-by-stance-and-invocation.md) dark against
 * a log with 243 of those lines. The failure is silent by nature: the events parse, they're
 * emitted, and nothing listens. A drift between the *two* copies is worse still, since the same
 * evening would then read differently live than re-imported, which
 * [ADR 0033](../../specs/decisions/0033-eating-a-log-is-idempotent.md) exists to prevent.
 */
const COMBAT_KINDS: Record<CombatEvent["kind"], true> = {
  damage: true,
  miss: true,
  heal: true,
  cast: true,
  "spell-outcome": true,
  death: true,
  "buff-faded": true,
  stance: true,
  invocation: true,
  "pet-engage": true,
};

/** Is this parsed event one the damage meter takes? Narrows, so callers keep their types. */
export function isCombatEvent(event: ParsedEvent): event is CombatEvent {
  return event.kind in COMBAT_KINDS;
}

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
  // A `/time` response. Rare — a couple of lines whenever the player types it — so it costs
  // nothing to leave this late, after everything that owns a busier line outright.
  parseGameTime,
  // A consider or a hail. Before `parseParty`, whose group-chat pattern is looser than either of
  // these — and after everything that owns a line outright, since it is a handful of lines a night.
  parseSighting,
  // Rare, and its loosest pattern reads group chat — so it goes after every parser that owns
  // a line outright.
  parseParty,
  // Once a sitting, so it goes last — and after `parseLevel`, whose "Welcome to level 2!"
  // shares the opening words.
  parseLogin,
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
