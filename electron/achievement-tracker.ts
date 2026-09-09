/**
 * achievement-tracker.ts — the achievement board: stock achievements plus whatever the player has
 * typed in, and saying so as a criterion is checked off or a whole achievement completes
 * (ADR 0212, `"count"` criteria added by ADR 0214).
 *
 * The matching rules are next door in
 * [achievement-progress.ts](../src/shared/achievement-progress.ts), pure and tested; this is the
 * holder that carries them out and the only state involved. It receives exactly the events
 * `alert-router.ts`/`goal-tracker.ts`/`high-scores.ts` already receive — a combat event, a raw log
 * line, a zone arrival, a fallen record — there is no achievement-specific parsing anywhere.
 *
 * Definitions and progress are stored apart: the stock catalog (`achievement-library.ts`) is code
 * and never touches disk, while a custom achievement and every achievement's progress both live in
 * `achievements.json`. Deleting a custom achievement drops its progress with it; a stock one can't be
 * deleted at all, only its progress cleared with the rest of the board.
 */
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createLogger } from "../src/shared/logging";
import { alertStyle, ACHIEVEMENT_STYLE_ID } from "../src/shared/alert-styles";
import { SELF } from "../src/shared/combat-parser";
import { STOCK_ACHIEVEMENTS } from "../src/shared/achievement-library";
import {
  freshProgress,
  isComplete,
  matchesCast,
  matchesFade,
  matchesHighScore,
  matchesLine,
  matchesZone,
  nextUnannouncedCriterion,
  runningView,
  tallyOf,
} from "../src/shared/achievement-progress";
import type {
  AchievementCriterion,
  AchievementCriterionInput,
  AchievementDefinition,
  AchievementProgress,
  AchievementView,
  BuffFadedEvent,
  CastAlertEvent,
  CastAlertSettings,
  CastEvent,
  CombatEvent,
  HighScore,
  LogLine,
} from "../src/shared/types";
import { createSaver, readJson } from "./json-store";

const log = createLogger("achievement-tracker");

/** Edits (a checked criterion, a new custom achievement) arrive one at a time; coalesce a burst. */
const WRITE_DEBOUNCE_MS = 2000;

interface Stored {
  custom: AchievementDefinition[];
  progress: AchievementProgress[];
}

function load(file: string): Stored {
  const stored = readJson<Partial<Stored>>(file, {});
  // A file written before "count" criteria existed (ADR 0214) has no `tally` on any progress
  // record — read as empty, the same rule a pre-streak `Goal` reads its missing `mode` by.
  const progress = (stored.progress ?? []).map((p) => (p.tally ? p : { ...p, tally: {} }));
  return { custom: stored.custom ?? [], progress };
}

export interface AchievementTrackerDeps {
  userDataDir: string;
  /** Current alert settings — a criterion's own `conditions` are checked exactly like an alert
   *  rule's, so the same settings object stands in for the throwaway one-watch list. */
  getSettings: () => CastAlertSettings;
  /** Where you are — the one thing a `zone` condition needs that no line says. */
  getZone: () => string | null;
  /** Put a banner on the overlay, the same way every other alert reaches it. */
  raise: (alert: CastAlertEvent) => void;
  /** Injectable, so a test doesn't depend on the wall clock. */
  now?: () => number;
}

export interface AchievementTracker {
  /** A combat event the meter has already taken: check every outstanding cast/fade criterion. */
  combat(event: CombatEvent): void;
  /** A log line, before it was parsed: check every outstanding raw-line criterion. */
  line(line: LogLine): void;
  /** A zone just arrived at (already resolved to a known place): check every outstanding zone criterion. */
  zone(rawZone: string): void;
  /** A personal best just fell: check every outstanding high-score criterion. */
  record(record: HighScore): void;
  /** Add a custom achievement. `null` for a blank title or no criteria. */
  create(input: { title: string; description?: string; category?: string; criteria: AchievementCriterionInput[] }): AchievementDefinition | null;
  /** Forget a custom achievement and its progress. A stock one is refused silently. */
  deleteCustom(id: string): void;
  /** Tick or untick one criterion by hand — the only way a `"manual"` one is ever satisfied, and an
   *  override on every kind (ADR 0212: nothing here is verification). Unticking a criterion that had
   *  completed the achievement reopens it, so a later re-tick celebrates again rather than staying
   *  silent about something it already announced once. */
  setManual(achievementId: string, criterionId: string, done: boolean): void;
  /** Everything the tab shows. */
  view(): AchievementView;
  /** Fires whenever a criterion, an achievement, or the custom list changes. */
  onChanged(cb: () => void): void;
  flush(): void;
}

export function createAchievementTracker({
  userDataDir,
  getSettings,
  getZone,
  raise,
  now = Date.now,
}: AchievementTrackerDeps): AchievementTracker {
  const file = path.join(userDataDir, "achievements.json");
  const state = load(file);
  const saver = createSaver(file, "achievements", () => state, WRITE_DEBOUNCE_MS, { concern: "achievements" });
  let listener: (() => void) | null = null;

  const changed = () => {
    saver.save();
    listener?.();
  };

  const definitions = (): AchievementDefinition[] => [...STOCK_ACHIEVEMENTS, ...state.custom];
  const progressOf = (id: string): AchievementProgress | undefined => state.progress.find((p) => p.id === id);

  function ensureProgress(id: string): AchievementProgress {
    const found = progressOf(id);
    if (found) return found;
    const fresh = freshProgress(id);
    state.progress = [...state.progress, fresh];
    return fresh;
  }

  /** The overlay's own gate: an app the player silenced stays silent — same rule a goal's banner
   *  follows, and for the same reason: nothing here is an emergency worth overriding it for. */
  function announce(payload: CastAlertEvent["achievement"], at: number): void {
    if (!payload) return;
    const settings = getSettings();
    if (!settings.enabled) return;
    raise({
      caster: "",
      spell: payload.title,
      at: new Date(at).toISOString(),
      event: "achievement",
      achievement: payload,
      style: alertStyle(settings, { styleId: ACHIEVEMENT_STYLE_ID }),
    });
  }

  /**
   * Announce whatever a definition's progress just produced — every criterion freshly satisfied,
   * then completion — in one pass, the same shape `goal-tracker.ts`'s `announceProgress` uses for a
   * goal's milestones, so a burst that finishes several criteria at once (a big replayed gap) still
   * names each one rather than skipping straight to "done!".
   */
  function announceProgress(definition: AchievementDefinition, at: number): void {
    const progress = ensureProgress(definition.id);
    while (!progress.resultAnnounced) {
      if (isComplete(definition, progress)) {
        progress.resultAnnounced = true;
        progress.completedAt = new Date(at).toISOString();
        announce({ kind: "completed", title: definition.title, done: progress.done.length, total: definition.criteria.length }, at);
        break;
      }
      const criterion = nextUnannouncedCriterion(definition, progress);
      if (!criterion) break;
      progress.announcedCriteria = [...progress.announcedCriteria, criterion.id];
      announce(
        { kind: "criterion", title: definition.title, criterionLabel: criterion.label, done: progress.done.length, total: definition.criteria.length },
        at,
      );
    }
  }

  /**
   * A `"count"` criterion's tally moved but hasn't reached its goal yet — still worth a quiet
   * banner naming the running total, since a kill count is rare enough per achievement that every
   * step is news (unlike a farming goal's fixed 25/50/75% milestones). `done`/`total` ride along too
   * (see `AchievementAlertPayload`), but the overlay renders `tally`/`tallyGoal` instead when set.
   */
  function announceCount(definition: AchievementDefinition, criterion: AchievementCriterion, tally: number, goal: number, at: number): void {
    const progress = progressOf(definition.id);
    announce(
      {
        kind: "criterion",
        title: definition.title,
        criterionLabel: criterion.label,
        done: progress?.done.length ?? 0,
        total: definition.criteria.length,
        tally,
        tallyGoal: goal,
      },
      at,
    );
  }

  /**
   * Run one matcher across every outstanding criterion of every achievement not yet complete,
   * marking and announcing whatever it satisfies. Shared by every hook below — they differ only in
   * what "matches" means, the same way `alert-router.ts`'s `combat`/`line` differ only in which of
   * `matchCast`/`matchFade`/`matchLine` they call.
   *
   * A `"count"` criterion never jumps straight to `done`: each match only increments its tally, and
   * only crossing `count.atLeast` moves it in — from there it flows through `announceProgress`
   * exactly like every other kind, so the completion cascade needs no special case for it.
   */
  function applyMatch(matches: (criterion: AchievementCriterion) => boolean): void {
    const at = now();
    let any = false;
    for (const definition of definitions()) {
      const existing = progressOf(definition.id);
      if (isComplete(definition, existing)) continue;
      let touched = false;
      for (const criterion of definition.criteria) {
        if (existing?.done.includes(criterion.id)) continue;
        if (!matches(criterion)) continue;
        const progress = ensureProgress(definition.id);
        if (criterion.kind === "count") {
          const goal = criterion.count?.atLeast ?? 1;
          const tally = tallyOf(progress, criterion.id) + 1;
          progress.tally = { ...progress.tally, [criterion.id]: tally };
          if (tally < goal) {
            announceCount(definition, criterion, tally, goal, at);
            any = true;
            continue; // not done yet — no criterion/completion banner from announceProgress below
          }
        }
        progress.done = [...progress.done, criterion.id];
        touched = true;
      }
      if (touched) {
        announceProgress(definition, at);
        any = true;
      }
    }
    if (any) changed();
  }

  return {
    combat(event) {
      const settings = getSettings();
      const context = { zone: getZone() };
      const at = now();
      // A cast/fade criterion is always the player's own (ADR 0214) — gated here, before the
      // matcher ever runs, rather than trusted to `matchCast`'s own include-self logic, which
      // exists for a different feature (warning about threats) and lets an ordinary mob's cast
      // through by design.
      if (event.kind === "cast" && event.caster === SELF) {
        const cast = event as Pick<CastEvent, "caster" | "spell" | "at"> & Partial<Pick<CastEvent, "raw">>;
        applyMatch((c) => matchesCast(c, settings, cast, at, context));
      } else if (event.kind === "buff-faded") {
        const fade = event as Pick<BuffFadedEvent, "spell" | "at"> & Partial<Pick<BuffFadedEvent, "target" | "pet" | "raw">>;
        applyMatch((c) => matchesFade(c, settings, fade, at, context));
      }
    },

    line(line) {
      const settings = getSettings();
      const context = { zone: getZone() };
      const at = now();
      applyMatch((c) => matchesLine(c, settings, line, at, context));
    },

    zone(rawZone) {
      applyMatch((c) => matchesZone(c, rawZone));
    },

    record(record) {
      applyMatch((c) => matchesHighScore(c, record));
    },

    create(input) {
      const title = input.title.trim();
      const wants = (input.criteria ?? []).filter((c) => c.label.trim());
      if (!title || !wants.length) return null;
      const criteria: AchievementCriterion[] = wants.map((c) => {
        const label = c.label.trim();
        const text = c.trigger?.text.trim();
        if (!text) return { id: randomUUID(), label, kind: "manual" };
        const onCast = !!c.trigger?.onCast;
        const watch = c.trigger?.regex
          ? { spell: "", onLine: !onCast, onCast, conditions: [{ field: "line" as const, op: "regex" as const, text }] }
          : { spell: text, onLine: !onCast, onCast };
        const atLeast = c.trigger?.count;
        return atLeast && atLeast > 1
          ? { id: randomUUID(), label, kind: "count", watch, count: { atLeast } }
          : { id: randomUUID(), label, kind: "watch", watch };
      });
      const definition: AchievementDefinition = {
        id: randomUUID(),
        title,
        description: input.description?.trim() || undefined,
        category: input.category?.trim() || undefined,
        isOfficial: false,
        criteria,
      };
      state.custom = [...state.custom, definition];
      log.debug("custom achievement created", { title, criteria: criteria.length });
      changed();
      return definition;
    },

    deleteCustom(id) {
      const before = state.custom.length;
      state.custom = state.custom.filter((d) => d.id !== id);
      if (state.custom.length === before) return; // a stock id, or one that's already gone
      state.progress = state.progress.filter((p) => p.id !== id);
      changed();
    },

    setManual(achievementId, criterionId, done) {
      const definition = definitions().find((d) => d.id === achievementId);
      const criterion = definition?.criteria.find((c) => c.id === criterionId);
      if (!definition || !criterion) return;
      const progress = ensureProgress(achievementId);
      const already = progress.done.includes(criterionId);
      if (done === already) return;
      if (done) {
        progress.done = [...progress.done, criterionId];
      } else {
        // Reopens the achievement rather than leaving it stuck "complete" with an unticked box —
        // and clears its announced marks so a later re-tick celebrates again instead of staying
        // silent about something it already said once.
        progress.done = progress.done.filter((id) => id !== criterionId);
        progress.announcedCriteria = progress.announcedCriteria.filter((id) => id !== criterionId);
        progress.resultAnnounced = false;
        progress.completedAt = undefined;
      }
      announceProgress(definition, now());
      changed();
    },

    view() {
      return { achievements: runningView(definitions(), state.progress) };
    },

    onChanged(cb) {
      listener = cb;
    },

    flush: () => saver.flush(),
  };
}
