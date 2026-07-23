"use client";
import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { connectToRoom, randomPeerId, ROOM_ID } from "@/lib/awari/net";
import { useSettings, useCurrentZone, usePlayerLoc } from "@/lib/hooks";
import { createLogger } from "@/shared/logging";
import { AWARI_MSG } from "@/shared/types";
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

  const sessionRef = useRef<RoomSession | null>(null);
  const peerIdRef = useRef<string>("");

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

    void connectToRoom({
      roomId: ROOM_ID,
      peerId: myPeerId,
      bootstrapUrl,
      onMessage: (m) => {
        const sender = m.sender?.peerId;
        // Never echo ourselves — consumers get a clean peer-only stream.
        if (!sender || sender === peerIdRef.current) return;
        a.awari.reportMessage({ sender, payload: (m.payload ?? {}) as { kind: string } });
      },
    })
      .then((s) => {
        if (cancelled) return void s.close();
        session = s;
        sessionRef.current = s;
        a.awari.reportStatus({ connected: true, peerId: myPeerId });
      })
      .catch((e) => log.warn("could not join the awari room:", (e as Error).message));

    return () => {
      cancelled = true;
      sessionRef.current = null;
      a.awari.reportStatus({ connected: false, peerId: null });
      if (session) void session.close();
    };
  }, [connected, bootstrapUrl]);

  // Publish payloads other windows ask us to send (they have no socket of their own).
  useEffect(() => {
    const a = api();
    if (!a) return;
    return a.awari.onPublish((payload) => {
      const s = sessionRef.current;
      if (!s) return void log.debug("publish ignored - not connected to a room", payload);
      void s.publish({ type: "room" }, payload).catch((e) => log.debug("publish failed:", (e as Error).message));
    });
  }, []);

  // Broadcast our own live location while connected + sharing (peers plot it).
  useEffect(() => {
    const s = sessionRef.current;
    if (!connected || !sharing || !s || !zone || !loc) return;
    void s
      .publish({ type: "room" }, { kind: AWARI_MSG.loc, zone, y: loc.y, x: loc.x })
      .catch((e) => log.debug("loc publish failed:", (e as Error).message));
  }, [connected, sharing, zone, loc]);

  return null;
}
