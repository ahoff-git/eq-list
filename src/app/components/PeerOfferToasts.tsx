"use client";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { showToast } from "@/lib/toast";
import { count } from "@/shared/format";
import { offerSummary } from "@/shared/peer-share";
import type { PeerOfferNotice } from "@/shared/types";

/**
 * "Somebody is sharing something" — the only notice the peer room raises, and where it takes you.
 *
 * The Peers tab already lists every catalogue in the room, but it is one tab of eleven and the
 * moment that matters is the one where somebody at your camp switches their watch rules on — which
 * is exactly when you are looking at something else
 * ([ADR 0143](../../../specs/decisions/0143-a-notice-may-point-at-where-to-answer-it.md)).
 *
 * **What the toast does and doesn't do.** It carries one action, and that action is `View` — it puts
 * you in front of that peer's row and stops. It does not ask for the data, and it does not accept
 * anything: that is a screenful of judgement and stays on the panel
 * ([ADR 0141](../../../specs/decisions/0141-the-room-is-a-meeting-place.md)'s rule that nothing
 * authored arrives unrequested). Missing the toast costs nothing either, because the offer is in the
 * tab whether or not it was seen.
 *
 * Renders nothing, and mounted by the shell rather than by the Peers tab — a notice about a tab you
 * aren't on has to come from something that is always mounted.
 */
export default function PeerOfferToasts({ onView }: { onView: (peerId: string) => void }) {
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.peer.onOffered((notice: PeerOfferNotice) => {
      if (!notice.kinds.length) return;
      showToast({
        title: `${notice.name} is sharing ${count(notice.kinds.length, "thing")}`,
        detail: offerSummary(notice.kinds),
        // Not `good`: somebody offering you something is news, not a success. The stripe is what
        // separates "that worked" from "here's a thing", and this is the second.
        tone: "info",
        // Keyed by peer, so a second offer from the same person **replaces** their card rather than
        // stacking beside it — three notices about Bob is the noise a coalesced one exists to avoid,
        // and the newer one is strictly the better of the two.
        key: `peer-offer:${notice.peerId}`,
        action: { label: "View", run: () => onView(notice.peerId) },
      });
    });
  }, [onView]);

  return null;
}
