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

/**
 * Which of awari's built-in ICE presets we hand PeerJS, concatenated in order.
 *
 * **To go back to PeerJS's own defaults, set this to `[]`.** That is the whole revert —
 * an empty list means we pass no `peerOptions` at all, exactly as before.
 *
 * Why override at all: PeerJS's default ICE list points at its public cloud TURN servers
 * (`eu-0.turn.peerjs.com` and friends), which awari's transport documents as flaky and, in
 * Electron / restricted-DNS runtimes, unable to even resolve — a `net::ERR_NAME_NOT_RESOLVED`
 * in the WebRTC log. `eu-0.turn.peerjs.com` currently resolves to what looks like a
 * residential address rather than managed relay infrastructure, which fits.
 *
 * Why these two: `config.iceServers` *replaces* PeerJS's list rather than merging, so the
 * replacement has to be self-sufficient. `google` is STUN only — fine for same-machine, LAN
 * and non-symmetric-NAT peers, but peers behind symmetric NAT need a relay, and dropping
 * PeerJS's TURN without providing one would trade "flaky" for "never connects" for them.
 * `open-relay` supplies that relay. It is a free community TURN on shared public credentials:
 * rate-limited, best-effort, and explicitly not production-grade per awari's own warning — so
 * treat it as better-than-nothing, not as solved. The real fix is our own TURN, which awari
 * exposes as `selfHostedTurn({...})`; swapping to it is a change to this list plus its
 * credentials, nothing more.
 */
const ICE_PROVIDERS = ["google", "open-relay"] as const;

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

/**
 * A fresh, readable per-session peer id (awari identifies each client by this).
 *
 * Deliberately **not** stable across sessions, even though awari documents
 * `AwariOptions.peerId` as "this peer's stable identity across sessions". Nothing here needs
 * to recognise a returning peer: identity a player cares about is their character / server
 * name, announced in the `hello` payload and re-announced on every rename (see ADR 0015).
 * Keeping the two apart means the id stays transport-only — a rename can't disturb reconnect
 * semantics, and a rejoin (see `REJOIN_DELAYS_MS`) entering as a new id costs nothing but a
 * fresh `hello`.
 */
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
  const { createPeerJsTransport, readPeerJsId, ICE_SERVERS } = await import("@awari/transport-peerjs");

  // Built from awari's own presets rather than copied URLs, so their upkeep stays theirs.
  const iceServers = ICE_PROVIDERS.flatMap((provider) => ICE_SERVERS[provider]);
  log.debug("ice servers:", iceServers.length ? ICE_PROVIDERS.join(" + ") : "peerjs defaults");

  const awari = createAwari({
    transport: createPeerJsTransport(iceServers.length ? { peerOptions: { config: { iceServers } } } : undefined),
    bootstrap: createHttpBootstrapClient(opts.bootstrapUrl || DEFAULT_BOOTSTRAP_URL, PROTOCOL_VERSION),
    resolveConnectionId: readPeerJsId,
    peerId: opts.peerId,
  });

  const session = await awari.join({ roomId: opts.roomId, sessionId: crypto.randomUUID() });
  log.debug("joined awari room", opts.roomId, "as", opts.peerId);
  if (opts.onMessage) session.onMessage(opts.onMessage);
  return session;
}
