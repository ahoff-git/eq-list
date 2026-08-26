# 0144: Shared state is asked for as well as pushed, and says whether it is real

## Status

Accepted

## Context

Two people ran [ADR 0141](./0141-the-room-is-a-meeting-place.md)'s Peers tab for the first time, both
connected, and it said **"Who's here · 0 peers"**. The room was fine. The panel was not.

Peer presence has only ever been an **event**. `AwariHost` keeps the roster and pushes it through the
broker whenever it changes (`awari.reportPeers` → `awariPeersChanged`), and every reader subscribes.
That worked for as long as the only reader was the map window's 👥 panel, which nobody looked at
closely enough to notice. It stops working the moment a reader **mounts late**, and a tab does:
`PeersPanel` mounts when somebody clicks *Peers*, by which time the join and every `onPeerJoined`
for the people already in the room happened minutes ago, to nobody. The panel then sits at zero
until somebody happens to join or leave — which, in a room of two who both logged in before opening
the tab, is never.

The same hole is in the map's own panel, for the same reason, and it has been there since
[ADR 0015](./0015-peer-presence-via-hello.md).

There is a second, worse thing underneath it, and it is the reason the first was so hard to see. The
panel gated on **`connectPeers`** — the *setting* — because that is all any window has ever had.
[ADR 0070](./0070-a-dropped-room-rejoins-itself.md) noted this and left it open: the app reports its
real connection truthfully and **nothing displays it**. So an empty list means all of:

- connected, and genuinely nobody else is on;
- still joining (a bootstrap cold start takes seconds);
- unable to reach the network at all;
- connected to a room the other person isn't in.

Four situations, one appearance, and the appearance is *"this feature is broken"*. Nobody
troubleshooting can start, because there is nothing to tell them where to start.

And the fourth of those is not hypothetical. `REJOIN_DELAYS_MS` documents it from measurement: two
clients starting at the same instant can each create their own room and never discover the other, and
it **does not heal on its own**. There are three randomised retries and then, deliberately, the app
settles — because being genuinely alone is a normal resting state and must not become a reconnect
loop. A pair that settles split therefore stays split for the whole session, and the only cure was
toggling Connect off and on in Settings, which nobody would ever guess.

## Decision

**Anything a window can be told, it can also ask for.**

- `peer.room()` returns the room as it stands — the connection and the roster — from the hub, which
  already holds both. Every reader **seeds from it on mount and follows the events afterwards**,
  which is the `useFollowedRead` shape the rest of this app already uses and which peer presence
  simply never got. Both readers are fixed: the Peers tab and the map's 👥 panel.
- The rule generalises, and is why this is an ADR rather than a commit: **a push-only channel is a
  bug waiting for its first late reader.** Events say *what changed*; they cannot answer *what is
  true*, and every panel that opens on demand asks the second question first.

**The connection says whether it is real.**

- `usePeerShare` exposes the true `AwariStatus`, not `connectPeers`, and the Peers tab shows a light
  beside "Who's here" (grey until we are actually in a room, gold once we are; the peer id on its
  hover, since that is the one thing you need when comparing two machines' logs). This is the
  connection light ADR 0070 asked about and declined to build — the answer changed because the
  question did: it was cosmetic when the only symptom was a missing dot, and it is load-bearing now
  that a whole tab is unreadable without it.
- The empty-room text says **which** empty this is: connected and alone, or not in the room yet. Two
  sentences, and they are the difference between a feature that looks unfinished and one that is
  merely quiet.

**"Look again" — a manual re-join, offered exactly when it is the answer.**

- `peer.rejoin()` relays to the owner window, which bumps the same join generation the lonely timer
  uses, so there is one way to re-join rather than two. Shown whenever the room is empty, because
  that is precisely the state where a split room is the likely cause.
- The automatic retries stay **bounded** — that decision was right and is untouched. What was wrong
  was having no way past the point where they stop.

## Consequences

- Peer presence works in a panel that opens on demand, which is every panel this feature has.
- **A connection fault is now visible**, and for the first time somebody can tell "nobody's on" from
  "we never joined" without reading a debug log. The roster's joins and leaves are logged too, so
  when the log *is* the answer it says something.
- The split-room case has a cure a person can find. It is a button rather than a fix: nothing here
  prevents the split, and if it turns out to be common the honest answer is to stop bounding the
  retries when the room is empty and somebody is looking — which this makes measurable.
- One more invoke channel, and a hub that now holds the connection status as well as the roster.
  Cheap, and it is the same state it was already keeping for its own use.
- **This closes ADR 0070's open question** about a connection light. The other one it left — whether
  a session should keep its peer id across a recovery — is untouched, and "Look again" deliberately
  takes a *fresh* id like every other re-join.
