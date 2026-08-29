# 0160: A room fills the catalogue once

## Status

Accepted

Builds on [ADR 0153](./0153-the-catalogue-is-filled-by-a-gentle-trickle.md), which made the item
catalogue fillable at all, and narrows two refusals in
[ADR 0141](./0141-the-room-is-a-meeting-place.md): that a `give` is one whole kind, and that nothing
arriving from a peer is applied without somebody choosing it. Everything else in ADR 0141 stands —
the trust model, the toggles, the tray, and the rule that observations are tagged by contributor.

## Context

ADR 0153 priced the catalogue honestly: 11,136 pages, one a second, about three hours, and a ~10%
duty cycle on eqlwiki. That is a fair price for **one** person.

It is the wrong price for a room. Five people running it produce **55,680 requests** and five byte
-identical caches, because an item page is not anybody's data — it is a copy of a public page that
says the same thing to everyone. The fifth person's three hours buys the room nothing at all. And it
gets worse rather than better as the app is used by more people, which is the wrong direction for a
cost borne by somebody else's server.

The room already exists (ADR 0141) and already moves data peer-to-peer. Three things stood in the way
of using it:

- **A `give` is one kind, whole.** "Send me your item pages" is 33 MB in a message. The peers spec
  says so plainly: *"No bulk transfer… a wiki cache would need chunking, and does not have it."*
- **Nothing tells anybody who is fetching what**, so five clients would still race for the same pages.
- **Nothing from a peer is applied unasked**, and a fill that needed eleven thousand clicks is not a
  fill.

## Decision

**The roster is cut into shards, and a room divides them: you fetch what nobody has, you ask for what
somebody has, and each page is fetched from the wiki once across the whole room.**

- **A shard is a property of the title**, not a slice of a list: `shardOf(title)` is a hash of the
  folded name into 1024 buckets. The alternative — "you take the first two thousand" — needs every
  peer to agree on the roster's *order and length*, which they do not: rosters are fetched at
  different times and the category grows. One page added at the front would re-map everybody's work
  onto everybody else's. A hash needs no agreement and nothing to synchronise.
- **1024 shards, because that makes a shard about eleven pages** — small enough that one fits in a
  single peer message (~15 KB). That is what lets this exist **without** the chunked bulk transfer
  ADR 0141 correctly says we do not have: the shard *is* the chunk, and it is a unit that means
  something rather than an arbitrary byte range.
- **Coverage rides in the catalogue that was already being broadcast.** 1024 bits is 128 bytes — 256
  characters of hex — so "here is everything I hold" is a field in the minute-tick offer, not a
  transfer of its own. This is the entire coordination channel; there is no tracker and no election.
- **Peers spread out with no negotiation at all.** Each peer orders the gaps by `hash(shard, its own
  peer id)`, so two clients with identical information still walk the catalogue differently. This is
  the mechanism that prevents duplicate pulls; the published "I'm on shard N" claim is a refinement
  on top of it, with a TTL so a peer that crashes mid-shard doesn't reserve it for ever.
- **Asking beats fetching, always.** A peer's copy costs the wiki nothing and takes one message; the
  wiki costs eleven requests and a minute. A newcomer to a room that has done the work therefore
  catches up in minutes rather than hours, which is the single biggest thing this buys.
- **When every remaining gap is somebody's live claim, we wait.** Idling is the point: the
  alternative is fetching what the room is already fetching.
- **Completeness is always self-assessed.** A peer marks a shard held when it holds every title in
  **its own** roster for it — never because somebody said so. A peer whose roster has one title more
  than yours hands you their shard, you notice you are still short, and you fetch that page. A
  disagreement about the roster costs a page and never leaves a hole.
- **A fourth share family, `mirror`, and it is the one applied on arrival.** It can be, because there
  is nothing personal in it and nothing it changes about what the app *does*: these are copies of
  eqlwiki's own public pages, and the alternative to accepting one is asking eqlwiki the same
  question again. It is also the only family that is **checkable** — a page that looks wrong is
  re-fetched from the source, and the TTL does that unprompted.
- **Everything inbound is still read, hard.** `readSharedPage` rebuilds every field, caps every list,
  clamps every string, refuses any page that isn't an item or a recipe, and **never takes the
  sender's `fetchedAt`** — the receiver stamps its own, so a peer cannot reach into somebody else's
  cache expiry. Only pages inside their own TTL are offered, so a page cannot circulate between peers
  for ever without anybody re-checking it against the wiki.
- **Sharing is opt-in like every other kind**, off by default, and gated at the boundary. Asking is
  always allowed; handing over is a toggle.

## Consequences

**The wiki's bill stops scaling with the number of users.** A room of five that all fill goes from
55,680 requests to roughly 11,136 plus a little overlap — and the sixth person to join costs it
almost nothing. That is the whole point, and it is the strongest argument this app has ever had for
the room existing.

**Joining a room is now worth something immediately.** The strip shows the room's coverage as a
second bar behind your own, so a newcomer sees a nearly-full pale bar behind an empty solid one and
is told, before pressing anything, that filling will mostly come from peers.

**Two peers can still collide, and that is fine.** The per-peer ordering makes it unlikely rather
than impossible — with a handful of peers and hundreds of gaps it is rare, and when it happens the
cost is one duplicated shard, about eleven pages, with the published claims breaking the tie on the
next tick. Chasing certainty here would mean a lock, an election or a tracker, all of which are much
larger and all of which fail worse when a peer drops.

**A hostile peer can poison up to 64 item pages per message.** They are structurally validated,
confined to items, and expire on our own TTL — so the damage is bounded, temporary and self-healing,
and it is visible in a stat card that looks wrong. This is a real widening of the trust surface and
it is why the family is `mirror` rather than being folded in with observations: it is documented as
the one place we accept a third party's copy of a third party's page.

**The coverage bitmap is a protocol constant.** Changing `SHARD_COUNT` or the title fold invalidates
every bitmap in the room — peers would claim to hold shards whose contents they do not share. Both
are marked as never-change in the code, and a future change needs a version field in the offer.

**A shard containing an ungettable page is abandoned after one pass.** eqlwiki lists pages in
`Category:Items` that 404, and a shard holding one is never *complete* — which, before this was
handled, made the planner hand it back for ever and spin. Per-run rather than persisted, so a page
fixed next month is found next month.

**The peers spec's "no bulk transfer" is still true**, and deliberately so. Nothing here chunks
anything: a shard is one message because it was sized to be one. A genuinely large single object —
the game's spell file — remains unshareable, and would still need the chunking nobody has written.
