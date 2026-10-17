/**
 * Your tradeskills, as your own log tells them: each one's current value, and how many combines a
 * point has actually taken you.
 *
 * **The value** is stated outright. `You have become better at Blacksmithing! (60)` gives the skill
 * after the increase, so the latest such line is where the skill stands. Nothing is inferred.
 *
 * **The rate** is measured, and needs one inference. A combine's line names the item ("You lacked
 * the skills to fashion Sheet Metal.") and never the skill, so a combine is credited to the tradeskill
 * that skills up at the end of its sitting — an unbroken run of combines with no gap longer than
 * `SESSION_GAP_MS`. Combines after a sitting's last skill-up are never credited: they raised nothing
 * (a trivial recipe, or making things to use), and counting them would charge the skill for combines
 * that weren't spent on it. So the rate is *combines per point while skilling up*, which is the
 * figure a guide step needs.
 *
 * Measured on a real evening: Blacksmithing 2→60, 58 points from 147 credited combines — 2.5 a point,
 * the same as the guides' own 370-STR smith. The log held 398 combine lines that night; the other 251
 * came after the last skill-up (143 trivial Metal Bits among them), which is exactly what a raw
 * "combines ÷ points" would have wrongly charged to the skill.
 */
import type { CombineEvent, SkillUpEvent } from "../types";
import type { CraftingSummary } from "./crafting-log";
import type { PooledCraftRate } from "./craft-rates";

/** The tab's skill names as the log writes them, where they differ. */
const LOG_NAME: Readonly<Record<string, string>> = { Jewelcrafting: "Jewelry Making" };

/** Every tradeskill the log can skill up, by its log name. */
export const LOG_TRADESKILLS: ReadonlySet<string> = new Set([
  "Alchemy",
  "Baking",
  "Blacksmithing",
  "Brewing",
  "Fletching",
  "Jewelry Making",
  "Pottery",
  "Tailoring",
  "Tinkering",
  "Make Poison",
  "Research",
]);

/** A tab skill's log name: "Jewelcrafting" → "Jewelry Making". */
export function logSkillName(tabName: string): string {
  return LOG_NAME[tabName] ?? tabName;
}

/** How far apart a combine and the skill-up it is credited to may be. One sitting at a station. */
export const SESSION_GAP_MS = 10 * 60_000;

/** Fewer skill-ups than this, and a measured rate is noise rather than a rate. */
export const MIN_SKILLUPS_FOR_RATE = 10;

export interface SkillValue {
  value: number;
  /** When the log stated it. */
  at: string;
}

export interface MeasuredRate {
  /** Combines credited to the skill (see the header for which). */
  combines: number;
  /** Points gained while those combines were made. */
  points: number;
  /** The skill values the measurement covers. */
  from: number;
  to: number;
  /** When the last point was counted (ms), so the next skill-up knows whether it's the same sitting. */
  lastAt: number;
}

/** One character's tradeskill progress, as the reducer below keeps it. Plain data: it is persisted. */
export interface SkillProgress {
  skills: Record<string, SkillValue>;
  rates: Record<string, MeasuredRate>;
  /** Combines not yet credited, by time (ms) — waiting for the skill-up that will claim them. */
  pending: number[];
}

export function emptyProgress(): SkillProgress {
  return { skills: {}, rates: {}, pending: [] };
}

/**
 * Take one event in, in log order. Returns whether anything a reader would see changed.
 *
 * No de-duplication here: a skill-up and the combine that earned it usually share a second, so a
 * timestamp can't tell a repeat from a neighbour. Each line must be offered once, which is the
 * caller's job and is done by byte position (`electron/skill-progress.ts`).
 */
export function noteEvent(p: SkillProgress, e: SkillUpEvent | CombineEvent): boolean {
  const t = Date.parse(e.at);
  if (e.kind === "combine") {
    // A gap this long between combines ends the sitting: what came before it can't be claimed now.
    const last = p.pending[p.pending.length - 1];
    if (last !== undefined && t - last > SESSION_GAP_MS) p.pending = [];
    p.pending.push(t);
    return false;
  }
  if (!LOG_TRADESKILLS.has(e.skill)) return false;
  // Credit the sitting's combines that led here — the whole unbroken run, however long, so forty
  // sub-combines over half an hour before a point still count toward it.
  const last = p.pending[p.pending.length - 1];
  const credited = last !== undefined && t - last <= SESSION_GAP_MS ? p.pending.length : 0;
  p.pending = [];
  const rate = p.rates[e.skill];
  // A point counts when combines led to it — or when it lands in a sitting already being measured:
  // the game prints a skill-up *before* the result of the combine that earned it, so two quick
  // points can arrive with that combine still unwritten, and skipping the second would understate
  // the points and overstate the rate.
  const sameSitting = !!rate && t - rate.lastAt <= SESSION_GAP_MS;
  if (credited || sameSitting) {
    if (rate) {
      rate.combines += credited;
      rate.points += 1;
      rate.to = Math.max(rate.to, e.value);
      rate.from = Math.min(rate.from, e.value - 1);
      rate.lastAt = t;
    } else p.rates[e.skill] = { combines: credited, points: 1, from: e.value - 1, to: e.value, lastAt: t };
  }
  const was = p.skills[e.skill]?.value;
  p.skills[e.skill] = { value: e.value, at: e.at };
  return was !== e.value || credited > 0;
}

/** Combines a point, when enough skill-ups back it to be worth using. */
export function measuredRate(rate: MeasuredRate | undefined): number | undefined {
  if (!rate || rate.points < MIN_SKILLUPS_FOR_RATE) return undefined;
  return rate.combines / rate.points;
}

/** What the Tradeskills tab is told about one character. */
export interface SkillProgressView {
  character: string;
  skills: Record<string, SkillValue>;
  rates: Record<string, MeasuredRate>;
  /** True while the log's history is still being read for the first time. */
  scanning: boolean;
  /** Your crafting log, rolled up by sitting and by item at each level (`crafting-log.ts`). */
  crafting: CraftingSummary;
  /** The room's success rates — every peer's shared rates added up, yours not among them (ADR 0303). */
  pooled?: PooledCraftRate[];
}
