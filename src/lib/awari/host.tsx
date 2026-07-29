"use client";
import { useCallback, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { connectToRoom, randomPeerId, ROOM_ID } from "@/lib/awari/net";
import { useSettings, useCurrentZone, usePlayerLoc, useWatcherStatus } from "@/lib/hooks";
import { createLogger } from "@/shared/logging";
import { characterFromLogFile } from "@/shared/log-parser";
import { AWARI_MSG } from "@/shared/types";
import type { AwariPayload, AwariPeer } from "@/shared/types";
import type { RoomSession } from "@awari/protocol";

const log = createLogger("awari");

/**
 * The app's single awari connection, owned by the always-alive main window — route
 * `/` (this component's host) renders ONLY there, so ownership needs no role check.
 * WebRTC only runs in a renderer, so centralizing the socket here (rather than in the
 * on-demand map window) makes peer networking an app-level service any window reaches
 * over the IPC broker (see ADR 0012). This component:
 *   - joins / leaves the room per Settings (`connectPeers`, `bootstrapUrl`);
 *   - relays inbound peer messages + connection status up to the broker, which fans
 *     them out to every window (`api.awari.reportMessage` / `reportStatus`);
 *   - keeps the room roster (who's connected, and the name/zone each announced) and
 *     reports it the same way, so any window can list connected users;
 *   - publishes payloads other windows ask to send (`api.awari.onPublish`);
 *   - broadcasts our own live location while sharing is on.
 * Renders nothing.
 */
export default function AwariHost() {
  const settings = useSettings();
  const connected = settings?.connectPeers ?? false;
  const sharing = settings?.shareLocation ?? false;
  const bootstrapUrl = settings?.bootstrapUrl ?? "";
  const zone = useCurrentZone();
  const loc = usePlayerLoc();
  const watcher = useWatcherStatus();
  // Same rule the map uses: an explicit name wins, else the log's character name.
  const myName = (settings?.playerName || "").trim() || characterFromLogFile(watcher.file) || "";

  const sessionRef = useRef<RoomSession | null>(null);
  const peerIdRef = useRef<string>("");
  /** Who else is in the room: awari's roster, enriched by their `hello` payloads. */
  const rosterRef = useRef(new Map<string, AwariPeer>());

  /** Publish to the room if we're connected (a no-op before the session resolves). */
  const publish = useCallback((payload: AwariPayload) => {
    const s = sessionRef.current;
    if (!s) return void log.debug("publish skipped - no session yet", payload.kind);
    void s.publish({ type: "room" }, payload).catch((e) => log.debug("publish failed:", (e as Error).message));
  }, []);

  const reportRoster = useCallback(() => {
    api()?.awari.reportPeers([...rosterRef.current.values()]);
  }, []);

  // Our announced identity, in a ref so `sayHello` stays stable across renames/zoning.
  const identityRef = useRef({ name: myName, zone: zone ?? "" });
  identityRef.current = { name: myName, zone: zone ?? "" };

  /** Announce who we are (and where) so peers can list us by name, not by peer id. */
  const sayHello = useCallback(() => {
    publish({ kind: AWARI_MSG.hello, ...identityRef.current });
  }, [publish]);

  // Join / leave. Re-runs when the connection is toggled or the bootstrap URL changes.
  useEffect(() => {
    const a = api();
    if (!a) return;
    if (!connected) {
      a.awari.reportStatus({ connected: false, peerId: null });
      return;
    }
    let cancelled = false;
    let session: RoomSession | null = null;
    const myPeerId = randomPeerId();
    peerIdRef.current = myPeerId;
    // The Map instance itself never changes; hold it locally so the cleanup below
    // clears the same roster this join populated.
    const roster = rosterRef.current;

    void connectToRoom({
      roomId: ROOM_ID,
      peerId: myPeerId,
      bootstrapUrl,
      onMessage: (m) => {
        const sender = m.sender?.peerId;
        // Never echo ourselves — consumers get a clean peer-only stream.
        if (!sender || sender === peerIdRef.current) return;
        const payload = (m.payload ?? {}) as { kind: string; name?: unknown; zone?: unknown };
        // A `hello` is how a peer id gets a name — fold it into the roster (a peer we
        // haven't been told about yet still gets a row, keyed by id).
        if (payload.kind === AWARI_MSG.hello) {
          const prev = roster.get(sender) ?? { peerId: sender };
          roster.set(sender, {
            ...prev,
            name: typeof payload.name === "string" ? payload.name : prev.name,
            zone: typeof payload.zone === "string" ? payload.zone : prev.zone,
          });
          reportRoster();
        }
        a.awari.reportMessage({ sender, payload: payload as { kind: string } });
      },
    })
      .then((s) => {
        if (cancelled) return void s.close();
        session = s;
        sessionRef.current = s;
        a.awari.reportStatus({ connected: true, peerId: myPeerId });
        // Presence: awari replays every already-active peer to a fresh handler, so
        // this seeds the roster as well as tracking later joins/leaves.
        s.onPeerJoined((peer) => {
          if (peer.peerId === peerIdRef.current) return;
          if (!roster.has(peer.peerId)) roster.set(peer.peerId, { peerId: peer.peerId });
          reportRoster();
          sayHello(); // a new arrival doesn't know us yet
        });
        s.onPeerLeft((peer) => {
          roster.delete(peer.peerId);
          reportRoster();
        });
        sayHello();
      })
      .catch((e) => log.warn("could not join the awari room:", (e as Error).message));

    return () => {
      cancelled = true;
      sessionRef.current = null;
      roster.clear();
      a.awari.reportStatus({ connected: false, peerId: null });
      reportRoster();
      if (session) void session.close();
    };
    // `sayHello` reads the latest name/zone through a ref, so re-joining on a rename
    // isn't needed (or wanted).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, bootstrapUrl, publish, reportRoster]);

  // Publish payloads other windows ask us to send (they have no socket of their own).
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.awari.onPublish(publish);
  }, [publish]);

  // Keep the room's picture of us current: a rename or a zone change re-announces.
  useEffect(() => {
    if (!connected) return;
    sayHello();
  }, [connected, myName, zone, sayHello]);

  // Broadcast our own live location while connected + sharing (peers plot it).
  useEffect(() => {
    if (!connected || !sharing || !zone || !loc) return;
    publish({ kind: AWARI_MSG.loc, zone, y: loc.y, x: loc.x });
  }, [connected, sharing, zone, loc, publish]);

  return null;
}
