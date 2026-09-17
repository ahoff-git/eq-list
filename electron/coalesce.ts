/**
 * coalesce.ts — collapse a burst of calls into one, on a leading interval.
 *
 * Combat lines (and kills, and now a kill's own background re-derivation) arrive in floods — a
 * whole appended chunk per poll, or an entire log read from the top when it first appears — and no
 * UI, and no background recompute, needs one run per line. First written for `main.ts`'s own
 * broadcast throttling; shared here once `kill-log.ts` needed the exact same shape for a different
 * kind of burst.
 */

/** Run `fn` at most once per `ms` (it pulls whatever state it needs when it fires). */
export function coalesce(ms: number, fn: () => void): () => void {
  let timer: NodeJS.Timeout | null = null;
  return () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, ms);
  };
}
