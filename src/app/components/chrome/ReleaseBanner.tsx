"use client";
import type { Releases } from "@/lib/releases/useReleases";

/**
 * "You've updated — here's what changed", between the titlebar and the tabs, in the slot the update
 * banner uses. A strip rather than a dialog: this window floats over the game, and a modal there is a
 * blackout (ADR 0052), so the notes wait to be opened instead of taking the screen.
 *
 * Stays until it's answered — opened, or dismissed — so an update that landed while the window was hidden
 * to the tray is still announced the next time it is looked at. Dismissing doesn't lose the notes: they are
 * under Settings → What's new either way.
 */
export default function ReleaseBanner({ releases, onOpen }: { releases: Releases; onOpen: () => void }) {
  if (!releases.fresh.length || releases.answered) return null;
  return (
    <div className="update-banner no-drag">
      <span className="ub-dot" aria-hidden />
      <span className="ub-text">{releases.headline}</span>
      <span className="spacer" />
      <button className="btn sm primary" onClick={onOpen}>
        What&apos;s new
      </button>
      <button className="btn ghost sm" title="Dismiss — the notes stay under Settings → What's new" onClick={releases.answer}>
        ✕
      </button>
    </div>
  );
}
