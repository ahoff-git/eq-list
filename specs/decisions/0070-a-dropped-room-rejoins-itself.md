# 0070: A dropped room re-joins itself

## Status

Accepted

## Context

Peer networking was verified end to end against two real clients and repaired
([ADR 0028](./0028-peer-networking-verified-and-repaired.md)). Everything that run exercised —
joining, presence, pings, live location, kill positions, pooled drop rates — worked. What that
run could not exercise was an evening: it verified that a room *forms*, never that one *lasts*.

In use it doesn't. The report is "connections drop all the time and no one sees pings", and those
are one symptom, not two.

awari's `RoomSession` has an `onDisconnected` handler, documented as firing "only when room-scope
leader recovery is fully exhausted (every resolved contact failed to reconnect) — the peer can no
longer reach the room". It is the library saying it has already tried everything it knows.
**Nothing in this app subscribed to it.** So on the first real drop:

- `reportStatus` had last said `{ connected: true }` and never spoke again, so every window still
  believed it was in the room;
- the roster still listed everybody who had been there, so the 👥 panel showed people who could
  no longer hear us;
- `publish` kept writing into the dead session, its rejection landing on a debug line nobody had
  switched on;
- and nothing re-joined. The only re-join that existed was the cold-start "lonely" timer from ADR
  0028, which is bounded at three attempts *and* skips itself the moment a peer is visible. A
  connection healthy enough to meet somebody therefore disabled the one mechanism that could have
  recovered it. The first drop was permanent, and the only cure was toggling Connect off and on —
  which is exactly what "flaky" feels like from the outside.

Two smaller holes sat behind the same door. A join that **failed** (a bootstrap cold start timing
out, say — [`BOOTSTRAP_TIMEOUT_MS`](../../src/shared/awari-bootstrap.ts) is 8s) logged a warning
and ended the effect, equally terminal. And teardown called `session.close()`, which for a peer
that happens to be the room's **leader** skips the leadership handoff that `leaveRoom()` performs.
Room traffic routes through the leader, so a leader closing abruptly means every remaining peer
must convict it dead by missed heartbeats and rotate before anything flows again — a self-inflicted
stretch of "connected, but nobody sees my ping" for everyone else, triggered by the ordinary act of
one person quitting first.

## Decision

**A drop is detected and recovered.** `onDisconnected` clears the roster, reports
`{ connected: false }` so every window empties (which is what the map already assumed happened),
and schedules a re-join. Payloads published during the outage fall into the existing held-payload
buffer, which is last-write-wins per kind — so what flushes on re-join is our current state, not a
backlog.

**A failed join takes the same path as a dropped one.** They are the same outage seen at different
moments, so they share the backoff.

**The two retry reasons get opposite bounds, deliberately.** The lonely retries stay bounded at
three (ADR 0028): being the only player online is a normal resting state and must settle. Recovery
is unbounded, holding at one attempt a minute: being disconnected is never a resting state, and an
outage that ends should heal without the player having to guess that a toggle is the fix. A
recovered connection re-enters what looks like an empty room, so it gets fresh lonely retries; a
room that reaches somebody resets the recovery backoff.

**Teardown leaves gracefully.** `leaveRoom()` rather than `close()`, so a departing leader hands
off. A session awari has already declared unreachable has nothing to hand off, so that one closes.

## Consequences

Peer networking now has a lifecycle rather than just a start. The failure that used to be silent
and permanent is now a `log.warn` naming the reason and a visible empty roster, which is the
honest picture ([ADR 0052](./0052-an-error-goes-to-the-log-not-the-screen.md) — it goes to the log,
not over the game).

The recovery backoff repeats forever at 60s. That is a deliberate spin, and it is cheap (one
bootstrap POST), but it means a client left running with peer networking on and the service down
talks to the network once a minute indefinitely. Turning Connect off is the way to stop it.

**Each re-join enters under a fresh peer id** (`randomPeerId`, per ADR 0011's reasoning that the id
is transport-only). To the rest of the room a recovering peer is therefore a departure and an
arrival by a stranger, not a return — they see the row vanish and come back, and their `greeted`
set treats it as new. That is correct but not free, and it is the piece to revisit if reconnects
turn out to be frequent enough to be noticed as churn.

None of this is unit-testable here for the same reason ADR 0028's fixes weren't: it needs two
Electron processes, a live bootstrap service, and — for the case that matters most — a *real*
drop, which is the one thing hardest to stage on purpose. It sits in the
[manual QA checklist](../testing/manual-qa.md) with the shape of the test written down.

The status the app reports is now truthful, but **nothing displays it**: the map's `connected` is
still the `connectPeers` *setting* (intent), and the only consumer of the real status is the
room's self-clearing. A player watching an outage sees the user list empty and their pings stop
landing, with no indicator saying why. Whether that deserves a real connection light is left open.
