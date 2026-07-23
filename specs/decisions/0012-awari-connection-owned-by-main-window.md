# 0012: awari connection owned by the main window, brokered over IPC

## Status
Accepted

## Context
[ADR 0011](./0011-awari-peer-location-sharing.md) put the awari connection in the
**map window** (`useAwariRoom`), so peer activity was bounded to when the map was open.
Two problems surfaced:

- **The connection died with the map window.** Closing the map (a secondary,
  on-demand window) dropped you from the room. The always-alive main window couldn't
  use peers at all, so peer networking could never grow past the map.
- **It was tied to the map feature.** The connection, the map-specific message
  semantics (`loc` / `ping` / `pins`), and the map UI were one hook — no seam for using
  the shared connection for anything else (presence, loot sharing, chat, …).

WebRTC (PeerJS) only runs in a renderer, and the app has **two** renderer windows
(main = always alive, hides to tray; map = opened on demand) that are separate
processes — a socket in one is not shared with the other. So "make awari app-level"
means picking one owner and relaying to the rest.

The opt-in, default-off privacy model and the dependencies from ADR 0011 are unchanged
and carried forward here.

## Decision
- **The main window owns the single connection.** Route `/` renders only in the main
  window, so a client component `AwariHost` (`src/lib/awari/host.tsx`) mounted there is
  the owner with no role check needed. It joins/leaves per Settings (`connectPeers`,
  `bootstrapUrl`) and broadcasts our own `loc` while `shareLocation` is on. Because the
  main window never closes (it hides to tray), the connection now lives for the app's
  lifetime, not the map window's.
- **The Electron main process is a pure relay** (`electron/ipc.ts`), mirroring the
  existing `zone`/`loc`/`loot` broadcast pattern:
  - any window's `awari.send(payload)` → `awariOutbound` → forwarded to the owner's
    `awariPublish` → the owner publishes to the room;
  - the owner's inbound peer messages → `awariInbound` → `broadcast(awariMessage)` to
    **every** window;
  - the owner's connection status → `awariInbound`'s sibling `awariStatus` →
    `broadcast(awariStatusChanged)`.
  The owner drops its own echoes before relaying, so consumers get a peer-only stream.
- **The bridge is generic** (`EqlApi.awari`, payloads typed as `AwariPayload =
  { kind: string; … }`). `send` / `onMessage` / `onStatus` are the public surface;
  `onPublish` / `reportMessage` / `reportStatus` are owner-window plumbing.
- **Map semantics stay in the map area.** `src/lib/map/useAwariRoom.ts` is now a thin
  consumer: it interprets `loc`/`ping`/`pins` off `awari.onMessage` into peers/pings/
  peerPins and sends pings/pins via `awari.send`. The generic transport moved to
  `src/lib/awari/net.ts`.
- A **ping is tagged with the zone being *viewed*** (passed into `sendPing`), not the
  player's physical zone — you can ping any map you're browsing, and a click can't
  silently no-op just because the log hasn't reported a zone.

## Consequences
- Peer networking is an **app-level service**: any window (or future feature) uses it
  over the same bridge, and the connection persists across opening/closing the map.
- One clear seam: transport (`lib/awari/net.ts`) · owner engine (`lib/awari/host.tsx`)
  · broker (`electron/ipc.ts`) · map interpretation (`lib/map/useAwariRoom.ts`). New
  message kinds are additive on `AwariPayload` — no new IPC channels per feature.
- Self-filtering lives in one place (the owner), so consumers never see their own
  messages and don't need our peer id.
- Cost: a round-trip through the main process for every message (fine locally) and the
  main window must stay alive for peers to work (it always does — it hides, never
  closes).
- Still gated by opt-in Settings + a reachable bootstrap-service, and still not
  exercisable in the dev sandbox (no WebRTC) — verify on a real machine.
