/**
 * inventory-asks.ts — which peers a view using holdings should ask for their inventory now.
 *
 * Inventory is a `live` kind, which nothing fetches unprompted (ADR 0309), so the view asks — once
 * per revision a peer offers. Pure so the rules can be pinned by a test: `asked` is the caller's
 * memory across renders (when each peer@revision was last asked), and this both reads and updates it.
 */
import type { AwariPeer } from "../types";
import type { ReceivedShare } from "./peer-share";

/** How long an unanswered ask waits before it's repeated — a reply can be lost on the way. */
export const INVENTORY_REASK_MS = 2 * 60_000;

/**
 * The peer ids to ask now. A peer is asked once per offered revision, and again in two cases:
 *
 * - **Their answer was dropped.** Once it's in the tray the ask is forgotten, so if the tray later
 *   drops it (the hub's sweep after its TTL, with the revision unchanged because their dump hasn't
 *   moved) it is asked for again rather than lost for good.
 * - **No answer came.** An ask unanswered for `reaskMs` is repeated. Peers re-announce every minute,
 *   which is what brings the caller back here to notice.
 */
export function inventoryAsksDue(
  peers: readonly Pick<AwariPeer, "peerId" | "sessionId" | "offer">[],
  received: readonly Pick<ReceivedShare, "peerId" | "kind" | "rev">[],
  asked: Map<string, number>,
  now: number,
  reaskMs = INVENTORY_REASK_MS,
): string[] {
  const due: string[] = [];
  for (const peer of peers) {
    const offered = peer.offer?.inventory;
    if (!offered?.n || !peer.sessionId) continue;
    const key = `${peer.peerId}@${offered.rev}`;
    const have = received.find((r) => r.peerId === peer.peerId && r.kind === "inventory");
    if (have && have.rev >= offered.rev) {
      asked.delete(key);
      continue;
    }
    const last = asked.get(key);
    if (last !== undefined && now - last < reaskMs) continue;
    asked.set(key, now);
    due.push(peer.peerId);
  }
  return due;
}
