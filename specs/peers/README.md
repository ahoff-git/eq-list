# Peers

## Purpose
Sharing between two installs of EQ List: what one player will hand another, how it gets there, and
what happens to it on arrival.

The connection has existed since [ADR 0011](../decisions/0011-awari-peer-location-sharing.md) and has
been an app-level service owned by the main window since
[ADR 0012](../decisions/0012-awari-connection-owned-by-main-window.md). What changed in
[ADR 0141](../decisions/0141-the-room-is-a-meeting-place.md) is what the *room* is for: it is a
**meeting place**, not a channel. A peer broadcasts a small catalogue of what it has; the data itself
travels peer-to-peer, on request, over that peer's own connection.

## Responsibilities

- **The catalogue and its three messages** (`src/shared/peer-share.ts`, pure and tested in
  `electron/tests/peer-share.test.ts`):
  - `offer` — broadcast, and the only thing that still is. Per kind: how many rows, and a `rev` that
    moves when they change. A kind not being shared is **absent**, not zero — the catalogue *is* the
    toggle state.
  - `ask` / `give` — peer-routed (`publish({type:"peer", peer})`). `ask` names a kind and the
    revision the asker already has; `give` answers with the rows. The `items` kind is the one
    exception to "a kind, whole": nobody wants eleven thousand pages in a message, so its `ask` names
    a **shard** and its `give` answers with that ~11-page slice
    ([ADR 0160](../decisions/0160-a-room-fills-the-catalogue-once.md)). A `give` with no `rows` means
    "unchanged", which is kept distinct from a `give` of none (that means "now empty", which
    [ADR 0056](../decisions/0056-a-dropped-record-keeps-what-it-taught.md) reads as an un-share).
  - `SHARE_KINDS` — the table every rule is driven off: label, blurb, family, and a `read` per kind.
    **A kind with no reader cannot be received**, which is how a new kind fails closed rather than
    arriving unchecked.
- **Four families**, because the rules differ and the table says which a kind is in:
  - **authored** (`watches`, `styles`, `lists`, `pins`) — somebody made it. Asked for by a person,
    landed in a tray, **never applied on arrival**. `pins` are the one kind that *also* still
    broadcasts, because the [map](../map/README.md)'s read-only overlay of somebody's live markers is
    a different request from taking a copy home; the same toggle gates both.
  - **observation** (`mobs`, `kills`, `respawns`) — pooled, filed by
    [`contributions.ts`](../../electron/contributions.ts)'s five rules, **tagged by contributor id**
    ([ADR 0132](../decisions/0132-a-contribution-is-keyed-by-who-made-it.md)) so any of it can be
    filtered out later. Fetched automatically when a peer's `rev` moves.
  - **live** (`timers`, `buffs`, `scores`) — true on somebody else's machine right now. Held in
    memory, dropped when they go, never written to disk.
  - **mirror** (`items`) — neither made nor observed: a copy of a **third party's public page**, the
    same for everyone, which anyone could fetch for themselves
    ([ADR 0160](../decisions/0160-a-room-fills-the-catalogue-once.md)). The **one family applied
    silently on arrival**, and it may be: there is nothing personal in it, it changes nothing about
    what the app does, and the alternative to accepting a page is asking eqlwiki the same question a
    second time. It is also the only family that is *checkable* — a page that looks wrong is
    re-fetched from the source, and the TTL does that unprompted.
- **The hub** (`electron/peer-share.ts`) — in main, because main is the only participant always
  running: a hub that answered only while a window was open would drop every ask the moment you
  changed tab. It measures the catalogue on a slow tick (a digest moving *is* the change, so no
  store has to be taught to call it), answers asks after re-checking the toggle against the
  settings rather than the published offer, files observations, and holds everything else in a
  received tray with a TTL.
- **The two de-dupes**, and they are not the same de-dupe:
  - **Countdowns** merge by `key` (one mob, one place — a `SpawnTimer`'s `id` is `key#slot` and the
    slot is local bookkeeping). Within a key, two clocks are the same spawn when their `dueAt` are
    within `SAME_SPAWN_MS`. Which survives follows the evidence order
    [`spawn-timers.ts`](../../src/shared/spawn-timers.ts) already argues for: a `seenAt` (an
    observation outranks any countdown), then more `samples`, then the earlier `dueAt` (the bound
    only falls, so the tightest honest one wins). Ties stay ours, so a row can't flicker with packet
    order.
  - **Buffs** merge by spell **and whose**, and "whose" does not survive the wire: `ON_YOU` means
    *the sender*. It is resolved to a name **before it leaves** (`shareableBuffs`), because only the
    sender knows whose board it is; one still relative on arrival is dropped rather than guessed at.
- **Asking, not only listening.** The roster and the connection are broadcast as *events*, and a
  panel that opens on a tab click has missed every one of them — which showed as "Who's here · 0
  peers" in a full room. `peer.room()` returns the room as it stands, and every reader seeds from it
  before following the events ([ADR 0144](../decisions/0144-state-is-asked-for-as-well-as-pushed.md)).
  The tab's *Your connection* block shows the **real** connection (a light, not the `connectPeers`
  setting), who you are in the room, and **Retry connection** (`peer.rejoin()`) — always present, as
  the fallback for anything the app cannot diagnose.
- **Keeping itself honest** ([ADR 0145](../decisions/0145-a-room-checks-itself-and-needs-no-game.md)).
  The minute tick that publishes the catalogue also **reconciles** — `outOfDate` names the
  observation kinds a peer holds past the revision we have, and those are asked for again, so a lost
  `give` or a restart heals instead of leaving two installs disagreeing for ever — and **watches for
  loneliness**: connected with an empty room for five minutes means re-join, which is what heals a
  split room without anybody noticing it happened. The catalogue carries our **name** as well as
  `hello` does, so a peer who missed the one greeting stops being "Someone (3f9a)" within the minute.
  **No keepalive of our own**: awari heartbeats every connection every two seconds, and a second one
  would mask the drops the first exists to detect.
- **The game does not need to be running.** The room is joined off a setting, and the character name
  is read off the *filename* of the newest log in the folder — announced before a line is parsed — so
  you can sit in a room with EverQuest closed. The only gap is a fresh install that has never played,
  which has no name to announce; the Peers tab carries the name field for exactly that.
- **The Peers tab** (`src/app/components/PeersPanel.tsx`, with `PeerTray` and `PeerScores`) — **the
  one home for the whole feature** ([ADR 0146](../decisions/0146-one-home-for-the-peer-network.md)).
  It was scattered across three screens for a while: the connection and the name in Settings (where
  ADR 0011 left them), two share toggles on the map toolbar, the rest here. A control now lives
  exactly once, and it lives here. Five sections, in the order the questions get asked:
  **Your connection** (connect, the real status light, who you appear as, Retry connection, and the
  bootstrap URL behind a `<details>`), **What you share** (live location first — the one thing that
  is broadcast rather than handed over, and the only share that needs the game running — then a
  toggle per kind, all off by default), **Who's here** (what each peer offers, and their zone as a
  button that opens the map there), **What's arrived**, and the **scoreboard comparison**.
- **Saying so.** A peer newly offering something raises a toast whose one action opens the Peers tab
  with their row picked out ([ADR 0143](../decisions/0143-a-notice-may-point-at-where-to-answer-it.md)).
  The rules are all about not becoming noise: only a kind **newly** on offer (not a count moving —
  a catalogue moves on every kill), only kinds a person has to act on (an observation fetches
  itself), one notice per peer rather than per kind, once per **name** per session (a peer id is
  per-session, so keying by id would re-announce everyone after a hiccup), and nothing for a peer no
  route reaches. The action is navigation and nothing else: asking, reading and copying all stay on
  the panel.
- **Scores compared, never merged.** A peer's figure cannot beat, seed or touch your board. It is
  laid beside it, category by category, `unsettled` flags and all
  ([ADR 0130](../decisions/0130-data-in-doubt-says-so.md)), and a provisional figure cannot lead.

## Non-responsibilities

- **No second copy of any control.** The map keeps its 👥 list because it is an always-on-top overlay
  you read while the game is full-screen and the main window is hidden — a *view* may live where the
  reader is, and a control may not follow them there
  ([ADR 0146](../decisions/0146-one-home-for-the-peer-network.md)). Nothing on the map toggles a
  share, and nothing in Settings does either.

- **No trust score, and no weighting.** Nothing here scores a contributor. ADR 0132's argument
  stands: a per-peer number would look authoritative and be made up, since nothing can tell an
  unlucky streak from a liar. Provenance is *shown*, and disagreement *reported*.
- **No automatic application of anything authored.** A watch that fires or a style that repaints
  every banner wearing it are changes to what the app does. They wait for a click.
- **No accepting from a notice.** The offer toast navigates and stops — it does not ask for the data
  and does not copy anything ([ADR 0143](../decisions/0143-a-notice-may-point-at-where-to-answer-it.md)).
  Nor is there a *delivery* notice: you are already looking at the tray when you ask, and a second
  toast per ask would double the noise the first one exists to reduce.
- **No merging of somebody else's board into yours.** See above.
- **No identity system.** Names are self-declared and unverified, as they have been since ADR 0011.
  The transport ids (peer and session) stay per-session; the only stable id is the **contributor id**
  ([`identity.ts`](../../electron/identity.ts)), which rides on contributed payloads only.
- **No room scoping.** There is one room, `eq-list`, and everything in the catalogue is offered to
  everyone in it. Group- or camp-scoped rooms are not built — see the open question in
  [decisions/README.md](../decisions/README.md).
- **No bulk transfer, still.** A `give` is one message, and nothing here chunks anything. The item
  catalogue is shared by making the *unit* small enough to fit rather than by splitting a big one:
  a **shard** is ~11 pages (~15 KB), which is a thing that means something rather than an arbitrary
  byte range ([ADR 0160](../decisions/0160-a-room-fills-the-catalogue-once.md)). A genuinely large
  single object — the game's spell file — remains unshareable and would still need the chunking
  nobody has written.

## See also
[architecture](../architecture/README.md) · [map](../map/README.md) ·
[testing](../testing/README.md) ·
[ADR 0011](../decisions/0011-awari-peer-location-sharing.md) ·
[ADR 0012](../decisions/0012-awari-connection-owned-by-main-window.md) ·
[ADR 0015](../decisions/0015-peer-presence-via-hello.md) ·
[ADR 0132](../decisions/0132-a-contribution-is-keyed-by-who-made-it.md) ·
[ADR 0141](../decisions/0141-the-room-is-a-meeting-place.md) ·
[ADR 0143](../decisions/0143-a-notice-may-point-at-where-to-answer-it.md) ·
[ADR 0144](../decisions/0144-state-is-asked-for-as-well-as-pushed.md) ·
[ADR 0145](../decisions/0145-a-room-checks-itself-and-needs-no-game.md) ·
[ADR 0146](../decisions/0146-one-home-for-the-peer-network.md)
