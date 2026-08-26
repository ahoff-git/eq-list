# 0141: The room is a meeting place, and sharing is peer to peer

## Status

Accepted

## Context

Every message the app has ever sent has gone to `{type: "room"}` — one broadcast channel, every
payload, every peer ([`host.tsx`](../../src/lib/awari/host.tsx)'s `publish`). That was right for the
two things the connection was built for: a live location and a map click are *about now*, they are
tiny, and everyone in the zone wants them.

It is wrong for everything else we have since put on the wire, and increasingly so:

- **A tally is not a broadcast.** A player with four hundred observed mobs re-broadcasts the whole
  set to the whole room every time it moves ([ADR 0132](./0132-a-contribution-is-keyed-by-who-made-it.md)),
  to twenty people of whom perhaps one is at that camp. The cost scales with the room, and the value
  does not.
- **A cold client cannot ask for anything.** [ADR 0015](./0015-peer-presence-via-hello.md) chose
  re-broadcasting `hello` on every join over a request/response handshake, and was right to for a
  name. Applied to data it means the only way to learn something is to be in the room at the moment
  its owner happened to change it — so joining late means learning nothing until somebody kills
  something.
- **Everything else this install knows is stuck on this machine.** A watch rule that took ten
  minutes to word, a saved style, a shopping list for a quest, the countdown running at the camp you
  are both sitting at, a scoreboard worth comparing — none of it has any way across, and none of it
  is the kind of thing that should be shouted at strangers even when it does.

And awari has supported the answer all along. `RoomSession.publish` takes a **route**, and
`{type: "peer", peer}` addresses one peer directly over its own connection. The room was never
required to be the channel. It is a **meeting place**: where you find out who is here and what they
have, before saying anything to any of them.

## Decision

**Three messages replace "publish everything to everyone": `offer`, `ask`, `give`.**

- **`offer` is broadcast, and is the only thing that is.** It is a *catalogue*, not data: per share
  kind, how many rows there are and a **revision** that moves when they change
  (`{watches: {n: 12, rev: 4}, mobs: {n: 412, rev: 91}}`). It is small enough to be room-routed the
  way `hello` is, and it is published on join, on a toggle, and when a count moves. A kind the
  sender is not sharing is simply absent — the catalogue *is* the toggle state, so nothing has to
  ask permission and be refused.
- **`ask` and `give` are peer-routed.** `ask` names one kind (and the revision the asker already
  has); `give` answers with the rows, from that peer, to that peer, over their own connection.
  Nobody else sees either.
- **A `give` is only ever sent in answer to an `ask`, and only for a kind whose toggle is on** —
  checked at send time rather than trusted from the offer, because the offer is a cache of a
  setting and the setting is the truth.

**`PeerRef`, not `peerId`.** A direct route needs `{peerId, sessionId}`, and the roster only ever
kept the id ([ADR 0015](./0015-peer-presence-via-hello.md)). `AwariPeer` gains `sessionId`, captured
from `onPeerJoined` and from each message's `sender`, and the outbound IPC gains an optional `to`.
The peer id stays per-session and transport-only exactly as ADR 0015 decided; a session id is the
other half of the same transport fact, and neither becomes an identity.

### Three families, because they want three different things

The [ADR 0132](./0132-a-contribution-is-keyed-by-who-made-it.md) split — a thing a window draws and
forgets, versus a thing main files and keeps — was right and is kept. Sharing adds a third, and the
three are worth naming because every rule below follows from which one a kind is in
([`peer-share.ts`](../../src/shared/peer-share.ts) `SHARE_KINDS` is the table).

**Authored** — `watches`, `styles`, `lists`, `pins`. Somebody *made* these. They are asked for by a
person, arrive in a **received tray**, and are **never applied automatically**: you look at what
came, and copy the ones you want onto your own list. That is not caution for its own sake — an
authored artifact is the one category where silently merging a stranger's work would change what
your app *does* (a watch that fires, a style that repaints every banner wearing it), and where
"which of these did I choose?" has to stay answerable.

`pins` are the exception that proves the split: they keep their **broadcast** as well, because the
map's read-only overlay of somebody's live markers and a copy folded into your own pin set are two
different requests, and neither substitutes for the other. Seeing where a person is pointing while
you are both at the camp is an "about now" fact; taking their map home is an artifact. One toggle
gates both, since "let people see my markers" is one decision however it reaches them.

**Observations** — `mobs`, `kills`, `respawns`. These are pooled, and they now arrive by `ask` like
everything else: main sees an offer whose `rev` has moved and fetches that kind from that peer. They
keep going through [`contributions.ts`](../../electron/contributions.ts)'s five rules unchanged,
**tagged by contributor id** — which is what makes "filter this contributor out later" a thing that
can be done at all, and is the whole of ADR 0132. Pulling rather than pushing changes the transport
and nothing about the trust model.

**Live** — `timers`, `buffs`, `scores`. Facts about *right now* on somebody else's machine. Held in
memory, never filed, dropped when the peer goes. Fetched when a panel is open and wants them.

### Two de-dupes, and they are not the same de-dupe

**A countdown is deduped by what it is a countdown *for*.** A `SpawnTimer`'s `id` is `key#slot` and
the slot is local bookkeeping ([ADR 0135](./0135-a-countdown-is-an-instance-and-a-timer-is-its-own-kind.md)) —
meaningless across machines. Its `key` (one mob, one place) is not. So two peers at one camp are
merged by `key`, and two timers under one key are **the same spawn when their `dueAt` are close
enough** (`SAME_SPAWN_MS`). Which of them survives is decided by the evidence, in the order
[`spawn-timers.ts`](../../src/shared/spawn-timers.ts) already argues for: a `seenAt` (somebody can
*see* it — an observation outranks any countdown's opinion), then more `samples`, then the earlier
`dueAt`, because the estimate is a bound that only falls and the tightest honest one wins.

**A buff is deduped by spell and by *whose*, and "whose" does not survive the wire.**
`instanceKey(key, target)` exists already, but a target of `ON_YOU` means *the sender*, and
`ON_PET` means *the sender's pet*. A relative label crossing a machine boundary is a lie: replayed
verbatim, every peer's self-buffs collapse onto yours. So a `give` of `buffs` **resolves the label
against the sender's announced name before it leaves**, and an unresolvable one (`ON_UNKNOWN`) is
dropped rather than guessed at — an anonymous buff on nobody in particular is not worth a row.

### High scores are compared, never merged

A board belongs to a character ([`high-scores.ts`](../../electron/high-scores.ts) rule 1), and a
peer's figure is **unverifiable in a way a drop rate is not**: an unlucky streak and a liar look
alike in a tally, but a 4000-damage hit is simply typed. So nothing a peer sends can beat, seed or
touch your board. It is laid out beside yours, category by category, `unsettled` flags and all, and
the reader draws their own conclusion. This is [ADR 0132](./0132-a-contribution-is-keyed-by-who-made-it.md)'s
"shown, not scored" applied to the one figure people will actually want to boast with.

### Everything inbound is untrusted, and there is one place that says so

[`watch-share.ts`](../../src/shared/watch-share.ts) already worked out what reading a stranger's
artifact means — unknown keys dropped, every value checked against what the type allows, strings
clamped, lists capped, **ids regenerated** so an import can never overwrite something you already
have. That is the same problem for every kind here, arriving over a socket instead of a clipboard,
so it is the same code: `peer-share.ts` holds a `read` per kind, `watches` delegates to
`decodeWatches`, and a kind with no reader cannot be received at all.

### Off by default, per kind, and visible

One toggle per share kind, all off, under `settings.share`. `connectPeers` still gates the lot.
The **Peers tab** in the main window is where they live, beside the roster and what each peer is
offering — not the map's panel, which keeps doing its own job (dots, pins, jumping to a zone) and is
closed most of the time, while lists, watches, styles and scoreboards are all main-window things.

## Consequences

- **Traffic scales with interest rather than with the room.** The only thing everyone receives is a
  catalogue. A four-hundred-row tally crosses the wire when somebody wants it, once, to them.
- **Joining late stops meaning learning nothing.** An offer is republished on join and an `ask` can
  be made at any time, so a client that has been off for a week catches up on the peers who are
  there rather than on the ones who happened to kill something while it watched.
- **Nine new things can cross the wire, and every one of them is a new way to be wrong about
  somebody else's data.** The mitigations are the ones above — a reader per kind, contributor
  tagging on everything pooled, no auto-apply for anything authored, no merge at all for scores —
  and they are the reason the families are named rather than the kinds simply listed.
- **`rev` is a number a peer chooses**, so a peer that never moves it is never re-fetched and one
  that moves it constantly is fetched constantly. That is acceptable for a co-operative room of
  players and would not be for an adversarial one; the fetch is rate-limited per peer per kind
  rather than made clever.
- **The offer is a cache and can be stale** — it says twelve watches and eleven arrive. Counts in
  the UI are therefore labelled as what the peer *said*, and the tray shows what actually came.
- **Two ADRs are narrowed rather than superseded.** [ADR 0015](./0015-peer-presence-via-hello.md)'s
  `hello` still carries name and zone and still re-announces on join; it simply is no longer the
  only thing a peer can learn. [ADR 0132](./0132-a-contribution-is-keyed-by-who-made-it.md)'s
  storage rules are untouched — only how a contribution arrives has changed.
- **Group loot is now cheap**, and still not decided. The open question in
  [README.md](./README.md) asked what a `loot` kind would cost; the answer is now "a row in
  `SHARE_KINDS`". What it was really asking — whose list an arriving drop credits, and whether a
  drop is too loud a thing to share — is untouched by this and still wants deciding.
