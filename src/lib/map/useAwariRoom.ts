"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { createLogger } from "@/shared/logging";
import type { MapPin } from "@/shared/map/pins";
import { AWARI_MSG, type AwariPayload } from "@/shared/types";

const log = createLogger("awari");

/** Shown for a peer whose display name we don't have. */
const DEFAULT_PEER_NAME = "Someone";

/** A peer's last known live location (keyed by their awari peer id). */
export interface PeerLoc {
  peerId: string;
  zone: string;
  y: number;
  x: number;
}

/** A peer's most recent map click ("ping"), drawn as a named marker. */
export interface PeerPing {
  peerId: string;
  name: string;
  zone: string;
  y: number;
  x: number;
}

/** Read `key` off a loose peer payload as a string (defaulting to `fallback`). */
function str(p: AwariPayload, key: string, fallback = ""): string {
  const v = p[key];
  return typeof v === "string" ? v : fallback;
}

/**
 * The map's view of peer networking. The WebRTC connection itself lives in the main
 * window (`AwariHost`); this hook just consumes the brokered message stream — building
 * peers' live locations, their latest map-click pings (each labeled with the sender's
 * name), and shared pins — and sends our own pings/pins back through the bridge. The
 * inbound stream already excludes our own messages, so no self-filtering here.
 */
export function useAwariRoom(opts: { name: string }): {
  peers: PeerLoc[];
  pings: PeerPing[];
  peerPins: MapPin[];
  sendPing: (eq: { y: number; x: number }, zone: string) => void;
  sharePins: (pins: MapPin[]) => void;
} {
  const { name } = opts;
  const [peers, setPeers] = useState<Record<string, PeerLoc>>({});
  const [pings, setPings] = useState<Record<string, PeerPing>>({});
  const [peerPins, setPeerPins] = useState<Record<string, MapPin[]>>({});
  // Latest name for outbound ping/pins (kept in a ref so the senders stay stable).
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    const a = api();
    if (!a) return;
    const offMessage = a.awari.onMessage(({ sender, payload: p }) => {
      if (p.kind === AWARI_MSG.pins && Array.isArray(p.pins)) {
        const by = str(p, "name", DEFAULT_PEER_NAME);
        setPeerPins((prev) => ({ ...prev, [sender]: (p.pins as MapPin[]).map((pin) => ({ ...pin, by })) }));
        return;
      }
      if (typeof p.x !== "number" || typeof p.y !== "number") return;
      if (p.kind === AWARI_MSG.loc) {
        setPeers((prev) => ({ ...prev, [sender]: { peerId: sender, zone: str(p, "zone"), y: p.y as number, x: p.x as number } }));
      } else if (p.kind === AWARI_MSG.ping) {
        setPings((prev) => ({
          ...prev,
          [sender]: { peerId: sender, name: str(p, "name", DEFAULT_PEER_NAME), zone: str(p, "zone"), y: p.y as number, x: p.x as number },
        }));
      }
    });
    // Clear everyone when the connection drops (a fresh join re-seeds from live peers).
    const offStatus = a.awari.onStatus((s) => {
      if (!s.connected) {
        setPeers({});
        setPings({});
        setPeerPins({});
      }
    });
    return () => {
      offMessage();
      offStatus();
    };
  }, []);

  // Broadcast a clicked location (a "ping"), tagged with our name and the zone being
  // VIEWED (passed in) — not our physical zone — so pinging works while browsing any map.
  const sendPing = useCallback((eq: { y: number; x: number }, pingZone: string) => {
    const a = api();
    if (!a) return void log.debug("ping ignored - no Electron bridge");
    if (!pingZone) return void log.debug("ping ignored - no zone in view");
    const payload = { kind: AWARI_MSG.ping, name: nameRef.current || DEFAULT_PEER_NAME, zone: pingZone, y: eq.y, x: eq.x };
    // With debug logging on, show exactly what we're broadcasting (gated by the logger).
    log.debug("map click -> broadcasting", payload);
    a.awari.send(payload);
  }, []);

  // Broadcast our current pins (empty array un-shares). Peers replace our set on receipt.
  const sharePins = useCallback((pins: MapPin[]) => {
    api()?.awari.send({ kind: AWARI_MSG.pins, name: nameRef.current || DEFAULT_PEER_NAME, pins });
  }, []);

  return {
    peers: Object.values(peers),
    pings: Object.values(pings),
    peerPins: Object.values(peerPins).flat(),
    sendPing,
    sharePins,
  };
}
