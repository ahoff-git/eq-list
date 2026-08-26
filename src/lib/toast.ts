"use client";
import { useEffect, useState } from "react";
import { queueToast, type Toast, type ToastInput } from "@/shared/toasts";

/**
 * toast.ts — raising one of the app's brief notices, from anywhere in a window.
 *
 * **A bus, not a context, and that is the reusable part.** `showToast` is an ordinary function with
 * no hook and no provider around it, so it can be called from a component, from an event handler, or
 * from a plain module several layers below one (`addToList.ts` is the first) — none of which has a
 * parent to thread a callback down from. A toast is a one-way announcement; the panel that raised it
 * may well be unmounted (a tab switch) before it fades.
 *
 * To use it: call `showToast({ title, detail?, tone?, key?, ms?, action? })`. The only requirement is that the
 * window has mounted `<Toasts />` once — both `page.tsx`es do. What a toast *is*, and what the stack
 * does with a second notice about the same thing, is `shared/toasts.ts`.
 */
export {
  MAX_TOASTS,
  MIN_TOAST_MS,
  TOAST_LEAVE_MS,
  TOAST_MS,
  toastTiming,
  type Toast,
  type ToastAction,
  type ToastInput,
  type ToastTone,
} from "@/shared/toasts";

const listeners = new Set<(t: Toast) => void>();
let nextId = 1;

/**
 * Announce something. Returns nothing — a caller never waits on a toast, and nothing depends on one
 * having been seen.
 *
 * Raised in a window with no `<Toasts />` (or before it mounts), it is simply dropped. That's the
 * intended failure: a toast is never the only place something is said.
 */
export function showToast(toast: ToastInput): void {
  const full: Toast = { ...toast, id: nextId++ };
  for (const on of listeners) on(full);
}

/** Follow the bus. Only the toast host wants this. */
function subscribe(on: (t: Toast) => void): () => void {
  listeners.add(on);
  return () => void listeners.delete(on);
}

/**
 * The live notices, oldest first, with the way to drop one.
 *
 * Expiry is the card's own business (it owns the timer beside its exit animation); this only holds
 * the queue. A replaced notice arrives with a **new `id`**, which is the card's React key — so it
 * remounts, and its life and its entry animation start again rather than the old card sitting there
 * with new words in it and two seconds left.
 */
export function useToasts(): { toasts: Toast[]; dismiss: (id: number) => void } {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribe((t) => setToasts((all) => queueToast(all, t))), []);
  const dismiss = (id: number) => setToasts((all) => all.filter((t) => t.id !== id));
  return { toasts, dismiss };
}
