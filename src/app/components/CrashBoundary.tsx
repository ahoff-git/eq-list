"use client";
import { useEffect } from "react";
import { reportCrash } from "@/lib/error-reporting";

export type CrashProps = { error: Error & { digest?: string }; reset: () => void };

/**
 * Build the default export for an `error.tsx`: log the crash, then show a small notice
 * saying `where` it happened — or show nothing at all (`visible: false`), which is the
 * right answer for the windows stretched over the game. Those are click-through or
 * modal-ish and cover a whole monitor, so any fallback there is a box the player is
 * stuck looking at; the log is where that crash belongs.
 */
export function crashBoundary(where: string, { visible = true } = {}) {
  return function CrashBoundary({ error, reset }: CrashProps) {
    // `where` is fixed when the boundary is built, so the error alone decides when to re-report.
    useEffect(() => reportCrash(where, error), [error]);
    if (!visible) return null;
    return (
      <div className="crash">
        <strong>Something went wrong in {where}.</strong>
        <span className="muted">Details are in the debug log — tray icon → Open debug log.</span>
        <button className="btn sm" onClick={reset}>
          Try again
        </button>
      </div>
    );
  };
}
