/**
 * once.ts — do something on the *first* of several signals, and never again.
 *
 * Both of the app's launch races want exactly this shape. A window is up when it has painted
 * (`ready-to-show`) **or** when it has finished loading (`did-finish-load`) — and if neither ever
 * arrives, a deadline has to mean it anyway, because the alternative is a step of the launch left
 * undone for ever: a window that is never shown, or the alert overlay never being created at all.
 *
 * Whichever gets there first wins and the rest are no-ops, so a caller can wire up every signal it
 * has without having to work out which one to trust. `afterLoad` (main.ts) and `revealWhenReady`
 * (windows.ts) had a copy of the flag each; the flag is the whole idea, so it lives here.
 */

/** Wrap `fn` so that however many times the result is called, `fn` runs exactly once. */
export function once(fn: () => void): () => void {
  let ran = false;
  return () => {
    if (ran) return;
    ran = true;
    fn();
  };
}
