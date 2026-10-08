"use client";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { showToast, TOAST_MS } from "@/lib/toast";
import type { CastAlertEvent } from "@/shared/types";

/** Longer than an ordinary toast's `TOAST_MS`: this one carries a click (View), and a completion is
 *  rarer and worth more than a moment's notice — the ordinary default is tuned for a toast nobody
 *  needs to act on. */
const ACHIEVEMENT_TOAST_MS = TOAST_MS * 3;

/**
 * "You just finished an achievement" — the click-through companion to the 🎉 banner
 * ([ADR 0143](../../../specs/decisions/0143-a-notice-may-point-at-where-to-answer-it.md)'s pattern,
 * on its third tab). The banner itself lives on the alert overlay, which sits over the game
 * click-through and unfocusable (see `CastAlerts.tsx`) — there is no click to catch there. This is
 * the same event, heard again in the interactive control window, with the one thing the overlay
 * can't offer: something to click.
 *
 * Scoped to `kind === "completed"` only. A criterion progressing (especially a tallying one, which
 * can fire on every kill) is exactly the noise ADR 0143 narrowed peer offers away from — the moment
 * worth a click is the achievement finishing, not each step toward it.
 *
 * Renders nothing, and mounted by the shell rather than by the Achievements tab, for the same reason
 * `PeerOfferToasts` is: a notice about a tab you aren't on has to come from something always mounted.
 */
export default function AchievementAlertToasts({ onView }: { onView: (achievementId: string) => void }) {
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.alerts.onCast((e: CastAlertEvent) => {
      const achievement = e.achievement;
      if (e.event !== "achievement" || !achievement || achievement.kind !== "completed") return;
      showToast({
        title: `${achievement.title} — complete!`,
        detail: `${achievement.done} of ${achievement.total} criteria`,
        tone: "good",
        // Keyed by achievement, so untick-and-retick-to-completion (setManual) replaces the earlier
        // card rather than stacking a second one about the same thing.
        key: `achievement:${achievement.id}`,
        ms: ACHIEVEMENT_TOAST_MS,
        action: { label: "View", run: () => onView(achievement.id) },
      });
    });
  }, [onView]);

  return null;
}
