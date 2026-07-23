/**
 * log-parser.ts — pure functions that turn an EverQuest Legends log line into a
 * structured event. No I/O, no Node, no state: the same string always yields the
 * same result, which makes this a black box the log watcher can lean on and tests
 * can pin down without touching the filesystem.
 *
 * Log line shape (EQ Legends):
 *   [Www Mmm D HH:MM:SS YYYY] <message>
 * e.g.
 *   [Fri Jul 17 18:41:14 2026] --You have looted a Mote of Potential from an orc's corpse.--
 *
 * Loot message forms handled (patterns cross-checked against EQBuddy's parser):
 *   --You have looted a <item> from <source>'s corpse.--
 *   You looted a <item> from <source>'s corpse and sold it for <coins>.
 *   You looted a <item> from <source>'s corpse to create a <result>.
 */

import type { LootEvent, ZoneEvent, XpEvent, KillEvent, LocEvent } from "./types";

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

const pad = (n: number | string) => String(n).padStart(2, "0");

/**
 * Current local wall clock as a naive (no-Z) ISO string — the same shape we use
 * for parsed lines, so mixed timestamps still sort correctly.
 */
function nowNaiveIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes(),
  )}:${pad(d.getSeconds())}`;
}

/**
 * `[Www Mmm D HH:MM:SS YYYY] rest` → { at, message }, or null if no timestamp.
 * `at` preserves the log's local wall clock verbatim (the log carries no time
 * zone), rather than shifting the calendar date through a UTC conversion.
 */
export function splitTimestamp(line: string): { at: string; message: string } | null {
  const m = line.match(
    /^\[(?<dow>\w{3}) (?<mon>\w{3}) (?<day>[ \d]?\d) (?<h>\d{2}):(?<min>\d{2}):(?<s>\d{2}) (?<year>\d{4})\]\s?(?<rest>.*)$/,
  );
  if (!m || !m.groups) return null;
  const { mon, day, h, min, s, year, rest } = m.groups;
  const month = MONTHS[mon];
  const at =
    month === undefined
      ? nowNaiveIso()
      : `${year}-${pad(month)}-${pad(day.trim())}T${h}:${min}:${s}`;
  return { at, message: rest };
}

/** Strip a leading English article so names match the wiki / shopping list. */
export function stripArticle(name: string): string {
  return name.replace(/^(?:an?|the) /i, "").trim();
}

/**
 * Character name from an EQ log filename (`eqlog_<Character>_<server>.txt`), or null.
 * Used to default the player's peer-network display name. Accepts a full path.
 */
export function characterFromLogFile(file?: string): string | null {
  if (!file) return null;
  const base = file.split(/[\\/]/).pop() ?? file;
  const m = base.match(/^eqlog_([^_]+)_/i);
  return m ? m[1] : null;
}

/**
 * Loot message patterns. Each captures `item` (and `source` where present).
 * `an?` consumes the article so it never lands in the captured item name.
 */
const LOOT_PATTERNS: RegExp[] = [
  // Standard drop line, wrapped in -- --
  /^--You have looted (?:\d+ )?(?:an? |the )?(?<item>.+?) from (?<source>.+?)'s corpse\.--$/,
  // Auto-sell: looted then immediately vendored
  /^You looted (?:\d+ |an? |the )?(?<item>.+?) from (?<source>.+?)'s corpse and sold it for .+?\.$/,
  // Loot-and-combine (item upgrades): the input item is still "obtained"
  /^You looted (?:\d+ |an? |the )?(?<item>.+?) from (?<source>.+?)'s corpse to create .+?\.?$/,
];

/** Parse a raw loot message (timestamp already removed) into a LootEvent, or null. */
export function parseLootMessage(message: string, at: string, raw: string): LootEvent | null {
  for (const re of LOOT_PATTERNS) {
    const m = message.match(re);
    if (m && m.groups?.item) {
      return {
        kind: "loot",
        item: stripArticle(m.groups.item.trim()),
        source: stripArticle((m.groups.source ?? "").trim()),
        raw,
        at,
      };
    }
  }
  return null;
}

/** Parse a full log line (with or without a leading timestamp) into a LootEvent, or null. */
export function parseLogLine(line: string): LootEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const split = splitTimestamp(trimmed);
  const message = split ? split.message : trimmed;
  const at = split ? split.at : nowNaiveIso();
  return parseLootMessage(message, at, trimmed);
}

/** "You have entered <zone>." → ZoneEvent, or null. Leading "the " is dropped. */
const ENTER_ZONE = /^You have entered (?:the )?(?<zone>.+?)\.$/;

export function parseZoneLine(line: string): ZoneEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const split = splitTimestamp(trimmed);
  const message = split ? split.message : trimmed;
  const at = split ? split.at : nowNaiveIso();
  const m = message.match(ENTER_ZONE);
  if (!m?.groups?.zone) return null;
  return { kind: "zone", zone: m.groups.zone.trim(), raw: trimmed, at };
}

/** Split a line into its message + timestamp once, for the smaller parsers below. */
function messageOf(line: string): { message: string; at: string; raw: string } | null {
  const raw = line.trim();
  if (!raw) return null;
  const split = splitTimestamp(raw);
  return { message: split ? split.message : raw, at: split ? split.at : nowNaiveIso(), raw };
}

// "You gain experience! (0.5%)" (EQL) or "You gain experience!!" (classic) — accept
// one or more "!" so both work. Party and the percentage are optional.
const XP_RE = /^You gain (?<party>party )?experience!+(?: \((?<pct>[\d.]+)%\))?$/;

export function parseXpLine(line: string): XpEvent | null {
  const parsed = messageOf(line);
  if (!parsed) return null;
  const m = parsed.message.match(XP_RE);
  if (!m) return null;
  return {
    kind: "xp",
    party: !!m.groups?.party,
    pct: m.groups?.pct ? parseFloat(m.groups.pct) : undefined,
    raw: parsed.raw,
    at: parsed.at,
  };
}

// Kills that credit you/your group. "You have been slain by X" (player death) uses
// "have been", so neither pattern matches it — deaths are intentionally ignored.
const KILL_BY_YOU = /^You have slain (?<target>.+)!$/;
const KILL_SLAIN_BY = /^(?<target>.+?) has been slain by .+!$/;

export function parseKillLine(line: string): KillEvent | null {
  const parsed = messageOf(line);
  if (!parsed) return null;
  const m = parsed.message.match(KILL_BY_YOU) ?? parsed.message.match(KILL_SLAIN_BY);
  if (!m?.groups?.target) return null;
  return { kind: "kill", target: stripArticle(m.groups.target.trim()), raw: parsed.raw, at: parsed.at };
}

// "Your Location is 1234.5, -678.9, 42.0" → LocEvent. EQ reports the triple y-first.
const LOC_RE = /^Your Location is (?<y>-?\d+(?:\.\d+)?), (?<x>-?\d+(?:\.\d+)?), (?<z>-?\d+(?:\.\d+)?)$/;

export function parseLocLine(line: string): LocEvent | null {
  const parsed = messageOf(line);
  if (!parsed) return null;
  const m = parsed.message.match(LOC_RE);
  if (!m?.groups) return null;
  return {
    kind: "loc",
    y: parseFloat(m.groups.y),
    x: parseFloat(m.groups.x),
    z: parseFloat(m.groups.z),
    raw: parsed.raw,
    at: parsed.at,
  };
}
