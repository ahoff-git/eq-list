/**
 * watch-summary.ts — how a watch reads at a glance, and what's wrong with it.
 *
 * A watch used to be a substring and a few ticks, which a row of controls could show in full. It can
 * now be a trigger, several conditions, an exclusion, a delay, a repeat and a set of words that call
 * it off — far more than fits on a line, and the editor for it is folded away. So the row shows a
 * *summary*, and the summary is computed here: one place that knows how to say a rule in a few
 * words, testable without a browser.
 *
 * The second half is the part that earns its keep. A rule language quietly grows combinations that
 * don't do what they look like — a delay that can't be read, a repeat with no brake, a watch whose
 * every field is blank — and each of those is silent at exactly the moment the player is counting on
 * it. `problems` names them where they were typed, in the same words the ADR uses, rather than
 * leaving the player to wonder why nothing fired.
 */
import { alertCue, formatDelay, parseDelay } from "./alert-schedule";
import { activeConditions, describeCondition, wantsCast } from "./watch-conditions";
import { checkWatch, type WatchIssue } from "./watch-check";
import type { CastWatch } from "./types";

export interface WatchSummary {
  /** Which prompts it wants: "cast", "cast · fades", "raw text". Never empty — see `issues`. */
  prompts: string;
  /** When it speaks: "" for now, "25s", "8m ×3". */
  timing: string;
  /** What narrows it: "" for nothing, one condition's own words, or "3 conditions". */
  conditions: string;
  /** What's wrong with it (`watch-check.ts`). Empty for almost every watch. */
  issues: WatchIssue[];
}

/** `others` only feeds the "another watch already does this" check; omit it and that one is skipped. */
export function summarizeWatch(watch: CastWatch, others: CastWatch[] = []): WatchSummary {
  return {
    prompts: prompts(watch),
    timing: timing(watch),
    conditions: conditions(watch),
    issues: checkWatch(watch, others),
  };
}


function prompts(watch: CastWatch): string {
  const on = [wantsCast(watch) && "cast", watch.onFade && "fades", watch.onLine && "raw text"].filter(Boolean);
  return on.length ? on.join(" · ") : "nothing";
}

function timing(watch: CastWatch): string {
  const seconds = parseDelay(watch.delay);
  if (seconds === null) return "delay?";
  if (!seconds) return "";
  const { repeat } = alertCue(watch);
  return repeat ? `${formatDelay(seconds)} ×${repeat + 1}` : formatDelay(seconds);
}

function conditions(watch: CastWatch): string {
  const active = activeConditions(watch.conditions);
  if (!active.length) return "";
  if (active.length === 1) return describeCondition(active[0]);
  const joiner = watch.match === "any" ? "any of " : "";
  return `${joiner}${active.length} conditions`;
}

