"use client";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { showToast } from "@/lib/toast";
import type { PeerVersionNotice } from "@/shared/types";

/**
 * "The room is speaking a version of EQ List you haven't got."
 *
 * ## Why this exists at all, given it cannot help the people who need it most
 *
 * A client too old to understand a message is also too old to contain the code that would notice it
 * — so nothing shipped today can make yesterday's build say anything, and the builds already out
 * there will stay quiet for ever. That is not a reason to skip this; it is the reason to do it
 * *now*. From here on, every build can recognise the situation from the other side, so the next time
 * the wire moves ([ADR 0171](../../../specs/decisions/0171-a-shared-kind-states-what-a-row-is.md)),
 * the people left behind are told rather than left wondering why sharing with the rest of the camp
 * quietly went slow.
 *
 * ## Why only when we are the old one
 *
 * A peer on an older build is not a thing the reader can act on, and
 * [ADR 0143](../../../specs/decisions/0143-a-notice-may-point-at-where-to-answer-it.md)'s second
 * narrowing says a notice is only for what somebody has to *do* something about. It sits on their row
 * in the Peers tab for anyone curious. "You are the old build" is the half a person can fix.
 *
 * ## Why it isn't the update banner
 *
 * `UpdateBanner` answers a different question — "GitHub has published something newer" — from a
 * different source, on its own schedule, and it may not have polled yet or may have been dismissed.
 * This is evidence from the room itself, about a consequence you can watch happening: sharing with
 * these specific people is degraded *right now*. Two facts, two voices, and the action differs too —
 * the banner offers a download, and this one only ever points at where the trouble is visible.
 *
 * The action is navigation and nothing else, per `toasts.ts`'s invariant. And it is deliberately not
 * the only place this is said: the Peers tab marks the rows, because a notice that has faded is a
 * notice nobody can go back to.
 */
export default function PeerVersionToast({ onView }: { onView: () => void }) {
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.peer.onOutdated((notice: PeerVersionNotice) => {
      if (!notice.peers.length) return;
      showToast({
        title: "EQ List is out of date",
        // Names the people rather than the numbers: "protocol 3" means nothing to a player, and the
        // thing they actually recognise is who they are sitting with. Two names and a count, on the
        // same reasoning `offerSummary` uses for the same reason.
        detail: `${listNames(notice.peers)} ${notice.peers.length === 1 ? "is" : "are"} running a newer version — sharing with ${notice.peers.length === 1 ? "them" : "them"} is falling back to a slower path until you update.`,
        // A warning rather than plain news: nothing is broken, but something is worse than it should
        // be and will stay that way until somebody acts.
        tone: "warn",
        // One key for the whole subject, so this can never stack — there is only ever one of it.
        key: "peer-version",
        action: { label: "View", run: onView },
      });
    });
  }, [onView]);

  return null;
}

/** `Bran`, `Bran and Kainos`, `Bran, Kainos and 2 more` — the same shape `offerSummary` uses. */
function listNames(names: readonly string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}
