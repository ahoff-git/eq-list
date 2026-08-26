"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import type { AwariPeer, ReceivedShare } from "@/shared/types";
import { SHARE_KINDS, type ShareKind, type ShareOffer } from "@/shared/peer-share";

/**
 * The Peers tab's view of the share hub.
 *
 * The hub itself is in main ([ADR 0141](../../specs/decisions/0141-the-room-is-a-meeting-place.md)),
 * so this is a reader and nothing more: the roster over the broker, our own catalogue, and what
 * peers have handed over. It deliberately does **no merging** — `mergeTimers`, `mergeBuffs` and
 * `compareScores` in `shared/peer-share.ts` do that, and the panels that draw a merged view call
 * them, so a de-dupe rule lives in one tested place rather than in a hook nothing can test.
 *
 * Two things are followed rather than polled: the roster (which changes when somebody joins or
 * leaves) and the tray (which changes when an answer lands). Our own catalogue is re-read alongside
 * them plus on demand, because it moves for a third reason — a toggle — that neither event covers.
 */
export interface PeerShareView {
  /** Everyone in the room, named where they've said, with what they're offering. */
  peers: AwariPeer[];
  /** What we're offering, as peers see it. */
  offer: ShareOffer;
  /** What peers have handed over, newest per peer per kind. */
  received: ReceivedShare[];
  /** Ask a peer for a kind — a person clicked, so the hub skips its cooldown. */
  ask: (peerId: string, kind: ShareKind) => void;
  /** Throw a peer's answers away. */
  clear: (peerId?: string, kind?: ShareKind) => void;
  /** Re-read our own catalogue (after a toggle). */
  refresh: () => void;
}

/** Stable empties, so a room with nobody in it doesn't re-render everything below on each read. */
const NO_PEERS: AwariPeer[] = [];
const NO_RECEIVED: ReceivedShare[] = [];
const NO_OFFER: ShareOffer = {};

export function usePeerShare(): PeerShareView {
  const [peers, setPeers] = useState<AwariPeer[]>(NO_PEERS);
  const [received, setReceived] = useState<ReceivedShare[]>(NO_RECEIVED);
  const [offer, setOffer] = useState<ShareOffer>(NO_OFFER);
  /** Bumped to re-read our catalogue on demand — a toggle moves it, and no event announces that. */
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    const a = api();
    if (!a) return;
    void a.peer.offer().then((o) => setOffer(o as ShareOffer));
  }, [generation]);

  useEffect(() => {
    const a = api();
    if (!a) return;
    const reload = () => void a.peer.received().then(setReceived);
    reload();
    const offPeers = a.awari.onPeers(setPeers);
    const offShare = a.peer.onChanged(reload);
    // A dropped connection empties the room; the tray is left alone, because what somebody already
    // handed over is ours to read whether or not they're still here (see the hub's `roster`).
    const offStatus = a.awari.onStatus((s) => {
      if (!s.connected) setPeers(NO_PEERS);
    });
    return () => {
      offPeers();
      offShare();
      offStatus();
    };
  }, []);

  const refresh = useCallback(() => setGeneration((n) => n + 1), []);

  const ask = useCallback((peerId: string, kind: ShareKind) => {
    api()?.peer.ask(peerId, kind);
  }, []);

  const clear = useCallback(
    (peerId?: string, kind?: ShareKind) => {
      api()?.peer.clear(peerId, kind);
    },
    [],
  );

  return useMemo(
    () => ({ peers, offer, received, ask, clear, refresh }),
    [peers, offer, received, ask, clear, refresh],
  );
}

/**
 * Everything a peer has given us of one kind, flattened and typed by the caller.
 *
 * The tray is per peer, and the panels that merge want one list with a name on every row — a
 * countdown board doesn't care which connection a clock came down, only whose camp it is. Rows keep
 * the sender's display name rather than their peer id for exactly that reason: an id is transport
 * and changes every session ([ADR 0015](../../specs/decisions/0015-peer-presence-via-hello.md)).
 */
export function rowsOf<T>(received: readonly ReceivedShare[], kind: ShareKind): { row: T; by: string; peerId: string }[] {
  return received
    .filter((r) => r.kind === kind)
    .flatMap((r) =>
      r.rows.map((row: unknown) => ({ row: row as T, by: r.from || shortId(r.peerId), peerId: r.peerId })),
    );
}

/** A peer with no announced name, as a row can still refer to them. Matches the map's wording. */
export function shortId(peerId: string): string {
  return `Someone (${peerId.slice(-4)})`;
}

/** What a peer says they hold of a kind, or 0 — an offer they haven't sent is not a zero, see `offered`. */
export function offeredCount(peer: AwariPeer, kind: ShareKind): number {
  return peer.offer?.[kind]?.n ?? 0;
}

/** Has this peer said anything at all about what they share? */
export function hasOffered(peer: AwariPeer): boolean {
  return peer.offer !== undefined;
}

/** The kinds a peer is offering something of, in catalogue order. */
export function offeredKinds(peer: AwariPeer): ShareKind[] {
  return SHARE_KINDS.filter((spec) => offeredCount(peer, spec.key) > 0).map((spec) => spec.key);
}
