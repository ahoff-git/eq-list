/**
 * watch-conditions.ts — whether what the log just said satisfies a watch's conditions.
 *
 * A watch used to be one substring, which is the right size for "Fear" and the wrong size for every
 * request that followed it: *not* from a warder, only in this zone, either of two spellings, any
 * tell except a guild-mate's. Each of those is a second thing to say about the same match, so a
 * watch grows a list of them rather than the app growing a setting per request.
 *
 * The shape is deliberately the one people already know from mail filters and search boxes:
 *
 *   - every condition reads one **field** of what happened (`WatchField`) with one **operator**
 *     (`WatchOp`), case-insensitively, exactly as the trigger always has;
 *   - **`match: "all"`** (the default) or **`"any"`** decides how the trigger and the included
 *     conditions combine — "any" is what lets one watch cover two spellings;
 *   - an **exclusion** is always `and not`, whatever `match` says, because "any of these, or not
 *     that" is not a thing anyone means and reads as a bug when it fires.
 *
 * The trigger itself is condition zero: `subjectOf` hands this module the same text `matchCast` and
 * friends always matched, so a watch with no conditions behaves exactly as it did before this file
 * existed — the property the tests pin hardest, since every shipped settings file is that watch.
 *
 * Pure and no I/O. What a *cast* is allowed to fire (your own casts, named casters, staleness) stays
 * in [cast-alerts.ts](./cast-alerts.ts): those are rules about the event, not about the watch.
 */
import type { CastWatch, WatchCondition, WatchField, WatchOp } from "./types";

/**
 * What the log said, in the one shape conditions can read.
 *
 * Built by the caller from a cast, a fade or a bare line, so that this module never learns the
 * difference — a condition on `caster` is simply unmet when nothing was casting.
 */
export interface WatchSubject {
  /**
   * What the watch's own trigger matches: the spell name for a cast or a fade, the whole sentence
   * for a raw-text watch. Named for the role rather than the content, because which one it is
   * depends on the event and no condition should have to care.
   */
  subject: string;
  /** Who was casting. Empty for a fade or a line, which name nobody we can classify. */
  caster?: string;
  /** Who a fade wore off ("your pet", a mob). Absent means you. */
  target?: string;
  /** The whole log line the event came from, timestamp already off. Always present. */
  line: string;
  /** The zone you were in when it happened — app state, not something the line says. */
  zone?: string | null;
}

/** Read one field off the subject. Absent reads as empty, which no condition can match. */
function fieldText(subject: WatchSubject, field: WatchField): string {
  switch (field) {
    case "subject":
      return subject.subject;
    case "caster":
      return subject.caster ?? "";
    case "target":
      return subject.target ?? "";
    case "line":
      return subject.line;
    case "zone":
      return subject.zone ?? "";
  }
}

/** Compare, already lowercased on both sides. */
function compare(haystack: string, op: WatchOp, needle: string): boolean {
  switch (op) {
    case "contains":
      return haystack.includes(needle);
    case "exact":
      return haystack === needle;
    case "starts":
      return haystack.startsWith(needle);
    case "ends":
      return haystack.endsWith(needle);
  }
}

/**
 * Does this condition's text actually appear where it was pointed? The plain question, with no
 * regard for `exclude` — a blank condition matches nothing, so it can never *cause* anything.
 *
 * This is the one a **cancelling** condition asks (`CastWatch.cancelWhen`), where inverting would be
 * a trap rather than a feature: "cancel when the line doesn't say X" would have the very next line
 * end the cue.
 */
export function conditionMatches(condition: WatchCondition, subject: WatchSubject): boolean {
  const needle = condition.text.trim().toLowerCase();
  if (!needle) return false;
  return compare(fieldText(subject, condition.field).toLowerCase(), condition.op, needle);
}

/**
 * Is this condition **satisfied** — matched, or excluded and absent? A blank condition is not a
 * condition: it is satisfied either way, so a row the user is halfway through typing never changes
 * what fires.
 */
export function conditionHolds(condition: WatchCondition, subject: WatchSubject): boolean {
  if (!condition.text.trim()) return true;
  const hit = conditionMatches(condition, subject);
  return condition.exclude ? !hit : hit;
}

/** A condition that says nothing — blank text. Kept out of the `any` tally so it can't carry a match. */
const isBlank = (condition: WatchCondition) => !condition.text.trim();

/**
 * Does the watch's trigger *and* its conditions hold for what just happened?
 *
 * `triggerHit` is the caller's own answer about the trigger text, because only it knows which field a
 * given event's trigger reads. **`null` means the trigger says nothing** — it's blank — which is not
 * the same as "it didn't match": a watch may now be nothing but conditions ("anything BunnySlayer
 * casts"), and a blank trigger has to step aside for them rather than veto them. What it must never
 * do is match *everything*, so a watch with neither a trigger nor a condition fires on nothing at
 * all — the rule blank watches have always had, kept for the shape that can now reach it two ways.
 */
export function conditionsHold(watch: CastWatch, subject: WatchSubject, triggerHit: boolean | null): boolean {
  const conditions = watch.conditions ?? [];
  // Exclusions are a veto, evaluated the same either way — an excluded condition that matches ends
  // it here regardless of `match`, so "any" can never talk one of them round.
  for (const condition of conditions) {
    if (condition.exclude && !conditionHolds(condition, subject)) return false;
  }
  const included = conditions.filter((c) => !c.exclude && !isBlank(c));
  const holds = (c: WatchCondition) => conditionHolds(c, subject);
  const any = watch.match === "any";
  if (triggerHit === null) {
    if (!included.length) return false;
    return any ? included.some(holds) : included.every(holds);
  }
  // The trigger is condition zero: under "any" a trigger hit needs nothing else, which is what keeps
  // "any" from firing on a condition the user wrote to *narrow* the watch.
  return any ? triggerHit || included.some(holds) : triggerHit && included.every(holds);
}

/**
 * Does this watch say anything at all? A watch with a blank trigger and no usable condition matches
 * nothing, so callers can skip it — and the "is anyone watching lines?" shortcut can stay honest now
 * that a line watch needn't have trigger text.
 */
export function watchSpeaks(watch: CastWatch): boolean {
  return !!watch.spell.trim() || activeConditions(watch.conditions).length > 0;
}

/**
 * Does this watch want casts? Unset means yes — every watch predates the choice, and that can't
 * change now. Here rather than in the matcher because four other files ask the same question.
 */
export const wantsCast = (watch: CastWatch): boolean => watch.onCast !== false;

/** Human wording for one condition, e.g. `caster is not BunnySlayer`. Used by the row summary. */
export function describeCondition(condition: WatchCondition): string {
  const field = FIELD_WORDS[condition.field];
  const op = condition.exclude ? EXCLUDE_WORDS[condition.op] : OP_WORDS[condition.op];
  return `${field} ${op} ${condition.text.trim() || "…"}`;
}

const FIELD_WORDS: Record<WatchField, string> = {
  subject: "text",
  caster: "caster",
  target: "target",
  line: "line",
  zone: "zone",
};
const OP_WORDS: Record<WatchOp, string> = {
  contains: "has",
  exact: "is",
  starts: "starts",
  ends: "ends",
};

/**
 * The pickers' vocabulary, defined beside the code that reads it so a new field or operator can't
 * exist in the evaluator without a name, or in the UI without an implementation.
 */
export const WATCH_FIELDS: { value: WatchField; label: string; hint: string }[] = [
  { value: "subject", label: "text", hint: "What this watch is pointed at — the spell's name, or the sentence for a raw-text watch." },
  { value: "caster", label: "caster", hint: "Who was casting. Casts only: a fade or a bare line names nobody." },
  { value: "target", label: "target", hint: "Who a fade wore off — “your pet”, or the mob's name. Empty means it was on you." },
  { value: "line", label: "whole line", hint: "The entire log line, exactly as the game printed it. Works for every kind of event." },
  { value: "zone", label: "zone", hint: "The zone you're in — what the app knows, not something the line says." },
];
export const WATCH_OPS: { value: WatchOp; label: string }[] = [
  { value: "contains", label: "contains" },
  { value: "exact", label: "is exactly" },
  { value: "starts", label: "starts with" },
  { value: "ends", label: "ends with" },
];
const EXCLUDE_WORDS: Record<WatchOp, string> = {
  contains: "hasn't",
  exact: "isn't",
  starts: "doesn't start",
  ends: "doesn't end",
};

/** The conditions that actually do something — what the UI counts, so a blank row isn't advertised. */
export function activeConditions(conditions: WatchCondition[] | undefined): WatchCondition[] {
  return (conditions ?? []).filter((c) => !isBlank(c));
}
