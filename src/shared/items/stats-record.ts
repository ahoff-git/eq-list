/**
 * stats-record.ts — what a stats read *said*, kept: the figures the game showed, and who it showed them for.
 *
 * A read ([ADR 0368](../../../specs/decisions/0368-a-stats-grab-reads-the-inventory-window.md)) used to leave only
 * its offsets from what the plan counts — enough to plan with, not enough to know what was read. Kept as a record
 * it survives a restart whatever origin the window loads from, remembers the figures it wasn't sure of until the
 * player says yes or no, and can be **handed to a peer**, who can then plan this character's gear in the game's own
 * numbers ([ADR 0371](../../../specs/decisions/0371-a-stats-record-is-kept-and-shared.md)).
 *
 * Three jobs, each small: say what a record may be (`readStatsRecord` — the one gate for the disk and for the wire,
 * so a damaged file and a hostile peer meet the same rules), fold a new read into the one held (`nextStatsRecord`),
 * and say what leaves (`shareableStats` — never the figures still awaiting a yes).
 *
 * Pure → a tested black box.
 */
import { CLASS_NAMES } from "../class-names";
import { MAX_PLAYER_LEVEL } from "./item-levels";
import type { StatKey } from "./item-stats";
import { CALIBRATED } from "./stat-base";
import type { StatsRead, StatsValues } from "./stats-page";

/** The stats a record may carry: every one the plan keeps an offset for, and the three regen rows the Deaths page reads. */
export const RECORDED_STATS = [...CALIBRATED, "hpRegen", "manaRegen", "endRegen"] as const satisfies readonly StatKey[];

/** No figure on the page is anywhere near this — outside it is a misread, or someone's idea of a joke. */
const MAX_FIGURE = 9_999_999;

/** A race code as the Race picker writes it (`ERU`, `DEF`) — short, plain text. */
const RACE_CODE = /^[A-Za-z0-9]{2,6}$/;

export interface StatsRecord {
  /** When the screen was read — ISO. */
  asOf: string;
  /** Level when the window said so (1 to the cap). */
  level?: number;
  /** Full class names (`"Wizard"`), as many as there are — empty when the read had none and the planner had none ticked. */
  classes: string[];
  /** The race the plan measured the read against; the stats page doesn't say, so it is the player's. */
  race?: string;
  /** What the game showed, for the figures the read was sure of. */
  figures: StatsValues;
  /** Figures it wasn't sure of, awaiting the player's yes or no. Local: never shared. */
  held?: StatsValues;
}

/** The figures that pass: known stats, whole non-negative numbers in range. Anything else is dropped. */
function figuresOf(raw: unknown): StatsValues {
  const out: StatsValues = {};
  if (!raw || typeof raw !== "object") return out;
  for (const key of RECORDED_STATS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= MAX_FIGURE) out[key] = Math.round(v);
  }
  return out;
}

const CANONICAL = new Map(CLASS_NAMES.map((name) => [name.toLowerCase(), name]));

/** Up to three distinct known classes, spelled the app's way; unknown names are dropped, not guessed at. */
function classesOf(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const c of raw) {
    const name = typeof c === "string" ? CANONICAL.get(c.trim().toLowerCase()) : undefined;
    if (name) seen.add(name);
  }
  return [...seen].slice(0, 3);
}

/**
 * A record as it should be — from a file, or from a peer. Null when there is nothing worth keeping: no date, or no
 * figure *and* no one it describes. Never throws; a bad field costs that field, not the record.
 */
export function readStatsRecord(raw: unknown): StatsRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const asOf = typeof r.asOf === "string" && !Number.isNaN(Date.parse(r.asOf)) ? new Date(Date.parse(r.asOf)).toISOString() : undefined;
  if (!asOf) return null;
  const figures = figuresOf(r.figures);
  const held = figuresOf(r.held);
  const classes = classesOf(r.classes);
  const level = typeof r.level === "number" && Number.isInteger(r.level) && r.level >= 1 && r.level <= MAX_PLAYER_LEVEL ? r.level : undefined;
  const race = typeof r.race === "string" && RACE_CODE.test(r.race.trim()) ? r.race.trim().toUpperCase() : undefined;
  if (!Object.keys(figures).length && !Object.keys(held).length && !classes.length) return null;
  return { asOf, ...(level !== undefined && { level }), classes, ...(race && { race }), figures, ...(Object.keys(held).length && { held }) };
}

/** What leaves: the record without the figures still awaiting the player's yes — those are not the player's word yet. */
export function shareableStats(record: StatsRecord): Omit<StatsRecord, "held"> {
  const out: StatsRecord = { ...record };
  delete out.held;
  return out;
}

const sameWho = (a: StatsRecord, b: StatsRecord): boolean =>
  (a.race ?? "") === (b.race ?? "") && a.level === b.level && [...a.classes].sort().join(",") === [...b.classes].sort().join(",");

/** What a read or a confirmation adds to the record held. */
export interface StatsUpdate {
  /** When the screen was read, ms. */
  at: number;
  race?: string;
  classes: readonly string[];
  level: number;
  /** The figures that went in. */
  applied: StatsValues;
  /** The figures it wasn't sure of. */
  held: StatsValues;
}

/**
 * The record after `update`. A read under the **same** race, classes and level adds to what is held — a read of
 * half the page doesn't forget the other half — and under a different one **replaces** it, since the old
 * figures were the game's totals for a character that has since changed. The figures still awaiting a yes are
 * always the newest read's.
 */
export function nextStatsRecord(held: StatsRecord | null, update: StatsUpdate): StatsRecord {
  const fresh: StatsRecord = {
    asOf: new Date(update.at).toISOString(),
    level: update.level,
    classes: classesOf(update.classes),
    ...(update.race && { race: update.race }),
    figures: figuresOf(update.applied),
    ...(Object.keys(figuresOf(update.held)).length && { held: figuresOf(update.held) }),
  };
  if (!held || !sameWho(held, fresh)) return fresh;
  // The figures awaiting a yes are always the newest read's (it is the game as it is now), as in the panel.
  return { ...fresh, figures: { ...held.figures, ...fresh.figures } };
}

/** The player answered the held figures: kept as the game's own (`yes`) or dropped (`no`). */
export function answeredStatsRecord(held: StatsRecord, yes: boolean): StatsRecord {
  const { held: pending, ...rest } = held;
  return { ...rest, figures: yes ? { ...held.figures, ...pending } : held.figures };
}

/** A record as a read, so the same code that applies a read applies it — who it describes and what it showed. */
export function readOfRecord(record: StatsRecord): StatsRead {
  return {
    ...(record.classes.length || record.level !== undefined ? { who: { classes: [...record.classes], ...(record.level !== undefined && { level: record.level }), unsure: [] } } : {}),
    values: { ...record.figures },
    repaired: [],
    doubtful: [],
    missing: [],
  };
}

/** `Wizard / Druid / Magician, level 31` — as much of who the record describes as it knows. */
export function whoText(record: Pick<StatsRecord, "classes" | "level">): string {
  return [record.classes.join(" / "), record.level !== undefined ? `level ${record.level}` : ""].filter(Boolean).join(", ") || "an unknown character";
}
