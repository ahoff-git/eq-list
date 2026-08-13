/**
 * watch-check.ts — does this rule make sense, and what would it actually have done?
 *
 * Two questions, one module, because they are two halves of the same answer. A rule language buys
 * expressiveness with the risk that a rule can now be *quietly* wrong: it parses, it saves, it looks
 * right on the row, and it simply never fires — or fires on everything. Neither failure announces
 * itself, and both are found at the worst possible moment.
 *
 *   - **`checkWatch`** is the static half: the combinations that cannot do what they look like. A
 *     condition on `caster` in a fade-only watch can never hold; an exclusion that repeats the
 *     trigger can never pass; a repeat with no brake was silently reduced to one alert. Each is
 *     something a person would spot by reading carefully, which is exactly the sort of thing to
 *     stop asking people to do.
 *   - **`dryRun`** is the empirical half, and the more convincing one: take the lines the log has
 *     actually produced and say which of them this rule would have fired on. A rule you can *test*
 *     is a rule you can trust — and it needs no game, no waiting, and no guessing about wording,
 *     which is the thing that makes EQ watches hard to get right in the first place.
 *
 * The dry run deliberately reuses the real pipeline — `parseSplitLine` and the three matchers — so
 * it can only be right or wrong in the same way the live path is. The two differences are both
 * intentional: it matches with `now` set to **the line's own timestamp** (every replayed line is
 * stale by definition, and staleness is a rule about live alerting, not about the words), and it
 * runs the watch **alone**, so an earlier watch in the list can't shadow the one being tested.
 *
 * Pure: the lines come from the caller, so the renderer runs this over a buffer it asked main for.
 */
import { lineSubject, matchCast, matchFade, matchLine } from "./cast-alerts";
import { parseSplitLine } from "./parse-line";
import { alertCue, parseDelay, usableCancels } from "./alert-schedule";
import { activeConditions, conditionMatches, describeCondition, wantsCast, watchSpeaks } from "./watch-conditions";
import type { CastAlertSettings, CastWatch, LogLine, WatchCondition } from "./types";

/**
 * How short a raw-text trigger has to be before it's worth warning about.
 *
 * Three characters or fewer against a whole log line is thousands of matches a night — "hit" is the
 * example ADR 0050 uses. Four is where a word starts being a word; it is a judgement, not a
 * measurement, which is why it warns rather than refuses.
 */
const SHORTEST_RAW_TRIGGER = 4;

/** How many matching lines a replay lists. Enough to recognise a pattern, few enough to read. */
const DEFAULT_HITS = 20;

/** How much a problem matters. An `error` means it cannot work; a `warning` means it probably won't. */
export type IssueLevel = "error" | "warning";

export interface WatchIssue {
  level: IssueLevel;
  /** Said to the player, in full sentences — this is the whole value of the check. */
  message: string;
}

/**
 * Everything wrong with a rule, worst first.
 *
 * `others` is the rest of the list, for the one check that needs it (a duplicate of another watch);
 * omit it and that check simply doesn't run.
 */
export function checkWatch(watch: CastWatch, others: CastWatch[] = []): WatchIssue[] {
  const issues: WatchIssue[] = [];
  const err = (message: string) => issues.push({ level: "error", message });
  const warn = (message: string) => issues.push({ level: "warning", message });

  const conditions = activeConditions(watch.conditions);
  const trigger = watch.spell.trim().toLowerCase();
  const casts = wantsCast(watch);

  // ── it cannot fire at all ────────────────────────────────────────────────────
  if (!watchSpeaks(watch)) {
    err("This watch has nothing to match on, so it will never fire. Give it some words, or a condition.");
  }
  if (!casts && !watch.onFade && !watch.onLine) {
    err("Nothing is ticked under “fires on”, so no log line can reach this watch.");
  }
  if (watch.match !== "any") {
    const impossible = conditions.find((c) => c.exclude && c.text.trim().toLowerCase() === trigger && trigger);
    if (impossible) {
      err(`This excludes the very words it matches on (“${impossible.text.trim()}”), so it can never fire.`);
    }
  }

  // ── a condition that can never hold, given what this watch reads ─────────────
  const readable = fieldsAvailable(watch);
  for (const c of conditions) {
    if (readable.has(c.field) || c.exclude) continue;
    warn(`“${describeCondition(c)}” can't hold here: ${WHY_UNAVAILABLE[c.field]}`);
  }

  // ── timing ───────────────────────────────────────────────────────────────────
  if (parseDelay(watch.delay) === null) {
    warn(`“${watch.delay}” isn't a delay we can read, so this alerts immediately. Try 25, 8m, or 1m 30s.`);
  }
  const cue = alertCue(watch);
  if ((watch.repeat ?? 0) > 0 && !cue.repeat) {
    warn(
      cue.delayMs
        ? "A repeat needs something able to stop it — words to cancel on, or a death that cancels it. This will alert once."
        : "A repeat only means something with a delay. This will alert once.",
    );
  }
  if ((watch.cancelWhen ?? []).some((c) => c.exclude)) {
    warn("A cancel can't be inverted — “stop unless” would end the cue on the next line. That row is ignored.");
  }
  if (!cue.delayMs && activeConditions(watch.cancelWhen).length) {
    warn("There's nothing to cancel: this alert fires immediately, so the “stop it when” lines never apply.");
  }

  // ── aim ──────────────────────────────────────────────────────────────────────
  if (watch.onLine && trigger && trigger.length < SHORTEST_RAW_TRIGGER && !conditions.length) {
    warn(`“${watch.spell.trim()}” is short for raw text — it will match a great many lines. Consider more words.`);
  }
  const twin = others.find((o) => o.id !== watch.id && o.enabled && sameTrigger(o, watch));
  if (twin) {
    warn("Another enabled watch matches exactly the same thing. Only the first one in the list will fire.");
  }

  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === "error" ? -1 : 1));
}

/** Which subject fields can ever carry text, given the kinds of event this watch accepts. */
function fieldsAvailable(watch: CastWatch): Set<WatchCondition["field"]> {
  const fields = new Set<WatchCondition["field"]>(["subject", "line", "zone"]);
  if (wantsCast(watch)) fields.add("caster");
  if (watch.onFade) fields.add("target");
  return fields;
}

const WHY_UNAVAILABLE: Record<WatchCondition["field"], string> = {
  subject: "",
  line: "",
  zone: "",
  caster: "only a cast names a caster, and this watch isn't watching casts.",
  target: "only a fade names who it wore off, and this watch isn't watching fades.",
};

/** Two watches aimed at exactly the same thing — same words, same prompts, same conditions. */
function sameTrigger(a: CastWatch, b: CastWatch): boolean {
  if (a.spell.trim().toLowerCase() !== b.spell.trim().toLowerCase()) return false;
  if (wantsCast(a) !== wantsCast(b) || !!a.onFade !== !!b.onFade || !!a.onLine !== !!b.onLine) return false;
  const key = (w: CastWatch) =>
    activeConditions(w.conditions)
      .map((c) => `${c.exclude ? "!" : ""}${c.field}:${c.op}:${c.text.trim().toLowerCase()}`)
      .sort()
      .join("|");
  return key(a) === key(b);
}

// ── the replay ─────────────────────────────────────────────────────────────────

/** One line the rule would have fired on. */
export interface DryRunHit {
  at: string;
  /** The log's own sentence, so the player recognises what they're looking at. */
  line: string;
  /** Which prompt it would have been. */
  event: "cast" | "fade" | "line";
}

export interface DryRunResult {
  /** The matches, newest first, capped at `limit`. */
  hits: DryRunHit[];
  /** How many matched in total — `hits.length` when it's under the cap. */
  total: number;
  /** How many lines were read. Says how much a "0 hits" answer is worth. */
  scanned: number;
  /** Lines that would have **cancelled** a waiting cue, for a rule that has cancelling words. */
  cancels: number;
}

/**
 * What this rule would have done to the lines it's given, newest first.
 *
 * The zone is replayed too: a `zone` condition is judged against the zone you were in *at that line*,
 * recovered from the zone lines in the buffer, because a rule scoped to Lower Guk should be testable
 * against the evening you spent there rather than against wherever you happen to be standing now.
 */
export function dryRun(
  watch: CastWatch,
  settings: CastAlertSettings,
  lines: LogLine[],
  limit = DEFAULT_HITS,
): DryRunResult {
  // The watch alone, and alerting on: a dry run answers "what does *this rule* do", not "what does
  // the app currently do", so neither the master switch nor a watch above it may change the answer.
  const only: CastAlertSettings = { ...settings, enabled: true, watches: [watch] };
  const cancels = usableCancels(watch);
  const hits: DryRunHit[] = [];
  let total = 0;
  let cancelled = 0;
  let zone: string | undefined;

  for (const line of lines) {
    const at = Date.parse(line.at);
    const now = Number.isNaN(at) ? Date.now() : at;
    const event = parseSplitLine(line);
    if (event?.kind === "zone") zone = event.zone;
    const context = { zone };
    if (cancels.some((c) => conditionMatches(c, lineSubject(line.message, context)))) cancelled += 1;

    const hit = matchOne(watch, only, line, event, now, context);
    if (!hit) continue;
    total += 1;
    hits.push({ at: line.at, line: line.message, event: hit });
  }
  return { hits: hits.slice(-limit).reverse(), total, scanned: lines.length, cancels: cancelled };
}

/** Which prompt, if any, this one line would have raised — the live path's own three questions. */
function matchOne(
  watch: CastWatch,
  only: CastAlertSettings,
  line: LogLine,
  event: ReturnType<typeof parseSplitLine>,
  now: number,
  context: { zone?: string },
): DryRunHit["event"] | null {
  if (event?.kind === "cast" && matchCast(event, only, now, context)) return "cast";
  if (event?.kind === "buff-faded" && matchFade(event, only, now, context)) return "fade";
  if (matchLine(line, only, now, context)) return "line";
  return null;
}

/** Does this rule read the log's own lines — the check that decides whether a replay can say anything? */
export function canDryRun(watch: CastWatch): boolean {
  return watchSpeaks(watch);
}
