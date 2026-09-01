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
    toggle state. The envelope also carries our name and our **protocol** (`SHARE_PROTOCOL`) — both
    ride here rather than in a message of their own because the catalogue comes round every minute,
    so a peer who missed one is put right within it.
  - `ask` / `give` — peer-routed (`publish({type:"peer", peer})`). `ask` names a kind, the revision
    the asker already has, and the **epoch** that revision was counted in; `give` answers in one of
    three moods — *unchanged* (no rows at all), *whole* (every row, plus their keys), or *delta*
    (`changes` and `gone`, naming rows by key). The `items` kind is the one exception to "a kind,
    whole": nobody wants eleven thousand pages in a message, so its `ask` names a **shard** and its
    `give` answers with that ~11-page slice
    ([ADR 0160](../decisions/0160-a-room-fills-the-catalogue-once.md)) — and never a delta, a shard
    being the small unit already. A `give` with no rows means "unchanged", which is kept distinct
    from a `give` of none (that means "now empty", which
    [ADR 0056](../decisions/0056-a-dropped-record-keeps-what-it-taught.md) reads as an un-share).
  - **A delta is a saving on the wire and nothing else**
    ([ADR 0171](../decisions/0171-a-shared-kind-states-what-a-row-is.md)). It is folded into what we
    already hold from that peer, and the **whole** set is handed onwards — so `contributions.ts`'s
    five rules, the tray and every panel's merge receive exactly what they always received, and no
    store knows deltas exist. It is refused, and the whole kind sent instead, whenever it cannot be
    trusted: a mismatched `epoch` (either side restarted), a `since` older than the tombstones reach,
    or nothing held for that peer at all. A peer too old to send an epoch is never sent a delta.
  - `SHARE_KINDS` — the table every rule is driven off: label, blurb, family, and — per kind — a
    `read`, a `rowKey` and a `project`. **A kind with no reader cannot be received**, which is how a
    new kind fails closed rather than arriving unchecked. `rowKey` says what a row *is*, so a delta
    can name one; it is content-derived throughout, because every `authored` kind has its ids
    regenerated on arrival and an id would name nothing on the far side (`watches` declares none — a
    rule has no name, so its identity is its whole content). `project` says what *leaves*, and runs
    before anything is keyed, so a change to a field that never travels does not look like news: the
    kill filter, the respawn reduction to a conclusion, and the buff's `ON_YOU` all live there now
    rather than in three places in the hub
    ([ADR 0171](../decisions/0171-a-shared-kind-states-what-a-row-is.md)).
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
    re-fetched from the source, and the TTL does that unprompted. The kinds that may cross are
    `item | recipe | mob | quest | zone` — the pages the item catalogue is made of. Zones and quests
    are there because an item's *level* is read off them, and a **zone page is the largest thing that
    travels** (Kael Drakkel lists 508 NPCs, which is why the roster is capped)
    ([ADR 0163](../decisions/0163-an-item-wears-the-level-of-what-drops-it.md)). Spells stay refused:
    nothing in the Items tab reads one. It is also the **one kind that is
    on by default** ([ADR 0161](../decisions/0161-a-public-page-is-shared-by-default.md)): every other
    kind is something you made, saw, or are doing right now, and this one has nothing of yours in it —
    so "off until asked" protects nothing while costing the room the whole saving. The toggle still
    works, and an explicit *off* stays off. A page **carries its age**, clamped on arrival to no later
    than the receiver's clock, so relaying cannot reset the clock and a page past its TTL is refused
    rather than cached. **The newest pull wins**: a copy fetched more recently than ours replaces it,
    and its date becomes our expiry clock, so one person's re-pull refreshes the room rather than N
    installs re-fetching the same page within days of each other
    ([ADR 0164](../decisions/0164-the-newest-copy-in-the-room-wins.md)). Nothing chases a refresh —
    expiry makes a shard incomplete, and the planner then fills that gap from a peer before the wiki.
- **The hub** (`electron/peer-share.ts`) — in main, because main is the only participant always
  running: a hub that answered only while a window was open would drop every ask the moment you
  changed tab. It measures the catalogue on a slow tick (a digest moving *is* the change, so no
  store has to be taught to call it), answers asks after re-checking the toggle against the
  settings rather than the published offer, files observations, and holds everything else in a
  received tray with a TTL. A store *may* volunteer a cheap `version`, and where one does the
  measurement is skipped while it holds still — only the kill log does, because only it was expensive
  (`observations()` folds the whole log, `kills()` scans five thousand records, and both were paid
  for once a minute whether or not a mob had died). `timers`, `buffs` and `scores` deliberately do
  not: they are views over a clock, so a save-based version would claim "unchanged" about rows that
  had changed. It does **not** decide when to re-join: that needs the transport, so it
  lives with the session (ADR 0162).
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
  `give` or a restart heals instead of leaving two installs disagreeing for ever. It is stated as a
  comparison of what *is* rather than a reaction to an event, which is the shape that cannot drift.
  The catalogue carries our **name** as well as `hello` does, so a peer who missed the one greeting
  stops being "Someone (3f9a)" within the minute. **No keepalive of our own**: awari heartbeats every
  connection every two seconds, and a second one would mask the drops the first exists to detect.
- **A room of one is checked, not guessed at**
  ([ADR 0162](../decisions/0162-a-room-of-one-is-checked-not-guessed-at.md)) — the cure for "two
  people running the app who cannot see each other until, at some point, they can". Two clients that
  start together each become the genesis leader of their own room under the one id, and from the
  inside a room you made and a room nobody has joined yet look identical. So after a rung of
  [`room-watch.ts`](../../src/shared/room-watch.ts)'s ladder (20s / 45s / 90s / 3m / 5m, jittered,
  holding at five minutes) elapses alone, the client **probes**: awari's read-only `pingRoomStatus`
  asks the directory who leads this room and asks them who is in it. **Somebody answered** means the
  room the world can find is not ours — proven, not suspected — and we re-join into it. **Nobody
  answered** means the leader the directory names is unreachable, and the likeliest unreachable
  leader is us, since a peer cannot dial itself; so we are the room everyone will find, and being
  alone means alone. That asymmetry is why only the wrong client ever moves and the split cannot
  re-race. **Company refunds the ladder**, and looking is not re-joining — which is what lets the
  ladder run for ever without a solitary player ever losing their session.
- **The game does not need to be running.** The room is joined off a setting, and the character name
  is read off the *filename* of the newest log in the folder — announced before a line is parsed — so
  you can sit in a room with EverQuest closed. The only gap is a fresh install that has never played,
  which has no name to announce; the Peers tab carries the name field for exactly that.
- **The Peers tab** (`src/app/components/PeersPanel.tsx`, with `PeerTray` and `PeerScores`) — **the
  one home for the whole feature** ([ADR 0146](../decisions/0146-one-home-for-the-peer-network.md) ·
[ADR 0171](../decisions/0171-a-shared-kind-states-what-a-row-is.md) ·
[ADR 0162](../decisions/0162-a-room-of-one-is-checked-not-guessed-at.md)).
  It was scattered across three screens for a while: the connection and the name in Settings (where
  ADR 0011 left them), two share toggles on the map toolbar, the rest here. A control now lives
  exactly once, and it lives here. Five sections, in the order the questions get asked:
  **Your connection** (connect, the real status light, who you appear as, Retry connection, and the
  bootstrap URL behind a `<details>`), **What you share** (live location first — the one thing that
  is broadcast rather than handed over, and the only share that needs the game running — then a
  toggle per kind, all off by default except *Item pages* — see the `mirror` family), **Who's here** (what each peer offers, and their zone as a
  button that opens the map there), **What's arrived**, and the **scoreboard comparison**.
- **Saying when you are the old one**
  ([ADR 0172](../decisions/0172-a-room-says-when-you-are-the-old-one.md)). `SHARE_PROTOCOL` is a
  hand-bumped number — deliberately not the app version, which CI moves on every push — and a peer
  that names none is speaking the first one, which is every build from before it existed. Meeting a
  **newer** protocol raises one toast, once a session, coalesced across everyone who is ahead: this
  install is the one falling back, and that is a thing a person can fix. Meeting an **older** one
  raises nothing — nobody reading it could act on it (ADR 0143's second narrowing) — and instead
  marks that peer's row in the tab, which is also where the newer case is recorded durably, since a
  toast that has faded is no use on a later evening.

  The limit is worth stating: a client too old to understand a message is too old to contain the code
  that would notice, so **this does nothing for the builds already out there**. It is paid for now
  because it cannot be paid for later. It is also not the update banner
  ([ADR 0034](../decisions/0034-update-notification.md)) — that says a release exists and offers a
  download; this says sharing with these specific people is degraded right now.
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
- **No bulk transfer, still.** A `give` is one message, and nothing here chunks anything. A delta
  makes the *usual* message small — what moved rather than what is held — but a first exchange is
  still the whole kind in one message, and that is what the caps are for. The item catalogue is
  shared by making the *unit* small enough to fit rather than by splitting a big one: a **shard** is
  ~11 pages (~15 KB), which is a thing that means something rather than an arbitrary byte range
  ([ADR 0160](../decisions/0160-a-room-fills-the-catalogue-once.md)). A genuinely large single
  object — the game's spell file — remains unshareable and would still need the chunking nobody has
  written.
- **No sequence numbers on disk.** An epoch is per-run, so a restart costs one whole exchange exactly
  as it always did. Making a delta survive a restart would mean every shared store learning to write
  a sequence number, and the saving is in the evening rather than in the launch
  ([ADR 0171](../decisions/0171-a-shared-kind-states-what-a-row-is.md)).

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
