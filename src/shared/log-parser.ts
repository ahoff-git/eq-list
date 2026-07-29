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
 * Loot message forms handled (patterns cross-checked against EQBuddy's parser, then
 * against a real EQL log — the auto-store forms below came from that log):
 *   --You have looted a <item> from <source>'s corpse.--
 *   You looted a <item> from <source>'s corpse and sold it for <coins>.
 *   You looted a <item> from <source>'s corpse to create a <result>.
 *   You looted a <item> from <source>'s corpse and stored it in your <bag/depot>
 *
 * A line can report a stack ("You looted 2 Spiderling Eye from…"), so every pattern
 * captures the count into `qty` — dropping it would under-count the shopping list.
 */

import type {
  LogLine,
  LootEvent,
  LootFate,
  ZoneEvent,
  XpEvent,
  KillEvent,
  LocEvent,
  LevelEvent,
} from "./types";

const MONTHS: Record<string, number> = {
  Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
  Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
};

const pad = (n: number | string) => String(n).padStart(2, "0");

const TIMESTAMP_RE =
  /^\[(?<dow>\w{3}) (?<mon>\w{3}) (?<day>[ \d]?\d) (?<h>\d{2}):(?<min>\d{2}):(?<s>\d{2}) (?<year>\d{4})\]\s?(?<rest>.*)$/;

/**
 * `[Www Mmm D HH:MM:SS YYYY] rest` -> a `LogLine`, or null when the line has no
 * timestamp. **This is the only place a raw log string is taken apart**: every parser
 * takes the result, so the regex runs once per line rather than once per parser.
 *
 * `at` keeps the log's local wall clock verbatim (the log states no time zone) rather
 * than shifting the calendar date through a UTC conversion. A line with no timestamp is
 * the continuation of a wrapped message, never an event, so returning null drops it.
 */
export function splitLine(raw: string, logId = 0): LogLine | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = trimmed.match(TIMESTAMP_RE);
  if (!m?.groups) return null;
  const { mon, day, h, min, s, year, rest } = m.groups;
  const month = MONTHS[mon];
  if (month === undefined) return null; // an unreadable month means an unusable time
  return {
    logId,
    at: `${year}-${pad(month)}-${pad(day.trim())}T${h}:${min}:${s}`,
    message: rest,
    raw: trimmed,
  };
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
 * Loot message patterns, each with what the line says became of the item. Every pattern
 * captures `item`, `qty` and `source`; where the line goes on to say what happened, that
 * tail is captured as `detail` (the coins, the container, the thing it became).
 * `an?` consumes the article so it never lands in the captured item name.
 */
const LOOT_PATTERNS: { fate: LootFate; re: RegExp }[] = [
  // Standard drop line, wrapped in -- --
  {
    fate: "kept",
    re: /^--You have looted (?:(?<qty>\d+) )?(?:an? |the )?(?<item>.+?) from (?<source>.+?)'s corpse\.--$/,
  },
  // Auto-sell: looted then immediately vendored
  {
    fate: "sold",
    re: /^You looted (?:(?<qty>\d+) |an? |the )?(?<item>.+?) from (?<source>.+?)'s corpse and sold it for (?<detail>.+?)\.$/,
  },
  // Auto-store: straight into a tradeskill depot / currency tab (no trailing period)
  {
    fate: "stored",
    re: /^You looted (?:(?<qty>\d+) |an? |the )?(?<item>.+?) from (?<source>.+?)'s corpse and stored it in your (?<detail>.+?)\.?$/,
  },
  // Loot-and-combine (item upgrades): the input item is still "obtained"
  {
    fate: "combined",
    re: /^You looted (?:(?<qty>\d+) |an? |the )?(?<item>.+?) from (?<source>.+?)'s corpse to create (?<detail>.+?)\.?$/,
  },
];

/** Loot from an already-split line, or null when it is not a loot line. */
export function parseLoot(line: LogLine): LootEvent | null {
  for (const { fate, re } of LOOT_PATTERNS) {
    const m = line.message.match(re);
    if (m && m.groups?.item) {
      return {
        kind: "loot",
        item: stripArticle(m.groups.item.trim()),
        qty: Math.max(1, Number(m.groups.qty ?? 1)),
        source: stripArticle((m.groups.source ?? "").trim()),
        fate,
        detail: m.groups.detail ? stripArticle(m.groups.detail.trim()) : undefined,
        logId: line.logId,
        raw: line.raw,
        at: line.at,
      };
    }
  }
  return null;
}

/** "You have entered <zone>." → ZoneEvent, or null. Leading "the " is dropped. */
const ENTER_ZONE = /^You have entered (?:the )?(?<zone>.+?)\.$/;

export function parseZone(line: LogLine): ZoneEvent | null {
  const m = line.message.match(ENTER_ZONE);
  if (!m?.groups?.zone) return null;
  return { kind: "zone", zone: m.groups.zone.trim(), logId: line.logId, raw: line.raw, at: line.at };
}

// "You gain experience! (0.5%)" (EQL) or "You gain experience!!" (classic) — accept
// one or more "!" so both work. Party and the percentage are optional.
const XP_RE = /^You gain (?<party>party )?experience!+(?: \((?<pct>[\d.]+)%\))?$/;

export function parseXp(line: LogLine): XpEvent | null {
  const m = line.message.match(XP_RE);
  if (!m) return null;
  return {
    kind: "xp",
    party: !!m.groups?.party,
    pct: m.groups?.pct ? parseFloat(m.groups.pct) : undefined,
    logId: line.logId,
    raw: line.raw,
    at: line.at,
  };
}

// Kills that credit you/your group. "You have been slain by X" (player death) uses
// "have been", so neither pattern matches it — deaths are intentionally ignored.
const KILL_BY_YOU = /^You have slain (?<target>.+)!$/;
const KILL_SLAIN_BY = /^(?<target>.+?) has been slain by .+!$/;

export function parseKill(line: LogLine): KillEvent | null {
  const m = line.message.match(KILL_BY_YOU) ?? line.message.match(KILL_SLAIN_BY);
  if (!m?.groups?.target) return null;
  return {
    kind: "kill",
    target: stripArticle(m.groups.target.trim()),
    logId: line.logId,
    raw: line.raw,
    at: line.at,
  };
}

/**
 * Levelling up. EQL writes both halves on **one line** — "You have gained a level!
 * Welcome to level 2!" — which is the form a real log actually contains; the halves are
 * also accepted alone in case the wording varies. The number is worth having (it's the
 * only place the log ever states your level), and either half means the XP-into-level
 * counter goes back to zero.
 */
const LEVEL_RES = [
  /^You have gained a level!(?: Welcome to level (?<level>\d+)!)?$/,
  /^Welcome to level (?<level>\d+)!$/,
];

export function parseLevel(line: LogLine): LevelEvent | null {
  for (const re of LEVEL_RES) {
    const m = line.message.match(re);
    if (!m) continue;
    return {
      kind: "level",
      level: m.groups?.level ? Number(m.groups.level) : undefined,
      logId: line.logId,
      raw: line.raw,
      at: line.at,
    };
  }
  return null;
}

// "Your Location is 1234.5, -678.9, 42.0" → LocEvent. EQ reports the triple y-first.
const LOC_RE = /^Your Location is (?<y>-?\d+(?:\.\d+)?), (?<x>-?\d+(?:\.\d+)?), (?<z>-?\d+(?:\.\d+)?)$/;

export function parseLoc(line: LogLine): LocEvent | null {
  const m = line.message.match(LOC_RE);
  if (!m?.groups) return null;
  return {
    kind: "loc",
    y: parseFloat(m.groups.y),
    x: parseFloat(m.groups.x),
    z: parseFloat(m.groups.z),
    logId: line.logId,
    raw: line.raw,
    at: line.at,
  };
}
