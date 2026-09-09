/**
 * achievement-progress.ts — whether a criterion is satisfied, and whether an achievement is
 * (ADR 0212, `"count"` criteria added by ADR 0214, `"raceKill"` by ADR 0215).
 *
 * Pure and zero-I/O, like `goal-progress.ts` next door: `electron/achievement-tracker.ts` is the
 * only thing that owns state, and this is tested without any of it.
 *
 * A `"watch"`/`"count"` criterion is checked by wrapping it in a **throwaway single-watch settings
 * object** and calling the real `matchCast`/`matchFade`/`matchLine` from `cast-alerts.ts` — the
 * exact trick `watch-check.ts`'s `dryRun` already uses to run one watch outside the live list. No
 * second matcher exists here: an achievement criterion fires on precisely what an alert rule would,
 * regex safety (ADR 0203) included for free.
 *
 * A cast or fade criterion is **always the player's own** (ADR 0214): `criterionWatch` hardcodes
 * `includeSelf: true` regardless of what the criterion asked for, and `electron/achievement-tracker.ts`
 * additionally only ever offers this module a cast event where `event.caster === SELF` — so even
 * though `matchCast`'s own logic lets an ordinary mob's cast through unconditionally (the alert
 * engine's own job, warning about threats), an achievement never sees one.
 *
 * A `"raceKill"` criterion reuses the log's own already-parsed `KillEvent` (`log-parser.ts`'s
 * `parseKill`) rather than raw-line text: the mob's name is looked up in `mob-races.ts` (built from
 * the wiki's own mob pages) and compared against the criterion's `race`, generously — see
 * `isRace`. `electron/achievement-tracker.ts` only ever offers this module a kill where
 * `event.killer === SELF`, the same self-only discipline every other criterion kind holds to.
 */
import { matchCast, matchFade, matchLine, type MatchContext } from "./cast-alerts";
import { isRace } from "./mob-races";
import { placeKey } from "./zones/place";
import type {
  AchievementCriterion,
  AchievementDefinition,
  AchievementProgress,
  AchievementWatch,
  BuffFadedEvent,
  CastAlertSettings,
  CastEvent,
  CastWatch,
  HighScore,
  KillEvent,
  LogLine,
  RunningAchievement,
} from "./types";

/** `"watch"` and `"count"` share every matching rule — only what the tracker does with a match
 *  differs (mark done outright, vs. tally toward a threshold). */
function isWatchLike(criterion: AchievementCriterion): boolean {
  return criterion.kind === "watch" || criterion.kind === "count";
}

/**
 * The throwaway watch a `"watch"`/`"count"` criterion matches with. Every boolean is defaulted to
 * `false` rather than left unset: `CastWatch.onCast` unset reads as *on* (every watch predates the
 * choice, ADR 0084), which would make a criterion meant only for raw lines also match casts.
 * `includeSelf` is hardcoded `true` — see the module doc and ADR 0214 — because an achievement
 * criterion is never about anyone's cast but the player's own, whatever the player's real alert
 * settings say. A criterion builds its own watch fresh every check, so nothing here is ever mutated
 * or shared.
 */
function criterionWatch(id: string, watch: AchievementWatch): CastWatch {
  return {
    id,
    enabled: true,
    spell: watch.spell,
    conditions: watch.conditions,
    match: watch.match,
    onCast: watch.onCast ?? false,
    onFade: watch.onFade ?? false,
    onLine: watch.onLine ?? false,
    includeSelf: true,
  };
}

/** One watch, alone, in a settings object real enough for `matchCast`/`matchFade`/`matchLine` to
 *  read — everything but `enabled`/`watches` carried over from the live settings. */
function soloSettings(settings: CastAlertSettings, watch: CastWatch): CastAlertSettings {
  return { ...settings, enabled: true, watches: [watch] };
}

/** Does a cast satisfy this criterion? Only ever true for `"watch"`/`"count"` with `watch.onCast` —
 *  and, per the module doc, only ever for the player's own cast. */
export function matchesCast(
  criterion: AchievementCriterion,
  settings: CastAlertSettings,
  event: Pick<CastEvent, "caster" | "spell" | "at"> & Partial<Pick<CastEvent, "raw">>,
  now: number,
  context: MatchContext = {},
): boolean {
  if (!isWatchLike(criterion) || !criterion.watch?.onCast) return false;
  const watch = criterionWatch(criterion.id, criterion.watch);
  return !!matchCast(event, soloSettings(settings, watch), now, context);
}

/** Does a fade satisfy this criterion? Only ever true for `"watch"`/`"count"` with `watch.onFade`. */
export function matchesFade(
  criterion: AchievementCriterion,
  settings: CastAlertSettings,
  event: Pick<BuffFadedEvent, "spell" | "at"> & Partial<Pick<BuffFadedEvent, "target" | "pet" | "raw">>,
  now: number,
  context: MatchContext = {},
): boolean {
  if (!isWatchLike(criterion) || !criterion.watch?.onFade) return false;
  const watch = criterionWatch(criterion.id, criterion.watch);
  return !!matchFade(event, soloSettings(settings, watch), now, context);
}

/** Does a raw log line satisfy this criterion? Only ever true for `"watch"`/`"count"` with
 *  `watch.onLine`. */
export function matchesLine(
  criterion: AchievementCriterion,
  settings: CastAlertSettings,
  line: Pick<LogLine, "message" | "at">,
  now: number,
  context: MatchContext = {},
): boolean {
  if (!isWatchLike(criterion) || !criterion.watch?.onLine) return false;
  const watch = criterionWatch(criterion.id, criterion.watch);
  return !!matchLine(line, soloSettings(settings, watch), now, context);
}

/**
 * Does arriving in this zone satisfy this criterion? Resolved with `placeKey` on both sides — the
 * same alias-and-typo-tolerant zone resolver kill-log grouping and mob-knowledge pooling already
 * trust — so a difficulty variant ("The Steamfont Mountains 2 (Adaptive)") or a known alternate
 * spelling of the same place still counts (ADR 0214). A zone the gazetteer can't place at all
 * resolves to its own raw name on both sides, so it can still match itself exactly; what it can't do
 * is match a *different* raw wording of a place the gazetteer hasn't reconciled yet — see `todo.md`.
 */
export function matchesZone(criterion: AchievementCriterion, rawZone: string): boolean {
  if (criterion.kind !== "zone" || !criterion.zone) return false;
  return placeKey(criterion.zone) === placeKey(rawZone);
}

/**
 * Does a fallen record satisfy this criterion? A record only ever grows, so comparing the current
 * board figure to the threshold is enough to also unlock a criterion whose threshold was set
 * *after* the record already stood — there is no history to re-derive.
 */
export function matchesHighScore(
  criterion: AchievementCriterion,
  record: Pick<HighScore, "categoryId" | "value">,
): boolean {
  if (criterion.kind !== "highscore" || !criterion.highscore) return false;
  return record.categoryId === criterion.highscore.categoryId && record.value >= criterion.highscore.atLeast;
}

/**
 * Does this kill count toward a `"raceKill"` criterion? The mob's own name (not the criterion's
 * text) decides its race, generously matched — see `isRace`. `electron/achievement-tracker.ts` is
 * what keeps this to the player's own kills; this function trusts whatever event it's handed.
 */
export function matchesRaceKill(criterion: AchievementCriterion, event: Pick<KillEvent, "target">): boolean {
  if (criterion.kind !== "raceKill" || !criterion.race) return false;
  return isRace(event.target, criterion.race);
}

/** A fresh, empty progress record for an achievement just met for the first time. */
export function freshProgress(id: string): AchievementProgress {
  return { id, done: [], tally: {}, resultAnnounced: false, announcedCriteria: [] };
}

/** A `"count"` criterion's running tally, or 0 if it has never matched (ADR 0214). */
export function tallyOf(progress: Pick<AchievementProgress, "tally"> | undefined, criterionId: string): number {
  return progress?.tally?.[criterionId] ?? 0;
}

/** Has every one of this achievement's criteria been satisfied? An achievement with no criteria at
 *  all is never complete — there is nothing to have done. */
export function isComplete(
  definition: AchievementDefinition,
  progress: Pick<AchievementProgress, "done"> | undefined,
): boolean {
  if (!definition.criteria.length) return false;
  const done = progress?.done ?? [];
  return definition.criteria.every((c) => done.includes(c.id));
}

/**
 * The next criterion this achievement has satisfied but not yet bannered, in definition order — a
 * caller loops this the way `nextMilestone` is looped for a goal, so a burst that finishes several
 * criteria at once (a big replayed gap) still names each one rather than skipping to the last.
 */
export function nextUnannouncedCriterion(
  definition: AchievementDefinition,
  progress: Pick<AchievementProgress, "done" | "announcedCriteria">,
): AchievementCriterion | null {
  for (const criterion of definition.criteria) {
    if (progress.done.includes(criterion.id) && !progress.announcedCriteria.includes(criterion.id)) {
      return criterion;
    }
  }
  return null;
}

/** Every definition joined with whatever progress it has, for the tab and the create form. */
export function runningView(
  definitions: readonly AchievementDefinition[],
  progressList: readonly AchievementProgress[],
): RunningAchievement[] {
  const byId = new Map(progressList.map((p) => [p.id, p] as const));
  return definitions.map((definition) => {
    const progress = byId.get(definition.id);
    return {
      definition,
      done: progress?.done ?? [],
      tally: progress?.tally ?? {},
      total: definition.criteria.length,
      completedAt: progress?.completedAt,
    };
  });
}
