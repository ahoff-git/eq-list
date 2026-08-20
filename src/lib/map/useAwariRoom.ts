"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { createLogger } from "@/shared/logging";
import type { MapPin } from "@/shared/map/pins";
import type { MobObservation } from "@/shared/mob-stats";
import type { SharedKill } from "@/shared/kill-filters";
import { AWARI_MSG, type AwariPayload, type AwariPeer } from "@/shared/types";

const log = createLogger("awari");

/** Shown for a peer whose display name we don't have. */
const DEFAULT_PEER_NAME = "Someone";

/** Key our own ping is stored under — peer ids are `eq-list-…`, so it can't collide. */
const SELF_KEY = "self";

/**
 * The wire shape of a shared kill now lives in `shared/kill-filters.ts`, beside the function that
 * turns one into an ordinary kill record — main files them, the store keeps them and the map draws
 * them, so it can't belong to a window any more. Re-exported because this is where the map has
 * always imported it from.
 */
export type { SharedKill };

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
  /** The layer they were viewing, when the zone has layers (see `Zone.layer`). */
  layer?: number;
  y: number;
  x: number;
  /** When it arrived (ms, local clock) — drives the drop-in animation. */
  at: number;
}

/**
 * A row for the connected-users list: everyone in the room, whether or not they're
 * sharing anything. Presence comes from awari's roster; the rest fills in as their
 * messages arrive.
 */
export interface ConnectedUser {
  peerId: string;
  name: string;
  /** Their zone, as announced — may be unknown until they say hello. */
  zone: string;
  /** True when they're broadcasting live location (we have a dot for them). */
  sharingLoc: boolean;
  /** How many pins they're sharing. */
  pins: number;
}

/** Read `key` off a loose peer payload as a string (defaulting to `fallback`). */
function str(p: AwariPayload, key: string, fallback = ""): string {
  const v = p[key];
  return typeof v === "string" ? v : fallback;
}

/** Read `key` off a loose peer payload as a number (undefined when absent or not one). */
function num(p: AwariPayload, key: string): number | undefined {
  const v = p[key];
  return typeof v === "number" ? v : undefined;
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
  users: ConnectedUser[];
  sendPing: (eq: { y: number; x: number }, zone: string, layer?: number) => void;
  sharePins: (pins: MapPin[]) => void;
  shareKills: (kills: SharedKill[]) => void;
  shareMobs: (observations: MobObservation[]) => void;
} {
  const { name } = opts;
  const [peers, setPeers] = useState<Record<string, PeerLoc>>({});
  const [pings, setPings] = useState<Record<string, PeerPing>>({});
  const [peerPins, setPeerPins] = useState<Record<string, MapPin[]>>({});
  const [roster, setRoster] = useState<AwariPeer[]>([]);
  // Latest name for outbound ping/pins (kept in a ref so the senders stay stable).
  const nameRef = useRef(name);
  nameRef.current = name;

  useEffect(() => {
    const a = api();
    if (!a) return;
    const offMessage = a.awari.onMessage(({ sender, payload: p }) => {
      // Contributions — `mobs` and `kills` — are **not** handled here. They are filed by the main
      // process as they arrive (`electron/ipc.ts`), which is what makes them survive this window
      // being closed and this session ending; the map reads them back through `usePeerKills` and
      // `mobs.all` like any other stored data. Everything below is the opposite kind of message:
      // about *now*, drawn while it's true, and forgotten with the connection.
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
          [sender]: {
            peerId: sender,
            name: str(p, "name", DEFAULT_PEER_NAME),
            zone: str(p, "zone"),
            layer: num(p, "layer"),
            y: p.y as number,
            x: p.x as number,
            at: Date.now(),
          },
        }));
      }
    });
    // Clear everyone when the connection drops (a fresh join re-seeds from live peers).
    const offStatus = a.awari.onStatus((s) => {
      if (!s.connected) {
        setPeers({});
        setPings({});
        setPeerPins({});
        setRoster([]);
      }
    });
    const offPeers = a.awari.onPeers(setRoster);
    return () => {
      offMessage();
      offStatus();
      offPeers();
    };
  }, []);

  // Broadcast a clicked location (a "ping"), tagged with our name and the zone + layer
  // being VIEWED (passed in) — not our physical zone — so pinging works while browsing
  // any map, and a floor's ping only lands on that floor.
  const sendPing = useCallback((eq: { y: number; x: number }, pingZone: string, layer?: number) => {
    const a = api();
    if (!a) return void log.debug("ping ignored - no Electron bridge");
    if (!pingZone) return void log.debug("ping ignored - no zone in view");
    const name = nameRef.current || DEFAULT_PEER_NAME;
    const payload = { kind: AWARI_MSG.ping, name, zone: pingZone, layer, y: eq.y, x: eq.x };
    // With debug logging on, show exactly what we're broadcasting (gated by the logger).
    log.debug("map click -> broadcasting", payload);
    a.awari.send(payload);
    // Echo our own ping locally: the inbound stream excludes us, and a ping you can't
    // see gives no feedback that the click landed.
    setPings((prev) => ({
      ...prev,
      [SELF_KEY]: { peerId: SELF_KEY, name, zone: pingZone, layer, y: eq.y, x: eq.x, at: Date.now() },
    }));
  }, []);

  // Broadcast our current pins (empty array un-shares). Peers replace our set on receipt.
  const sharePins = useCallback((pins: MapPin[]) => {
    api()?.awari.send({ kind: AWARI_MSG.pins, name: nameRef.current || DEFAULT_PEER_NAME, pins });
  }, []);

  /**
   * Broadcast our kill locations (empty array un-shares) so a camp's heatmap can be pooled.
   * Only placeable kills are worth sending — a peer can't do anything with a position we
   * don't have — and the caller decides which those are.
   */
  const shareKills = useCallback((kills: SharedKill[]) => {
    api()?.awari.send({ kind: AWARI_MSG.kills, name: nameRef.current || DEFAULT_PEER_NAME, kills });
  }, []);

  /**
   * Broadcast what we've learned about mobs — counts, not raw kills, so a pooled drop rate is
   * just addition and none of our movements travel with it.
   */
  const shareMobs = useCallback((observations: MobObservation[]) => {
    api()?.awari.send({
      kind: AWARI_MSG.mobs,
      name: nameRef.current || DEFAULT_PEER_NAME,
      mobs: observations,
    });
  }, []);

  // One row per connected peer, merging the roster with what they've shared. A peer
  // that never says hello still shows up (by a shortened id) — presence is presence.
  const users = useMemo<ConnectedUser[]>(
    () =>
      roster
        .map((p) => ({
          peerId: p.peerId,
          name: p.name?.trim() || `${DEFAULT_PEER_NAME} (${p.peerId.slice(-4)})`,
          zone: peers[p.peerId]?.zone || p.zone || "",
          sharingLoc: !!peers[p.peerId],
          pins: peerPins[p.peerId]?.length ?? 0,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [roster, peers, peerPins],
  );

  /**
   * The rooms's state as lists. Memoized on the state they flatten, because the identity of these
   * arrays is load-bearing: they are dependencies of the map page's `renderKills` / `renderPins` /
   * `peers` / `pings` memos, which in turn feed the canvas draw effect. Rebuilt fresh on every
   * render — which is what `Object.values(...)` in the return statement did — every one of those
   * memos missed, so any state change anywhere in the map window redrew the whole overlay and
   * rebuilt the hover-target list, whether or not a peer had said anything.
   */
  const peerLocs = useMemo(() => Object.values(peers), [peers]);
  const peerPings = useMemo(() => Object.values(pings), [pings]);
  const allPeerPins = useMemo(() => Object.values(peerPins).flat(), [peerPins]);

  return {
    peers: peerLocs,
    pings: peerPings,
    peerPins: allPeerPins,
    users,
    sendPing,
    sharePins,
    shareKills,
    shareMobs,
  };
}
