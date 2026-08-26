# 0145: A room checks itself, and needs no game running

## Status

Accepted

## Context

[ADR 0144](./0144-state-is-asked-for-as-well-as-pushed.md) fixed a panel that could not *read* the
room. Three things underneath it were still wrong, and all three are about a session that is running
but not being watched.

**Nothing ever re-checked.** An `ask` only ever happened because an `offer` arrived with a moved
revision ([ADR 0141](./0141-the-room-is-a-meeting-place.md)). That quietly assumes every offer is
seen and every answer lands, and neither is guaranteed: a `give` can be lost, we can restart
mid-conversation, an offer can turn up during a moment when `connectPeers` was off. Any of those and
the two installs disagree **for ever**, with both sides believing they are current. There was no
second look, because the whole flow was a reaction to an event rather than a comparison of what is.

**A split room stayed split.** ADR 0144 added a manual *Look again*, which was right and not enough:
it needs somebody to know the button exists and to notice they need it. The underlying failure —
two clients starting together each create their own room — is invisible from inside, because both
sides look perfectly connected and merely alone.

**A peer who missed one `hello` stayed nameless.** `hello` goes out on join and on a rename. Lose
the one that mattered and that person is `Someone (3f9a)` for the rest of the session, which is
precisely the row a share panel is useless without.

And running through all of it, a requirement that had never been *stated*, only accidentally true:
**sitting in a room with EverQuest closed.** The app is a log watcher, so it is fair to assume it
wants a game — but the room is a place to meet people, and wanting to be reachable while you are not
playing is an ordinary thing to want. Nothing gated the connection on the game, and the character
name is read off the **filename** of the newest log in the folder and announced before a line of it
is parsed, so it worked. It worked by luck rather than by decision, nothing said so, and it had one
real hole: a fresh install that has never played has no name at all.

Worth stating plainly, because it is the obvious thing to build and would have been wrong: **awari
already heartbeats every connection every two seconds** (`DEFAULT_HEARTBEAT_INTERVAL_MS`). A live
session does not idle out. A keepalive of our own would be inventing work, and worse, it would mask
real drops behind our own traffic.

## Decision

**The minute tick that already publishes the catalogue does two more jobs**
(`electron/peer-share.ts`).

- **Reconcile.** `outOfDate(offer, heldRev)` — pure, in `src/shared/peer-share.ts` — names the
  observation kinds a peer holds at a revision past ours, and those get asked for. It is stated as a
  **comparison of what is, not a reaction to an event**, which is the shape that cannot drift: a lost
  answer, a restart or a missed offer all heal on the next tick instead of never. Observations only,
  for the same reason the automatic fetch is observations only — re-fetching somebody's watch rules
  behind their reader's back would fill a tray nobody asked to fill. The existing per-peer-per-kind
  cooldown keeps it from being chatty.
- **Watch for loneliness.** Connected, and the room empty for `ALONE_REJOIN_MS` (five minutes), and
  we re-join. This **amends ADR 0070's** "settle and stop churning", which was right about the fast
  startup retries and left no cure at all for a pair that settled split. Five minutes is not a spin —
  one attempt per five minutes costs a solitary player nothing — and it is fast enough that two
  people who sit down together find each other without either of them knowing a button exists. Only
  ever while the room is **empty**: a room with somebody in it is a room that works, and re-joining
  it would drop a working session to go looking for a better one.

**The catalogue carries our name**, redundantly with `hello` and deliberately. The offer goes out
every minute regardless, so letting it name us costs nothing and gives the roster a second,
self-healing path to who everybody is. A nameless peer now fixes itself within the minute instead of
lasting the session.

**Sitting in a room with the game closed is a supported thing, and the tab says so.** A new *Your
connection* block at the top of the Peers tab holds the three facts a person needs when this is not
working, in one place: whether we are actually in a room (the light), **who we are in it** (the name
field, which was Settings-only — being anonymous is the one thing that makes this tab unusable, and
it should be fixable where you notice it), and **Retry connection**, which is now always present
rather than appearing only when the room looks wrong. A control you can reach only in the state that
needs it is a control nobody finds.

## Consequences

- The pool stops being able to sit still. Two installs that have drifted converge on the next tick,
  and neither has to have noticed.
- **A split room heals by itself**, within five minutes, with nobody having to understand what
  happened. The manual button stays as the immediate answer and as the fallback for everything the
  app cannot diagnose.
- The re-join takes a **fresh peer id**, like every other re-join — so a lonely session that heals
  looks to everyone else like a new arrival. Cheap while it is rare, and if the watchdog turns out
  to fire often, that is the evidence for reconsidering ADR 0070's other open question (whether a
  session should keep its id across a recovery).
- **No keepalive was added**, and that is a decision rather than an omission: awari's own heartbeats
  are the mechanism, and a second one would hide the failures the first is there to detect.
- The tick now does four things (measure, publish, reconcile, watch). It stays one timer, because
  they share the minute and splitting them would be four schedules to reason about instead of one.
- Peer identity now depends on the log folder rather than on the game, which was already true and is
  now written down. A fresh install with no logs is anonymous until somebody types a name, and the
  panel says so instead of quietly showing strangers a short id.
