/**
 * zone-line-repair.ts — put right the kills, drops and fights filed under the zone *before* one the app
 * couldn't name.
 *
 * Until 0.1.154 the game's own long names for the four Karanas ("You have entered The Northern Plains
 * of Karana."), the Qeynos Aqueducts ("…The Qeynos Aqueduct System."), South Ro ("…The Southern
 * Desert of Ro.") and Neriak's districts ("…Neriak - Commons.") read as unresolved zone lines. An
 * unresolved line leaves the current zone where it was, so everything recorded until the next zone
 * line was filed under the zone you'd left — 138 North Karana kills and drops under Lower Guk, on one
 * real log. 0.1.154 taught the resolver those names; this repairs what was already stored.
 *
 * **Narrow on purpose.** A record is corrected only when both hold:
 *
 *   1. the zone line that put you where you were at that moment is one of those names (`NEWLY_RESOLVED`);
 *   2. the record carries exactly the zone the old rules would have kept — the last zone line before
 *      it that resolved then and still resolves now.
 *
 * Anything else — a record the log can't account for, one already right, one filed somewhere neither
 * rule would give — is left exactly as it is. Re-reading the logs can't do this: a re-read never
 * overwrites a zone a record already has, since a disagreement usually means the rules moved, not the
 * facts. Here the rule that moved is known, so is the answer.
 *
 * Pure: timelines and a record in, the corrected zone (as the log wrote it) or `undefined` out.
 * Tested in `electron/tests/zone-line-repair.test.ts`; run once by `migrations.ts`
 * ([ADR 0301](../specs/decisions/0301-a-zone-line-learned-late-re-files-what-it-missed.md)).
 */
import { classifyZoneLine, samePlace } from "../src/shared/zones/place";

/** The zone lines 0.1.154 made resolvable — the game's long names it added aliases for. */
export const NEWLY_RESOLVED =
  /^(?:the\s+)?(?:(?:western|eastern|northern|southern)\s+plains\s+of\s+karana|qeynos\s+aqueduct\s+system|southern\s+desert\s+of\s+ro|neriak\s+-\s+(?:foreign\s+quarter|commons|3rd\s+gate|third\s+gate))\b/i;

/** One log's zone lines, in order, and the span of time it covers. Times are the log's own stamps. */
export interface LineTimeline {
  entries: { at: string; zone: string }[];
  firstAt?: string;
  lastAt?: string;
}

/** Did the resolver before 0.1.154 accept this zone line? */
function resolvedBefore(zone: string): boolean {
  return classifyZoneLine(zone) === "known" && !NEWLY_RESOLVED.test(zone.trim());
}

/**
 * What one log says about a record at `at` filed under `stored`: the zone it should carry, or
 * `undefined` when this log can't account for it or it is already right.
 */
function correctionFrom(timeline: LineTimeline, at: string, stored: string): string | undefined {
  if (!timeline.firstAt || !timeline.lastAt || at < timeline.firstAt || at > timeline.lastAt) return undefined;
  let current = -1;
  for (let i = 0; i < timeline.entries.length && timeline.entries[i].at <= at; i++) {
    if (classifyZoneLine(timeline.entries[i].zone) === "known") current = i;
  }
  if (current < 0) return undefined;
  const now = timeline.entries[current].zone;
  if (!NEWLY_RESOLVED.test(now.trim())) return undefined;
  // What the old rules would have kept: the last line before this one that resolved then.
  let before: string | undefined;
  for (let i = current - 1; i >= 0; i--) {
    if (resolvedBefore(timeline.entries[i].zone)) {
      before = timeline.entries[i].zone;
      break;
    }
  }
  return before && samePlace(stored, before) && !samePlace(stored, now) ? now : undefined;
}

/**
 * The zone a stored record should carry, or `undefined` to leave it alone. Every log that covers the
 * moment is asked; a correction stands only when every log that has one agrees on it (two characters'
 * logs covering one evening can't be told apart by time alone).
 */
export function misfiledZone(timelines: readonly LineTimeline[], at: string, stored: string | null | undefined): string | undefined {
  if (!stored || !at) return undefined;
  const answers = new Set(timelines.map((t) => correctionFrom(t, at, stored)).filter((z): z is string => !!z));
  return answers.size === 1 ? [...answers][0] : undefined;
}
