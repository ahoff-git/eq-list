# 0028: Peer networking, actually run

## Status

Accepted

## Context

Everything in [ADR 0011](./0011-awari-peer-location-sharing.md), [0012](./0012-awari-connection-owned-by-main-window.md),
[0015](./0015-peer-presence-via-hello.md), [0023](./0023-kill-heatmap.md) and
[0024](./0024-mob-knowledge.md) had been reasoned about and unit-tested, and none of it had
ever been run against a second client. The todo said as much: "needs real network + WebRTC
(unavailable in the dev sandbox)". That turned out to be untrue — WebRTC data channels and the
PeerJS broker both work here, verified directly before anything else was concluded.

Two real clients were driven over the Chrome DevTools Protocol, each with its own userData
directory, its own log folder and its own remote-debugging port. Every feature was exercised
end to end: joining, presence, pings, live location, kill positions, pooled drop rates.

The features work. Five things around them did not:

- **The map window crashed the first time a peer shared anything.** `zoneMatch` was declared
  below `renderKills`, which called it inside a `.filter` — and `.filter` only invokes its
  callback when the array is non-empty, so the temporal dead zone was reached the moment a
  peer's kills arrived and never otherwise. Every local test passed because no peer had ever
  sent anything. This is why peer kill sharing had never appeared to work.
- **The awari host's diagnostics were switched off.** `setRendererDebug` was called only by the
  map window; the connection lives in the main window, so with Debug logging on the entire
  peer-networking log was still discarded. Finding this was a prerequisite for finding the rest.
- **The opening greeting was lost.** `onPeerJoined` fires before the data channel is
  necessarily open, so the greeting the *existing* peer sends to a new arrival races the
  connection and loses. Whoever joined first stayed permanently nameless to whoever joined
  second — "Someone (a4f3)" forever.
- **Everything published before the join completed was dropped.** Joining takes several
  seconds; every window announces itself on mount. The first `hello`, and the opening
  pins/kills/mobs broadcasts, all went nowhere and nothing re-sent them. A player who left
  sharing switched on shared *nothing* after a restart until they happened to kill something.
- **Two clients starting at the same instant never met.** Both arrive at an empty room, both
  create one, and it does not heal: measured at two minutes, both "connected", both alone.
  That is precisely what happens when two friends launch the app together.

## Decision

**Diagnostics are per-window and every window opts in.** `useRendererDebug()` is a shared hook;
the main window calls it because that is where the connection lives.

**`zoneMatch` is declared before anything that uses it**, as a `useCallback` so the memos that
filter by it can list it as a dependency instead of silencing the lint rule that would have
caught this.

**A greeting is answered, once per peer.** Their hello arriving is proof the channel is open, so
a reply cannot lose the race the original greeting did; "once per peer" is what stops two
clients greeting each other forever.

**Publishes made before the room is up are held, not dropped** — the last payload of each kind,
because these are all "here is my current state" messages. Replaying a backlog would be wrong;
replaying the newest is exactly right. They flush on join.

**A client alone in the room re-joins a few times, with jitter.** Bounded (three attempts), so
genuinely being the only player online settles instead of looping. The jitter is the part that
works: a fixed schedule leaves two equally-lonely clients retrying in lockstep and re-racing
each other every time — measured, three synchronised retries and still two rooms. Spreading
each wait over a wide random range breaks the tie, and the pair now meets in about 40 seconds
from a cold room.

## Consequences

Peer networking is exercised rather than assumed. A pooled drop rate across two clients came out
at exactly 5 of 10 kills, kill positions crossed with their zone and confidence intact, and
pings arrived named and placed.

The cold-start recovery is a mitigation, not a cure. The underlying split — two clients each
creating a room under one id — belongs to awari, which has a `possibleSplit` flag for it that
nothing here consumes. Retrying works because the loser eventually resolves the winner's
registered hint; it does not reconcile two populated rooms, so if four people split two-and-two
the retries will stop with two rooms standing.

The three retry delays and the halving/doubling jitter are chosen to be obviously safe rather
than tuned. Nobody has measured the right numbers, and a lone player pays three reconnects for
them.

The verification runs are not in the repo: they need two Electron processes, a live bootstrap
service and about five minutes, which is not something the unit suite should carry. That leaves
these five fixes covered by inspection and one manual run rather than by a test — worth knowing
when changing this code. Reproducing it means driving two clients over the DevTools protocol
with separate userData directories; the shape of that is described here rather than shipped.
