# 0011: Opt-in peer location sharing over awari

## Status
Superseded by 0012

(The dependencies and the opt-in, default-off model below still stand; ADR 0012 moves
connection **ownership** out of the map window to the always-alive main window and
brokers messages over IPC.)

## Context
With the map window in place ([ADR 0010](./0010-ported-map-core.md)), the natural
next step is showing *other players* on the map. The eq-map project already solved
peer connectivity with **awari** (`@awari/core` + `@awari/transport-peerjs`, types
from `@awari/protocol`) over a bootstrap-service — WebRTC peers that join a room and
exchange small messages. Reusing it avoids rebuilding P2P networking, and this app
now has the location feed to publish.

Sharing your live position with strangers is a real privacy choice, and awari needs
new dependencies — both require explicit sign-off (per this repo's `claude.md`); the
user approved adding the deps and an **opt-in, default-off** model.

## Decision
- **New dependencies** (approved): `@awari/core`, `@awari/protocol`,
  `@awari/transport-peerjs` (brings `peerjs`).
- **`src/lib/net.ts`** ports eq-map's client: an HTTP `BootstrapClient`, a PeerJS
  transport, `connectToRoom({ roomId, peerId, bootstrapUrl, onMessage })`. Room id is
  `"eq-list"`. awari/PeerJS are imported **lazily** inside `connectToRoom` (browser
  WebRTC), so Next's static export and the non-map windows never load them.
- **`src/lib/map/useAwariRoom.ts`** (lives in the **map window**, so peer activity is
  bounded to when it's open) exposes two gates:
  - **`connectPeers`** joins the room — you then receive peers' live locations and can
    **ping**: `sendPing(eq)` broadcasts a `{kind:"ping", name, zone}` message that
    every viewer of that zone draws as a gold named marker.
  - **`shareLocation`** additionally publishes your own live `{kind:"loc", zone, y, x}`
    on each `/loc` (disabled in the UI until connected).
  Messages are keyed by `sender.peerId`; kinds `loc`, `ping`, and `pins` (a peer's
  shared map pins) share the channel — `sharePins(pins)` broadcasts, `[]` un-shares.
- **UI:** Settings toggles (connect + share, both default off), a `playerName` field
  (defaulting to the log's character name via `characterFromLogFile`), and an optional
  bootstrap-URL override (blank = the live default `awari-bootstrap-service.vercel.app`).
  The map plots peer dots (green) + pings (gold, named), filtered to the viewed zone
  (`findZone` resolves each sender's zone), with a "N nearby" count. Clicking the map
  while connected fires a ping.

## Consequences
- Reuses proven P2P networking; the only new logic is the room hook + the Settings
  gate. Peers self-identify by awari's envelope `sender.peerId`, so no id plumbing in
  the payload; each peer's zone rides along so we never misplot someone from another
  zone.
- **Off by default; bounded to the map window.** You broadcast only when you opt in
  *and* the map is open. Toggling off (or closing the map) closes the session.
- Depends on a reachable bootstrap-service and WebRTC connectivity; failures degrade
  to "no peers" (logged), not a crash. Not exercisable in the dev sandbox (no
  network/WebRTC) — verify on a real machine, like the screengrab/packaged items.
- Location updates ride the `/loc` cadence, so peers' dots step per `/loc` too.
