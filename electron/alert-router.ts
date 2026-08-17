/**
 * alert-router.ts — the whole alert path, from a log line to a banner.
 *
 * This is the piece that was living in `main.ts` as three handlers, and it was the wrong place for
 * it: main is wiring, and this is a **pipeline** with four steps and several rules about their order.
 * Gathered here it can be read in one sitting, and — the actual reason — tested end to end without
 * Electron, which the important rules deserve. Its two collaborators stay separate boxes:
 * [alert-queue.ts](./alert-queue.ts) holds what waits, and the matching and styling are pure.
 *
 * The pipeline, in the order it has to happen:
 *
 *   1. **A death is noted first.** It cancels the cues that were about the fight you just lost.
 *   2. **The event is matched** against the watch list — `matchCast` / `matchFade` for a typed event,
 *      `matchLine` for the log's own words (`cast-alerts.ts`, pure).
 *   3. **The banner is built** from the watch that matched: its wording, and its style resolved
 *      through every layer. Both are settled *here*, at the moment of the alert, because the overlay
 *      window never sees the watch — it only knows the defaults.
 *   4. **The queue decides when.** Immediately for almost every rule; later for a cue.
 *
 * Two orderings are load-bearing and neither is obvious, so they're stated where they happen:
 * *nothing* here delays the meter or the ledger (only the alert ever waits), and a line is offered
 * for **cancelling before matching**, because a rule that both fires and cancels on the same words
 * means the new cue rather than the old one.
 */
import { createAlertQueue, type AlertQueue, type Timers } from "./alert-queue";
import { lineSubject, matchCast, matchFade, matchLine, watchesLines, type MatchContext } from "../src/shared/cast-alerts";
import { alertStyle } from "../src/shared/alert-styles";
import type {
  AlertStyle,
  CastAlertEvent,
  CastAlertSettings,
  CastWatch,
  CombatEvent,
  HighScore,
  HighScoreSettings,
  LogLine,
} from "../src/shared/types";

export interface AlertRouterDeps {
  /** The current alert settings. Read per line rather than held, so a change takes effect at once. */
  getSettings: () => CastAlertSettings;
  /**
   * Whether a personal best is worth a banner, and which saved style it wears. Read per record for
   * the same reason the alert settings are: a toggle should take effect on the next one, not the
   * next launch.
   */
  getScoreSettings: () => HighScoreSettings;
  /** Where you are — the one thing a `zone` condition needs that no line says. */
  getZone: () => string | null;
  /** Put a banner on the overlay. */
  raise: (alert: CastAlertEvent) => void;
  /** Injectable timers, so a test of an 8-minute cue takes a millisecond. */
  timers?: Timers;
}

export interface AlertRouter {
  /** A combat event the meter has already taken: match it, and note a death. */
  combat(event: CombatEvent): void;
  /**
   * A personal best just fell — put a banner up saying so.
   *
   * It skips steps 2 and 4 of the pipeline entirely: there is no watch to match (the *scoreboard*
   * decided this was news — see `electron/high-scores.ts`) and nothing to wait for, since a
   * congratulation held back until later is not one. Only step 3 applies, which is why it's here
   * rather than in main: resolving the look through every layer is this module's job.
   */
  record(record: HighScore): void;
  /** A log line, before it was parsed: cancel what it cancels, then match raw-text rules. */
  line(line: LogLine): void;
  /** Alerts were switched off — drop every waiting cue, since there's nothing left to say them on. */
  clear(): void;
  /** Cues waiting. For the debug log and for tests. */
  pending(): number;
}

export function createAlertRouter({ getSettings, getScoreSettings, getZone, raise, timers }: AlertRouterDeps): AlertRouter {
  const queue: AlertQueue = createAlertQueue(raise, timers);
  const where = (): MatchContext => ({ zone: getZone() });

  return {
    combat(event) {
      // Your death calls off the cues that were about the fight you were in — a "recast it" reminder
      // is noise from a corpse. Only the *alert* is ever dropped: everything else this line feeds has
      // already taken it, which is why the router is called after the meter rather than before.
      if (event.kind === "death") queue.noteDeath();

      const settings = getSettings();
      const context = where();
      const now = Date.now();
      if (event.kind === "cast") {
        const watch = matchCast(event, settings, now, context);
        if (watch) {
          queue.schedule(
            {
              caster: event.caster,
              spell: event.spell,
              at: event.at,
              event: "cast",
              message: watch.message,
              style: alertStyle(settings, watch),
            },
            watch,
          );
        }
        return;
      }
      if (event.kind === "buff-faded") {
        const watch = matchFade(event, settings, now, context);
        if (watch) {
          queue.schedule(
            {
              caster: "",
              spell: event.spell,
              at: event.at,
              event: "fade",
              // "your pet" rather than the pet's name, matching what a `target` condition reads.
              target: event.pet ? "your pet" : event.target,
              message: watch.message,
              style: alertStyle(settings, watch),
            },
            watch,
          );
        }
      }
    },

    record(record) {
      const scores = getScoreSettings();
      if (!scores.celebrate) return;
      // Straight to the overlay: `queue.schedule` exists to make a cue *wait*, and there is nothing
      // a congratulation gains by arriving late. A death doesn't cancel it either — the record was
      // still set, and often it's how you died.
      raise(recordAlert(getSettings(), scores, record));
    },

    line(line) {
      const settings = getSettings();
      // Every line in the log comes through here, so the two cheap "is anybody listening?" questions
      // are asked before the line is read at all.
      const cancels = queue.watchesLines();
      const matches = watchesLines(settings);
      if (!cancels && !matches) return;

      const context = where();
      // Cancelling first: a line that ends a cue shouldn't wait behind a match, and a rule that both
      // fires and cancels on the same words means the new cue rather than the old one.
      if (cancels) queue.noteLine(lineSubject(line.message, context));
      if (!matches) return;

      const watch = matchLine(line, settings, Date.now(), context);
      if (!watch) return;
      queue.schedule(
        {
          caster: "",
          spell: watch.spell,
          text: line.message,
          at: line.at,
          event: "line",
          message: watch.message,
          style: alertStyle(settings, watch),
        },
        watch,
      );
    },

    clear: () => queue.clear(),
    pending: () => queue.pending(),
  };
}

/**
 * The banner for a record that just fell.
 *
 * The score travels **raw** rather than pre-worded, which is the one way this differs from every
 * other payload here. A watch's wording had to be resolved in main because the overlay never sees
 * the watch — but the score *catalog* is shared code, so the overlay can name and format the
 * category itself and there is nothing to resolve. What still has to happen here is the look, since
 * that's settings the overlay only knows the defaults of.
 *
 * `spell` carries the category id: nothing reads it for a record banner, but every other payload
 * fills it, and a field left blank is a field the next reader has to wonder about.
 */
export function recordAlert(
  settings: CastAlertSettings,
  scores: HighScoreSettings,
  record: HighScore,
): CastAlertEvent {
  return {
    caster: "",
    spell: record.categoryId,
    at: record.at,
    event: "record",
    record,
    // A celebration wears a **saved style** or the defaults, and never a look of its own — see
    // `HighScoreSettings`. Resolved through the same layering every alert uses.
    style: alertStyle(settings, { styleId: scores.styleId }),
  };
}

/**
 * A **sample** record, for the 🔔 on the scoreboard. Beside the real one for the same reason
 * `sampleAlert` is beside the live payloads: a preview is only worth anything if it takes the shape
 * the real thing will, and `beaten`/`previous` are what make the banner say "beats 1,180" rather
 * than treating it as a bar being set for the first time.
 */
export function sampleRecord(settings: CastAlertSettings, scores: HighScoreSettings, at: string): CastAlertEvent {
  return recordAlert(settings, scores, {
    categoryId: "biggest-hit",
    value: 1_204,
    at,
    detail: "Ice Comet on a froglok shaman",
    previous: 1_180,
    beaten: 4,
  });
}

/**
 * The banner a **sample** alert should show — what the Settings Test button sends down the real
 * broadcast path, for one watch or for the defaults.
 *
 * Here beside the live payloads rather than in `ipc.ts`, because the whole worth of a preview is that
 * it takes the shape the real alert will: a **line** watch draws the game's own sentence with no call
 * to action and a **fade** says "re-cast", so previewing either as a cast would flatter the styling
 * and show a banner that never appears. `at` is passed in rather than read, so this stays pure.
 */
export function sampleAlert(
  settings: CastAlertSettings,
  watch: CastWatch | undefined,
  at: string,
  /**
   * A look to show instead of the one the watch would resolve to — for previewing a style while
   * *editing* it, where the thing being tried isn't attached to any rule (the defaults, a saved
   * style, a rule's own look mid-edit).
   */
  style?: AlertStyle,
): CastAlertEvent {
  const spell = watch?.spell.trim() || "Fear";
  const shape: Partial<CastAlertEvent> = watch?.onLine
    ? { caster: "", event: "line", text: `A log line containing “${spell}”` }
    : watch?.onFade && watch.onCast === false
      ? { caster: "", event: "fade" }
      : { caster: "Test", event: "cast" };
  return {
    caster: "Test",
    spell,
    at,
    // Its own wording too, or the preview shows a sentence the real alert never uses.
    message: watch?.message,
    style: style ?? alertStyle(settings, watch),
    ...shape,
  };
}
