/**
 * watch-share.ts — a rule you can hand to somebody else.
 *
 * A watch that took ten minutes to get right is worth more than one player's settings file: the
 * whole reason the wording is hard is that it comes from a log nobody has memorised, so the person
 * who worked it out has done the expensive part. EQBuddy reached the same conclusion and ships an
 * `EQB1` share string (`src/EQBuddy.Core/WatchRuleShare.cs`); this is ours.
 *
 * The format is one line — `EQLW1:<base64 of JSON>` — because the transport is a chat window, a
 * Discord message or a wiki page, and anything with newlines in it arrives mangled. Plain JSON is
 * accepted on the way *in* as well, so a rule can be hand-written or diffed, but not produced: a
 * pasted blob of braces invites editing the parts that shouldn't be edited (ids above all).
 *
 * **Everything imported is untrusted.** It arrives from a stranger via the clipboard, so nothing is
 * taken on faith: unknown keys are dropped, every value is checked against what the type actually
 * allows, strings are clamped, lists are capped, and **ids are regenerated** so an import can never
 * collide with or silently overwrite a rule already on the list. What can't be read is reported
 * rather than guessed at — an import that half-works is worse than one that says what it refused.
 *
 * A shared rule deliberately carries **no style**: a `styleId` would point at a saved style the
 * recipient hasn't got, and a full style would impose the sender's colours and their idea of where
 * the banner belongs. What travels is the rule — what to match, and when to say it.
 */
import type { CastWatch, WatchCondition, WatchField, WatchOp } from "./types";

/** Version-stamped, so a later format can be told apart rather than half-read. */
export const SHARE_PREFIX = "EQLW1:";

/** Caps. Generous for real use, small enough that a hostile paste can't be a denial of service. */
const MAX_WATCHES = 50;
const MAX_CONDITIONS = 20;
const MAX_TEXT = 200;

const FIELDS: WatchField[] = ["subject", "caster", "target", "line", "zone"];
const OPS: WatchOp[] = ["contains", "exact", "starts", "ends"];
const RETRIGGERS: NonNullable<CastWatch["retrigger"]>[] = ["restart", "queue", "ignore"];
const DEATHS: NonNullable<CastWatch["cancelOnDeath"]>[] = ["auto", "always", "never"];

/** The wire shape: a watch minus everything local to one player (its id, and its look). */
type SharedWatch = Omit<CastWatch, "id" | "style" | "styleId">;

/** One or more rules as a single pasteable line. */
export function encodeWatches(watches: CastWatch[]): string {
  const payload = { v: 1, watches: watches.map(strip) };
  return SHARE_PREFIX + toBase64(JSON.stringify(payload));
}

/**
 * What stays behind: the `id` (the recipient gets a fresh one), both kinds of style (see the module
 * note), and `enabled` — a rule arrives switched on, because you asked for it.
 */
const LOCAL_ONLY = new Set(["id", "enabled", "style", "styleId"]);

/** Drop what shouldn't travel, and what's merely absent — a share string reads better without nulls. */
function strip(watch: CastWatch): SharedWatch {
  const shared = Object.entries(watch).filter(([k, v]) => !LOCAL_ONLY.has(k) && v !== undefined && v !== "");
  return Object.fromEntries(shared) as SharedWatch;
}

export interface ImportResult {
  /** What can be added, with fresh ids. Empty when nothing could be read. */
  watches: CastWatch[];
  /** What was refused, and why — shown to the player rather than swallowed. */
  errors: string[];
}

/**
 * Read a share string (or bare JSON) into watches that are safe to add.
 *
 * `newId` is injected because ids come from `crypto.randomUUID()` in the renderer and a test wants
 * to know what it's asserting on — the same reason the alert queue takes its timers.
 */
export function decodeWatches(text: string, newId: () => string): ImportResult {
  const errors: string[] = [];
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { watches: [], errors: ["Nothing to import — paste a rule first."] };

  const json = trimmed.startsWith(SHARE_PREFIX) ? fromBase64(trimmed.slice(SHARE_PREFIX.length)) : trimmed;
  if (json === null) return { watches: [], errors: ["That share code is damaged — it may have been cut short."] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return {
      watches: [],
      errors: [`That doesn't look like a rule. A share code starts with “${SHARE_PREFIX}”.`],
    };
  }

  // Three shapes are accepted: the payload we write, a bare array, and a single bare watch — the
  // three things a person actually ends up with a copy of.
  const list = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.watches)
      ? parsed.watches
      : isRecord(parsed)
        ? [parsed]
        : null;
  if (!list) return { watches: [], errors: ["That's readable, but it isn't a rule."] };
  if (!list.length) return { watches: [], errors: ["That share code holds no rules."] };

  const watches: CastWatch[] = [];
  for (const [i, raw] of list.slice(0, MAX_WATCHES).entries()) {
    const watch = readWatch(raw, newId);
    if (watch) watches.push(watch);
    else errors.push(`Rule ${i + 1} couldn't be read, so it was skipped.`);
  }
  if (list.length > MAX_WATCHES) errors.push(`Only the first ${MAX_WATCHES} rules were taken.`);
  return { watches, errors };
}

/** One watch, field by field, taking only what the type allows and only if it's the right shape. */
function readWatch(raw: unknown, newId: () => string): CastWatch | null {
  if (!isRecord(raw)) return null;
  const spell = str(raw.spell);
  const conditions = readConditions(raw.conditions);
  // The one rule that isn't about types: a rule that can match nothing isn't a rule.
  if (!spell && !conditions.length) return null;

  const watch: CastWatch = { id: newId(), spell, enabled: true };
  if (conditions.length) watch.conditions = conditions;
  if (raw.match === "any") watch.match = "any";
  if (typeof raw.onCast === "boolean") watch.onCast = raw.onCast;
  if (raw.onFade === true) watch.onFade = true;
  if (raw.onLine === true) watch.onLine = true;
  if (raw.includePlayers === true) watch.includePlayers = true;
  if (typeof raw.includeSelf === "boolean") watch.includeSelf = raw.includeSelf;
  const message = str(raw.message);
  if (message) watch.message = message;
  const delay = str(raw.delay);
  if (delay) watch.delay = delay;
  if (typeof raw.repeat === "number" && Number.isFinite(raw.repeat) && raw.repeat > 0) {
    watch.repeat = Math.trunc(raw.repeat);
  }
  if (oneOf(raw.retrigger, RETRIGGERS)) watch.retrigger = raw.retrigger;
  if (oneOf(raw.cancelOnDeath, DEATHS)) watch.cancelOnDeath = raw.cancelOnDeath;
  const cancelWhen = readConditions(raw.cancelWhen);
  if (cancelWhen.length) watch.cancelWhen = cancelWhen;
  return watch;
}

/** Conditions, dropping any row that isn't one rather than failing the whole rule over it. */
function readConditions(raw: unknown): WatchCondition[] {
  if (!Array.isArray(raw)) return [];
  const out: WatchCondition[] = [];
  for (const item of raw.slice(0, MAX_CONDITIONS)) {
    if (!isRecord(item)) continue;
    const text = str(item.text);
    if (!text || !oneOf(item.field, FIELDS) || !oneOf(item.op, OPS)) continue;
    const condition: WatchCondition = { field: item.field, op: item.op, text };
    if (item.exclude === true) condition.exclude = true;
    out.push(condition);
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.slice(0, MAX_TEXT).trim() : "");
function oneOf<T extends string>(v: unknown, allowed: T[]): v is T {
  return typeof v === "string" && (allowed as string[]).includes(v);
}

// ── base64, over UTF-8 ─────────────────────────────────────────────────────────
// `btoa` is bytes-only and a watch can hold anything EQ prints — the backtick in "Kainos`s warder"
// is the tame end of it — so the text is encoded to UTF-8 first and decoded back after. Both
// globals exist in Node and in the browser, which is what keeps this module shared.

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** `null` for anything that isn't base64 — a share code cut short by a chat client, usually. */
function fromBase64(code: string): string | null {
  try {
    const binary = atob(code.trim());
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}
