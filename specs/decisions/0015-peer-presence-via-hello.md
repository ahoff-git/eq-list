# 0015: Peer presence from awari's roster, names from a `hello` payload

## Status
Accepted

## Context
The map could only show peers who were actively **sharing their location** — a dot
appeared when a `loc` message arrived and that was the only evidence anyone else
existed. So "is anyone else even connected?" had no answer, and a peer connected with
location-sharing off was invisible.

awari's `RoomSession` already tracks membership: `onPeerJoined` / `onPeerLeft`, with the
join handler **replayed for every already-active peer** when it attaches. What it
carries is a `peerId` — a per-session random string like `eq-list-3f9ac210`, which is
useless in a UI. Names live in our own payloads (`ping`/`pins` carry `name`), so a peer
who has neither pinged nor shared pins has no name we know.

## Decision
Presence and identity are tracked separately, and merged for display:

- **Presence** comes from awari's roster. The owner window (see
  [ADR 0012](./0012-awari-connection-owned-by-main-window.md)) subscribes to
  `onPeerJoined`/`onPeerLeft`, keeps the roster, and reports it through the same broker
  the messages and status already use (`awari.reportPeers` → every window).
- **Identity** comes from a new `hello` room payload (`AWARI_MSG.hello`) carrying
  `{ name, zone }`. It's published on join, whenever our name or zone changes, and
  **again whenever someone new joins** — a late arrival has missed every earlier
  `hello`, and re-announcing on join is cheaper and simpler than a request/response
  handshake or a periodic heartbeat.
- A peer with no `hello` yet is still listed, under a shortened id. Presence is a fact
  on its own; the name is an enrichment.
- The map's **Connected users** panel merges the two, plus what each peer is sharing
  (live location, pin count), and lets you jump to a peer's zone.

Rejected alternatives:
- **Heartbeat presence** (periodic "I'm here", expire after N seconds) — needed only if
  the transport can't tell us who's in the room. awari can, so a heartbeat would add
  timers, tunable windows, and a class of "ghost peer" bugs for nothing.
- **Inferring presence from `loc`/`ping`/`pins`** — that's the behaviour being fixed:
  it can't distinguish "not connected" from "connected, sharing nothing".
- **Putting the name in the peer id** — ids are transport identity, not user data;
  overloading them would leak a rename into reconnect semantics.

## Consequences
- The map answers "who else is on?" without anyone having to share location, which also
  makes it obvious when the bootstrap/WebRTC path is silently broken (roster empty).
- Names are self-declared and unverified, exactly as they already were for pings. This
  is a small shared room of players, not an identity system.
- A peer's zone in the list is only as fresh as their last `hello` (zone change) or
  `loc`; a peer who zones with sharing off announces the new zone via `hello`.
- One more message kind on the wire. `AWARI_MSG` remains the single place both sides
  read the discriminators from, so adding it can't drift.
