/**
 * Peer networking over awari (`@awari/core` + `@awari/transport-peerjs`) — ported
 * from the eq-map project (see ADR 0011). One shared room; the app broadcasts the
 * player's location + map pings and receives other players' to plot on the map.
 *
 * awari + PeerJS are browser-only (WebRTC), so they're imported **lazily** inside
 * `connectToRoom` — this module is safe to import during Next's static export, and
 * the network only spins up in the renderer at runtime (the main window; see ADR 0012).
 */
import type { BootstrapClient } from "@awari/core";
import type {
  AwariMessage,
  BootstrapRequest,
  BootstrapResponse,
  ContactHint,
  RoomId,
  RoomSession,
} from "@awari/protocol";
import { createLogger } from "@/shared/logging";

const log = createLogger("awari");

/** The shared room every eq-list client joins. */
export const ROOM_ID = "eq-list";

/** Live bootstrap-service (room directory / peer contact registry); overridable in Settings. */
export const DEFAULT_BOOTSTRAP_URL = "https://awari-bootstrap-service.vercel.app";

/** HTTP `BootstrapClient` against the bootstrap-service (same contract as awari's reference client). */
function createHttpBootstrapClient(baseUrl: string, protocolVersion: string): BootstrapClient {
  const headers = { "Content-Type": "application/json" };
  const base = baseUrl.replace(/\/+$/, ""); // tolerate a trailing slash
  return {
    async resolve(request: BootstrapRequest): Promise<BootstrapResponse> {
      const res = await fetch(`${base}/api/bootstrap`, { method: "POST", headers, body: JSON.stringify(request) });
      return res.json();
    },
    async registerHint(roomId: RoomId, hint: ContactHint): Promise<void> {
      await fetch(`${base}/api/bootstrap/hints`, {
        method: "POST",
        headers,
        body: JSON.stringify({ roomId, protocolVersion, hint }),
      });
    },
  };
}

/** A fresh, readable per-session peer id (awari identifies each client by this). */
export function randomPeerId(): string {
  return `eq-list-${crypto.randomUUID().slice(0, 8)}`;
}

export type PeerMessageHandler = (message: AwariMessage) => void;

/**
 * Join the shared awari room over PeerJS and deliver incoming messages to
 * `onMessage`. Returns the live session (`publish`, `close`, …). Client-only.
 */
export async function connectToRoom(opts: {
  roomId: string;
  peerId: string;
  bootstrapUrl?: string;
  onMessage?: PeerMessageHandler;
}): Promise<RoomSession> {
  const { createAwari, PROTOCOL_VERSION } = await import("@awari/core");
  const { createPeerJsTransport, readPeerJsId } = await import("@awari/transport-peerjs");

  const awari = createAwari({
    transport: createPeerJsTransport(),
    bootstrap: createHttpBootstrapClient(opts.bootstrapUrl || DEFAULT_BOOTSTRAP_URL, PROTOCOL_VERSION),
    resolveConnectionId: readPeerJsId,
    peerId: opts.peerId,
  });

  const session = await awari.join({ roomId: opts.roomId, sessionId: crypto.randomUUID() });
  log.debug("joined awari room", opts.roomId, "as", opts.peerId);
  if (opts.onMessage) session.onMessage(opts.onMessage);
  return session;
}
