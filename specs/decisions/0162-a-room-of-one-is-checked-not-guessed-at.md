# 0162: A room of one is checked, not guessed at

## Status

Accepted

## Context

The report is old, and it is the same one every time: two people run EQ List, neither can see the
other, and then at some point they can. Nobody could say what changed. "Until magically they can" is
the whole of the evidence, and it is accurate — the cure really was arbitrary.

The failure underneath is understood and has been since
[ADR 0028](./0028-peer-networking-verified-and-repaired.md). Two clients that resolve an empty
directory in the same instant each find nobody, and each correctly becomes the **genesis leader** of
its own room under the same id (awari's `joinRoom`, ADR 0009 — for a would-be member with nowhere to
go, leading is the right fallback). The directory keeps one of the two leader hints. Both clients are
connected, both are alone, and **neither can tell**: from the inside, a room you created and a room
nobody has joined yet are the same room.

Everything the app did about that was a guess on a timer, and by this point there were **three of
them**, in two processes, that did not know about each other:

- `REJOIN_DELAYS_MS` in [`host.tsx`](../../src/lib/awari/host.tsx) — three jittered re-joins at 20s,
  45s and 90s, then give up ([ADR 0070](./0070-a-dropped-room-rejoins-itself.md): being alone is a
  normal resting state and must settle).
- `ALONE_REJOIN_MS` in [`peer-share.ts`](../../electron/peer-share.ts) — five minutes of an empty
  room means re-join, unbounded ([ADR 0145](./0145-a-room-checks-itself-and-needs-no-game.md), added
  precisely because the ladder above gives up).
- `RECONNECT_DELAYS_MS`, for a drop or a failed join, which is a different problem and is fine.

A guess has to be wrong in one direction or the other. Fast enough to reunite a split pair means a
solitary player re-joins all evening; quiet enough for a solitary player means a split pair stays
split. But the measured behaviour was worse than either, because the three interacted:

- **The lonely budget was never refunded.** `lonelyTriesRef` reset on a drop and on toggling Connect
  off, and *not* when a peer was actually seen. A client that spent its three attempts, met somebody,
  and was later left alone had no startup retries left at all.
- **The lonely timer was armed once per join and never re-armed.** It checked `roster.size > 0` when
  it fired and returned. Anybody present at that instant — for a second — silently disarmed the only
  look that session would ever take.
- **Every re-join reset the five-minute clock.** `noteStatus({connected: true})` set `lastCompany`,
  and the ladder above re-joined three times. So the watchdog's first fire was not at five minutes
  but at roughly *seven and a half*, and it was the ladder that decided when. That is the magic.
- **The watchdog had no jitter**, in the file whose neighbour documents at length why jitter is what
  stops two clients that started together racing each other into a fresh room. Two clients that
  started together share the phase of a five-minute clock, so they could re-join in lockstep and
  each become genesis again — reproducing the split the re-join existed to cure.

And none of it was testable. ADR 0070 said so outright ("it needs two Electron processes, a live
bootstrap service, and a *real* drop"), and left the shape of the test in the manual QA checklist,
where it has sat unrun.

**There was never a need to guess.** awari has shipped the answer since ADR 0016:
`pingRoomStatus` is a **read-only probe** that asks the directory who leads a room and asks that
leader who is in it — and, unlike a join, it *never* falls back to becoming the leader when nothing
answers. Core exposes it and this app was not calling it.

## Decision

**A room of one is a question, and the question gets asked.** After a rung of the ladder elapses with
nobody else in the room, the client probes: which room does the directory point at, and who is in it?

- **Somebody answered.** The room the world can find is not the room we are in — if it were, we would
  be looking at them. That is a split, proven rather than suspected, and we re-join into the room
  everyone else will find.
- **Nobody answered.** The directory names a leader nobody can reach, and the likeliest unreachable
  leader is *us*: a peer cannot dial itself. We are the room the world finds, so being alone in it
  means being alone. Nothing is torn down.

The asymmetry is the mechanism, and it is what makes the split heal **without both sides acting**: of
two clients that raced, exactly one is the one the directory forgot, and exactly that one moves. The
other stays put and is arrived at. A cure that needed both to act is a cure that can re-race.

**One ladder replaces three, and it never ends.** `ALONE_CHECKS_MS` is 20s / 45s / 90s / 3m / 5m,
holding at five minutes for as long as somebody is alone, and jittered over ±50% like every other
wait here. Unbounded is affordable now only because **a look is no longer a re-join**: ADR 0070
bounded its ladder because the alternative to waiting was tearing down a working session, and that is
no longer the alternative. A genuinely solitary player costs one bootstrap POST and one failed dial
every five minutes, for ever, and never loses their session. **Company refunds the ladder**, which is
the one unambiguous proof that this room is the room.

**It lives in the renderer that owns the session**, and `peer-share.ts`'s watchdog is deleted. Not a
reversal of ADR 0145's "main is the always-running participant" — a stronger constraint: the probe
rides the session's own transport, WebRTC only runs in a renderer, and `AwariHost` is in the
always-alive main window anyway. One home for the whole policy
([ADR 0146](./0146-one-home-for-the-peer-network.md) applied to a retry rule rather than a control).
Main keeps everything that is genuinely its own — the catalogue, the reconcile, the tray.

**The policy is pure and the looking is not.** [`room-watch.ts`](../../src/shared/room-watch.ts)
holds no clock, no socket and no awari: it says when a look is due and reads the answer.
[`net.ts`](../../src/lib/awari/net.ts) does the looking, sharing the one PeerJS peer the session
already has. So every rule above is exercised in
[`room-watch.test.ts`](../../electron/tests/room-watch.test.ts) without a network — including the
scenario nobody could stage: two clients, one directory, and the race that starts the evening.

**A probe that could not be asked is not an answer.** A bootstrap error becomes `{reached: false}`,
never a re-join, because re-joining out of a working session on the strength of a network error is
the failure mode this whole ADR is about.

## Consequences

- **A split pair reunites in about twenty seconds**, on the first rung, with nobody clicking
  anything. It used to be somewhere past seven minutes and a coin toss thereafter.
- **A solitary player is never re-joined at all.** Previously they were, every five minutes, for ever.
  The manual *Retry connection* stays as the fallback for whatever the app cannot diagnose.
- **The room lifecycle has tests**, which ADR 0070 recorded as impossible. What made it possible was
  not a test harness but separating the decision from the doing; the manual QA entry narrows from
  "verify the whole lifecycle" to "verify a probe reaches a real leader".
- **One more failure now has a name in the log.** "we are not in the room everybody else is in - it
  has 3 - re-joining" is a `log.warn` a person can be asked to read
  ([ADR 0052](./0052-an-error-goes-to-the-log-not-the-screen.md) — the log, not over the game).
- **A look costs a dial that usually fails**, and a failing PeerJS dial takes its 10s timeout. That
  is once per rung, off the critical path, and it is the price of not guessing.
- **`possibleSplit` is still unread.** `BootstrapResponse` carries a flag for exactly this condition
  ("the same identity reasserting leadership after being superseded"), which core ignores and leaves
  to its callers. The probe makes it unnecessary rather than wrong, and it would be a second,
  cheaper signal at join time; it is left as an open question rather than built speculatively.
- **A re-join still enters under a fresh peer id**, so the client that moves looks to the room like a
  stranger arriving. ADR 0070's open question about keeping an id across a recovery is untouched —
  but the churn that would have justified answering it is now much rarer, since only the wrong client
  ever moves.
