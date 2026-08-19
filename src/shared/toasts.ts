/**
 * toasts.ts — the app's brief "that worked" notices: what one is, and the rules for the stack.
 *
 * A toast is the smallest possible answer to *did that do anything?* — a line, optionally a second
 * line, gone by itself. It exists because most of what this app does happens somewhere the player
 * isn't looking: the shopping list is another tab, the stores are another process, and a button that
 * fires an IPC call and returns void looks identical whether it worked or not
 * ([ADR 0106](../../specs/decisions/0106-an-add-says-what-it-did.md)).
 *
 * **The invariants, which are what make it safe to use anywhere:** a toast is *read*, never *acted
 * on* (anything with a decision in it is a panel, or a dialog); it always goes away on its own; and
 * it is never the only place something important is said, because a notice that has faded is a notice
 * nobody can go back to. A failure that matters belongs in the log and on the panel that owns it
 * ([ADR 0052](../../specs/decisions/0052-an-error-goes-to-the-log-not-the-screen.md)); a toast may
 * *mention* it.
 *
 * Pure and dependency-free: the model and its arithmetic live here so both can be tested without a
 * window. The bus and the hook are `src/lib/toast.ts`; the cards are `components/Toasts.tsx`.
 */

/**
 * What kind of news this is. Only the accent stripe changes — a notice must stay the same *shape* as
 * everything else in the window, or it stops being a notice and becomes an interruption.
 */
export type ToastTone = "info" | "good" | "warn" | "bad";

/** What a caller says. Everything but the title is optional. */
export interface ToastInput {
  /** The headline: what happened, in a few words. */
  title: string;
  /** The figure or the reason behind it — the part you don't need to have read. */
  detail?: string;
  tone?: ToastTone;
  /**
   * What this notice is *about* — an item, a quest page, a setting. A second notice with the same key
   * **replaces** the first instead of stacking beside it: pressing a button twice is one thing said
   * twice, and two cards disagreeing about the result (the first says 1, the second says 2) is worse
   * than one card that has been updated. Omit it and every notice stands on its own.
   */
  key?: string;
  /** How long this one sits, when the default is wrong for it. Clamped by `toastTiming`. */
  ms?: number;
}

/** A notice on the stack. `id` is the bus's, so a repeat is a new card rather than the same one. */
export interface Toast extends ToastInput {
  id: number;
}

/** How long a notice sits before it fades — long enough to read, short enough to ignore. */
export const TOAST_MS = 3200;

/**
 * The floor on a life. A card that leaves before it has finished arriving reads as a flicker, which
 * is worse than no confirmation at all — so a caller asking for 200ms gets this instead.
 */
export const MIN_TOAST_MS = 1200;

/** How much of a life is spent fading out. Matches `.toast.leaving`'s transition in globals.css. */
export const TOAST_LEAVE_MS = 260;

/** At most this many at once: a whole-quest add is one notice, not ten stacked ones. */
export const MAX_TOASTS = 3;

/**
 * When a card starts leaving, and when it's gone — one calculation, so the CSS transition and the
 * timer that drops the card can't disagree about which happens first.
 */
export function toastTiming(ms: number = TOAST_MS): { life: number; leaveAt: number } {
  const life = Math.max(MIN_TOAST_MS, ms);
  return { life, leaveAt: life - TOAST_LEAVE_MS };
}

/**
 * The stack with `next` on it.
 *
 * A keyed repeat lands **in the slot the old one held**, so the answer to a second press appears
 * where the reader is already looking rather than jumping to the bottom of the stack. Everything
 * else is appended, oldest dropped past the cap — and note the cap is only applied when the stack
 * actually grows, or a replacement could push an unrelated notice off the top.
 */
export function queueToast(all: Toast[], next: Toast, max: number = MAX_TOASTS): Toast[] {
  const at = next.key ? all.findIndex((t) => t.key === next.key) : -1;
  if (at >= 0) return all.map((t, i) => (i === at ? next : t));
  return [...all, next].slice(-max);
}
