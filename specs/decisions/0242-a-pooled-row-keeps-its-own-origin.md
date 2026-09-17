# 0242: A pooled row keeps its own origin, so it can be handed on

## Status

Accepted

## Context

[ADR 0132](./0132-a-contribution-is-keyed-by-who-made-it.md) made pooling durable: a contributor has
an id, `contributions.ts` files their whole tally under it, and a peer who stops sharing does not
retract what they already taught us. [ADR 0141](./0141-the-room-is-a-meeting-place.md) then made the
room a meeting place — a peer offers a catalogue, and the data itself travels on request, peer to
peer, over the asker's own connection.

Put those together and a real gap falls out. Say P1 asks P2 for `mobs`, gets an answer, and files it —
durably, exactly as ADR 0132 promised. P2 then leaves. P3 joins later and asks P1 for `mobs`. What P1
sends back is read off `killLog.observations()`: **its own kills, and nothing it pooled from anyone
else.** P2's tally sits on P1's disk, correctly credited, and is never offered to a third party. The
room does not accumulate a body of knowledge the way ADR 0132's own consequences said it would
("what they shared last week and what they share tonight are one sample, and it is still here on a
night nobody is online") — it accumulates a body of knowledge *nobody two hops away can ever see*.

The same gap exists for `kills` (`peer-kills.ts`'s pool is never re-offered) and, worse, for
`respawns`: nothing in `ipc.ts`'s `fileContribution` handled that kind at all, so a peer's answer was
read off the wire, validated, and then silently thrown away — the third `observation` kind existed in
`SHARE_KINDS` and had no receiving store behind it.

Fixing the offer is not simply "read the pooled store too." A `mobs`/`kills` row is filed under the
id of *whoever it is credited to* (`by`/`byId`, stamped by `mob-knowledge.ts`/`peer-kills.ts`'s
`credit`), and today that credit is a **display-only** fact: it is added when `pooled()` is read for
a panel or the admin view, and it never leaves on the wire. `SharedKill`'s own doc comment says so —
"Filled in on receipt — never sent inside the kill." Relaying P2's rows to P3 under P1's own identity
would make P1 look like the observer of everything it has ever pooled, and — the sharper problem — if
P3 is *also* directly connected to P2, the same kills would be counted once "from P2" and once "from
P1," inflating a drop rate with one sample counted twice. The whole reason ADR 0132 keeps pooled data
apart from your own is to keep a sample honest; a relay that loses provenance breaks that on the first
hop.

## Decision

**A pooled row's origin travels with it, and storage is keyed by that origin — not by whoever handed
it to us most recently.**

- `by`/`byId` — already present on `MobObservation` and `SharedKill` for the *display* case, added to
  a new `SharedRespawn` (`Omit<RespawnLearning, "gaps" | "crossedDifficulty"> & {by?, byId?}`) — now
  also **cross the wire**. `readMobObservation`/`readSharedKill`/`readRespawn` (`peer-share.ts`) read
  them off an inbound row through a shared `readOrigin` helper; absent for a row the sender genuinely
  observed themself, exactly as before.
- `SHARE_KINDS`' `rowKey` for `mobs`/`kills`/`respawns` folds the origin into the key
  (`mob+zone+origin`, `zone+mob+y+x+origin`, `key+origin`). Without this, our own tally for a mob and
  a relayed one for the same mob would collide in `measure()`'s keyed state and one would silently
  disappear from what we offer.
- `shareSources` (`peer-share-hub.ts`) now reads **two** stores for each of these three kinds: our
  own (`killLog`/`spawns`), and the pooled half (`mobKnowledge.pooled()` / `peerKills.all()` /
  `peerRespawns.all()`) — already credited to the true origin by `contributions.ts`'s existing
  `credit`. `kills`/`respawns` no longer state their reduction (`shareableKills`/`shareableRespawns`)
  as a `SHARE_KINDS` `project`: a pooled row already arrived reduced, on the machine that saw it, and
  running the reduction again would silently strip the `byId` it is carrying. The reduction now runs
  once, over our own rows only, inside `shareSources`.
- **Receiving a relay is where the honesty is enforced.** `electron/ipc.ts`'s `fileContribution` no
  longer files a whole `give` under the sender's contributor id. `groupByOrigin`
  (`src/shared/contributors.ts`) splits the batch by each row's `byId` — falling back to the sender
  for a row naming none — and each origin's rows are filed as their own `report()`. That keeps
  `contributions.ts`'s rule 2 ("a report replaces that contributor's set") true **per origin** rather
  than per peer we happen to be talking to, which is what stops the double-count above: P3 holds one
  bucket keyed `P2`, replaced whole however many hops the freshest copy travelled through, never two.
  `byId` **fails closed** the same way `readContributor` already does — a value that isn't a shape we
  mint ourselves (`isContributorId`) is not trusted as somebody else's identity, and falls back to the
  sender.
- **`respawns` gets a receiving store for the first time.** `electron/peer-respawns.ts` mirrors
  `peer-kills.ts` exactly: keyed by contributor, replaced per report, vetted (`sanitizeRespawns`),
  capped, kept when a peer stops sharing (`contributions.ts`'s five rules).
- **`ContributionStore` gains `version()`** — a counter bumped on `report`/`forget`/`removeItem` — so
  `mobs`/`kills`' cheap `ShareSource.version` short-circuit (ADR 0171) still holds once it also has to
  answer for the pooled half: two non-decreasing counters summed can only fail to move when *neither*
  moved, so `killLog.version() + mobKnowledge.version()` stays honest without inventing a combinator.
  `respawns` stays unversioned, as it already was — nothing here is expensive enough yet to be worth
  the risk of getting a new one wrong.

**A second, smaller gap closed the same trip: an `authored` give (`watches`/`styles`/`lists`/`pins`)
lived only in the tray's in-memory `Map`, gone after the half-hour sweep or any restart.** Neither of
ADR 0141's rules for this family changes — nothing here is ever applied automatically, and nothing
here is ever handed to a third peer. `electron/peer-archive.ts` remembers **the last thing each name
handed over**, per kind, on disk — keyed by display name rather than a contributor id, since authored
data carries no id at all (ADR 0132 stamps one only on `mobs`/`kills`/`respawns`). `received()` folds
an archived entry in only for a name with no *live* tray entry for that exact kind, under a pseudo
peer id (`archived:<name>`) the existing "not currently reachable" UI affordance
(`PeerTray.tsx`'s `knownPeerIds`) already renders correctly with no changes of its own. `clear()`
grew the matching half: no peer named clears every archived name (for a kind, or everything); the
pseudo id clears one.

## Consequences

- The room now behaves the way ADR 0132's own consequences said it would: what P2 taught P1 outlives
  P2's session and is there for P3, and an authored share outlives the tray's half-hour and a
  restart, without either being applied on arrival or handed to somebody who never asked P2 or P1 for
  it.
- `respawns` goes from a kind that existed in name only — offered, asked for, answered, and thrown
  away on arrival — to one that actually pools, the same as its two siblings.
- **The attack surface widens slightly, in a way ADR 0132 already accepted the shape of.** A peer
  could claim a `byId` naming a real contributor they are not, attributing fabricated rows to that id
  the next time anyone pools from us. This costs the same thing a peer lying about their *own* report
  already could — no trust score exists, and none is added here — bounded to whatever a hostile peer
  could already do by reporting garbage under an id of their own choosing. Not bounded further,
  because nothing here can tell a stranger's honest relay from a liar's, and a fabricated trust signal
  would be worse than none (ADR 0132's own reasoning, unchanged).
- **Authored data is keyed by an even weaker signal — a self-declared name, unverified.** A rename
  starts a fresh archive entry; two players who chose the same name share one. Accepted for the reason
  `contributions.ts` already accepts a name as a *label*: remembering something under a shaky key is
  better than remembering nothing.
- `live` (`timers`/`buffs`/`scores`) is untouched by either half of this decision, on purpose — a
  saved countdown or buff from an hour ago is not stale-but-useful, it is simply wrong, and `mirror`
  (`items`/`spells`/`gameTime`) already persisted and already relayed correctly before this (a page a
  peer hands on came from the same page cache a peer's own fetch would have filled).
- What is *not* decided here: nothing lets a person see, from the Peers tab, which of two contributors
  behind one merged rate is the direct connection and which arrived by relay — `provenanceOf`
  (`pooling.ts`, ADR 0132) already shows a contributor's own weight in a rate, and that stays true
  regardless of how many hops their data travelled to reach it.
