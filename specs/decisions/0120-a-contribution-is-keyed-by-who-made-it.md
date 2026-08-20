# 0120: A contribution is keyed by who made it, and kept

## Status

Accepted

## Context

Pooling with peers was built as a live feature and has been running as one since
[ADR 0024](./0024-mob-knowledge.md): the map window joins a room, peers broadcast their observations
and kill positions, and what arrives is drawn. As a way of showing a camp to the people sitting at it
that works. As a way of *accumulating what everyone knows* — which is what the pooling is for — it
had four holes, and they compound:

- **A display name was the primary key.** `mob-knowledge.report(by, …)` filed a tally under the name
  the sender announced. Two players called "Bob" were one row, adding their samples together as
  though one person had killed twice as much. A rename orphaned a tally under the old name and
  started a fresh one. And anyone could file observations under anybody else's tally by typing that
  name into Settings — not a serious attack, but the key had no property that made it a key.
- **Shared kill positions were never stored at all.** They lived in the map window's React state,
  were cleared when the connection blinked, and vanished when the window closed. An evening beside
  someone who had camped a spot for a month taught this install nothing that outlived the session.
- **Reception depended on a window being open.** Observations were filed by the *map* window, so
  connecting without opening the map pooled nothing.
- **Un-sharing erased history.** Turning the toggle off broadcasts an empty tally, and an empty
  report replaced the stored one — so a peer who stopped sharing deleted everything they had ever
  taught us, on data nothing of ours can rebuild.

The goal these are all in the way of is a real one: a body of knowledge about kill locations, drops,
and eventually levels and hit points, built from many players over months. Every hole above is a way
that body of knowledge silently fails to accumulate.

The thing that makes all of this delicate is that a contribution is **useful and unverifiable**. Six
players' kills of the same mob are one much better sample; they are also six claims we cannot check.
The existing answer to that — keep peers' data apart from your own and credit every merged figure —
is right and is kept. It just needs a key it can rest on.

## Decision

**A contributor has an id, and everything they tell us is filed under it.**

- **`src/shared/contributors.ts`** — a contributor is `{id, name}`, and the two do different jobs.
  `id` is minted once per install (`c-` + a UUID, `electron/identity.ts`, its own file so resetting
  settings doesn't quietly make you a different person). `name` is a **label**: shown, refreshed on
  every report, never a key. Reading an identity off a payload **fails closed** — a peer who
  announces no id is nobody, and is not filed under their name as before.
- **Deliberately not the awari peer id.** [ADR 0015](./0015-peer-presence-via-hello.md) keeps that
  one per-session so a player can't be followed between sessions, and that stands: this id
  identifies *a source of data we keep*, not a connection. Which is also why it rides **only on the
  contributed payloads** (`mobs`, `kills`) and never on `hello` — connect to the room without
  sharing and nothing stable about you is broadcast at all.
- **`electron/contributions.ts`** — one store factory, five rules, shared by pooled observations and
  shared kill positions because both want exactly these and a drifted pair would mean one store
  crediting a peer the other had forgotten: keyed by id; a report **replaces** that contributor's
  set (everyone sends whole tallies, so adding would double-count); an **empty report keeps what it
  taught** and only moves `seenAt`, per [ADR 0056](./0056-a-dropped-record-keeps-what-it-taught.md);
  arrivals are **vetted** and the impossible discarded rather than clamped (`estimates.ts` rule 2 —
  a drop counted more often than the mob was killed is not a weak claim, it's an impossible one);
  and each contributor is **capped**.
- **`electron/peer-kills.ts`** — shared kill positions become a store. Safe to keep precisely
  because of what a shared kill carries: no time and no loot (see `sharedAsKill`), so the worst a
  bad one can do is draw a marker in the wrong place, where a bad *observation* would move a rate.
- **Main files contributions, not a window.** `registerPeerIpc` stamps our id onto outbound
  contributions and files inbound ones as they arrive, then broadcasts `peerDataChanged`. The map
  reads peers' kills back through `usePeerKills` like any other stored data.
- **`src/shared/pooling.ts`** — what "useful but not wholly trusted" means, in code. Provenance is
  **shown, not scored** (`provenanceOf`, by kills rather than by heads, so the chattiest contributor
  isn't the loudest); the merge now carries `myCount` per drop so a pooled rate can be split back
  into your evidence and theirs; and where the two plainly disagree it is **reported, not resolved**
  (`estimates.ts` rule 5), only when both samples are big enough for the difference to mean
  something.
- **No trust score per peer.** It would look authoritative and be made up: nothing here can tell an
  unlucky streak from a liar, and a fabricated number in front of a real one is worse than no
  number.
- **Migration.** `mob-knowledge.json`'s old `{peers: {name: […]}}` is re-keyed in place to
  `name:bob` — an id honest about being "whoever was calling themselves Bob". Months of other
  people's kills are not thrown away to tidy up a key, and the legacy row simply stops growing once
  that peer reports under a real id.

## Consequences

- Pooling accumulates. A contributor recognised across sessions, renames and reconnects means what
  they shared last week and what they share tonight are one sample, and it is still here on a night
  nobody is online.
- The heatmap gains everyone's kills permanently, and the map window stops being load-bearing for
  data reception.
- **The id is stable, which is a real privacy change** from ADR 0015's per-session id. It is
  mitigated rather than eliminated: nothing about it is derived from you, it is broadcast only when
  you have opted into sharing data, and forgetting a contributor removes them from both stores.
  Somebody who shares data can be recognised as the same contributor across sessions — that is the
  feature, and it should stay opt-in for that reason.
- A duplicate sample is possible during the migration window (a legacy `name:` row plus that peer's
  new id-keyed one). Chosen over the alternative, which was deleting unrecoverable data; the
  provenance is visible either way.
- Un-sharing no longer retracts. `forgetPeers(id?)` is the deliberate retraction, and now takes both
  stores together since they hold two halves of one contribution.
- What is *not* decided here: nothing weights a contributor, and nothing lets you veto one peer's
  numbers while keeping another's — the open question ADR 0024 left. This makes both answerable,
  because there is finally something stable to hang them on.
